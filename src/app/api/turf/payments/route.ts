import { createClient } from "@/lib/supabase/server";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
    return typeof value === "string"
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
    let sameOrigin = false;
    try {
        const origin = request.headers.get("origin");
        sameOrigin = origin !== null && new URL(origin).origin === new URL(request.url).origin;
    } catch {
        sameOrigin = false;
    }
    if (!sameOrigin) return Response.json({ error: "Request could not be verified." }, { status: 403 });

    let payload: unknown;
    try {
        payload = await request.json();
    } catch {
        return Response.json({ error: "Payment details are invalid." }, { status: 400 });
    }
    if (!isRecord(payload)
        || !isUuid(payload.bookingId)
        || typeof payload.method !== "string"
        || !["bkash", "nagad", "rocket", "bank_transfer", "other"].includes(payload.method)
        || typeof payload.reference !== "string"
        || payload.reference.trim().length < 1
        || payload.reference.trim().length > 200
        || typeof payload.amount !== "number"
        || !Number.isFinite(payload.amount)
        || payload.amount <= 0
        || payload.amount > 100000000
        || (payload.note !== null && typeof payload.note !== "string")
        || (typeof payload.note === "string" && payload.note.length > 2000)
        || !isUuid(payload.idempotencyKey)) {
        return Response.json({ error: "Complete the required payment details." }, { status: 400 });
    }

    try {
        const supabase = await createClient();
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) {
            return Response.json({ error: "Sign in to submit payment details." }, { status: 401 });
        }
        const { data, error } = await supabase.rpc("turf_submit_advance_payment", {
            p_booking_id: payload.bookingId,
            p_payment_method: payload.method,
            p_transaction_reference: payload.reference.trim(),
            p_amount: payload.amount,
            p_note: typeof payload.note === "string" ? payload.note.trim() || null : null,
            p_idempotency_key: payload.idempotencyKey,
        });
        if (error) {
            console.error("Turf advance payment submission was rejected.", { code: error.code });
            if (error.code === "42501") return Response.json({ error: "You cannot submit payment for this booking." }, { status: 403 });
            if (error.code === "22023") return Response.json({ error: "Payment details or payment method are no longer valid." }, { status: 400 });
            if (error.code === "55000") return Response.json({ error: "This booking is not accepting payment submissions right now." }, { status: 409 });
            return Response.json({ error: "Payment details could not be submitted. Please try again." }, { status: 503 });
        }
        return Response.json({ payment: data }, {
            status: 201,
            headers: { "Cache-Control": "private, no-store" },
        });
    } catch (error) {
        console.error("Turf payment service is unavailable.", error);
        return Response.json({ error: "Payment details could not be submitted. Please try again." }, { status: 503 });
    }
}
