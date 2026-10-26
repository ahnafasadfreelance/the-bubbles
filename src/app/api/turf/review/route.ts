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
        return Response.json({ error: "Review details are invalid." }, { status: 400 });
    }
    if (!isRecord(payload)
        || (payload.kind !== "booking" && payload.kind !== "payment")
        || !isUuid(payload.id)
        || typeof payload.decision !== "string"
        || !["approve", "reject", "verify"].includes(payload.decision)
        || (payload.reason !== null && typeof payload.reason !== "string")
        || (typeof payload.reason === "string" && payload.reason.length > 1000)
        || (payload.decision === "reject" && (typeof payload.reason !== "string" || payload.reason.trim().length < 3))
        || (payload.kind === "booking" && payload.decision === "verify")
        || (payload.kind === "payment" && payload.decision === "approve")) {
        return Response.json({ error: "Review details are incomplete or invalid." }, { status: 400 });
    }

    try {
        const supabase = await createClient();
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) {
            return Response.json({ error: "Sign in to manage turf bookings." }, { status: 401 });
        }
        const result = payload.kind === "booking"
            ? await supabase.rpc("turf_review_booking_request", {
                p_booking_id: payload.id,
                p_decision: payload.decision,
                p_reason: typeof payload.reason === "string" ? payload.reason.trim() || null : null,
            })
            : await supabase.rpc("turf_review_advance_payment", {
                p_payment_id: payload.id,
                p_decision: payload.decision,
                p_reason: typeof payload.reason === "string" ? payload.reason.trim() || null : null,
            });

        if (result.error) {
            console.error("Turf staff review was rejected.", { code: result.error.code });
            if (result.error.code === "42501") return Response.json({ error: "Turf staff access is required." }, { status: 403 });
            if (result.error.code === "22023") return Response.json({ error: "Provide a valid reason and review decision." }, { status: 400 });
            if (result.error.code === "55000") return Response.json({ error: "This item cannot be reviewed in its current state." }, { status: 409 });
            return Response.json({ error: "The review could not be saved. Refresh and try again." }, { status: 503 });
        }
        return Response.json({ result: result.data }, {
            headers: { "Cache-Control": "private, no-store" },
        });
    } catch (error) {
        console.error("Turf review service is unavailable.", error);
        return Response.json({ error: "The review could not be saved. Please try again." }, { status: 503 });
    }
}
