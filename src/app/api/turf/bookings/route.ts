import { createClient } from "@/lib/supabase/server";

type BookingRequest = {
    startsAt: string;
    endsAt: string;
    mode: "hourly" | "fixed";
    customerName: string;
    customerPhone: string;
    playerCount: number;
    customerNote: string | null;
    policyVersionId: number;
    policyAccepted: boolean;
    fixedSlotId: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value);
}

function isTimestamp(value: unknown): value is string {
    return typeof value === "string"
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
        && Number.isFinite(Date.parse(value));
}

function parseBookingRequest(value: unknown): BookingRequest | null {
    if (!isRecord(value)
        || !isTimestamp(value.startsAt)
        || !isTimestamp(value.endsAt)
        || (value.mode !== "hourly" && value.mode !== "fixed")
        || typeof value.customerName !== "string"
        || value.customerName.trim().length < 1
        || value.customerName.trim().length > 200
        || typeof value.customerPhone !== "string"
        || !/^[+0-9][0-9 ()-]{7,24}$/.test(value.customerPhone.trim())
        || !isInteger(value.playerCount)
        || value.playerCount < 1
        || value.playerCount > 100
        || (value.customerNote !== null && typeof value.customerNote !== "string")
        || (typeof value.customerNote === "string" && value.customerNote.length > 2000)
        || !isInteger(value.policyVersionId)
        || value.policyVersionId < 1
        || value.policyAccepted !== true
        || (value.fixedSlotId !== null && typeof value.fixedSlotId !== "string")
        || (value.mode === "fixed" && typeof value.fixedSlotId !== "string")
        || (value.mode === "hourly" && value.fixedSlotId !== null)) {
        return null;
    }

    return {
        startsAt: value.startsAt,
        endsAt: value.endsAt,
        mode: value.mode,
        customerName: value.customerName.trim(),
        customerPhone: value.customerPhone.trim(),
        playerCount: value.playerCount,
        customerNote: typeof value.customerNote === "string" ? value.customerNote.trim() || null : null,
        policyVersionId: value.policyVersionId,
        policyAccepted: true,
        fixedSlotId: typeof value.fixedSlotId === "string" ? value.fixedSlotId : null,
    };
}

export async function POST(request: Request) {
    const origin = request.headers.get("origin");
    let sameOrigin = false;
    try {
        sameOrigin = Boolean(origin) && new URL(origin!).origin === new URL(request.url).origin;
    } catch {
        sameOrigin = false;
    }
    if (!sameOrigin) {
        return Response.json({ error: "Request could not be verified." }, { status: 403 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: "Booking details are invalid." }, { status: 400 });
    }
    const booking = parseBookingRequest(body);
    if (!booking) {
        return Response.json({ error: "Complete the required booking details and accept the current policy." }, {
            status: 400,
        });
    }

    try {
        const supabase = await createClient();
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) {
            return Response.json({ error: "Sign in with Google before requesting a booking." }, { status: 401 });
        }

        const { data, error } = await supabase.rpc("turf_create_booking_request", {
            p_starts_at: booking.startsAt,
            p_ends_at: booking.endsAt,
            p_booking_mode: booking.mode,
            p_customer_name: booking.customerName,
            p_customer_phone: booking.customerPhone,
            p_player_count: booking.playerCount,
            p_customer_note: booking.customerNote,
            p_policy_version_id: booking.policyVersionId,
            p_policy_accepted: booking.policyAccepted,
            p_fixed_slot_id: booking.fixedSlotId,
        });
        if (error) {
            console.error("Turf booking request was rejected.", { code: error.code });
            if (error.code === "23P01") {
                return Response.json({ error: "That time was just booked. Please choose another slot." }, { status: 409 });
            }
            if (error.code === "42501") {
                return Response.json({ error: "Your account cannot make this booking. Check your Google sign-in." }, { status: 403 });
            }
            if (error.code === "22023") {
                return Response.json({ error: "Some booking details are no longer valid. Refresh availability and try again." }, { status: 400 });
            }
            if (error.code === "55000") {
                return Response.json({ error: "Online booking is not available yet." }, { status: 503 });
            }
            return Response.json({ error: "Your booking could not be submitted. Please try again." }, { status: 503 });
        }
        return Response.json({ booking: data }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
        console.error("Turf booking service is unavailable.", error);
        return Response.json({ error: "Your booking could not be submitted. Please try again." }, { status: 503 });
    }
}
