import { createClient } from "@/lib/supabase/server";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
    return typeof value === "string"
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isTimestamp(value: unknown): value is string {
    return typeof value === "string"
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
        && Number.isFinite(Date.parse(value));
}

function isSameOrigin(request: Request) {
    try {
        const origin = request.headers.get("origin");
        return origin !== null && new URL(origin).origin === new URL(request.url).origin;
    } catch {
        return false;
    }
}

async function parseBody(request: Request) {
    try {
        return await request.json() as unknown;
    } catch {
        return null;
    }
}

function rpcError(error: { code: string }) {
    if (error.code === "42501") return Response.json({ error: "Turf staff access or booking ownership is required." }, { status: 403 });
    if (error.code === "22023") return Response.json({ error: "Change request details are invalid." }, { status: 400 });
    if (error.code === "23P01") return Response.json({ error: "The requested time conflicts with the current schedule." }, { status: 409 });
    if (error.code === "55000") return Response.json({ error: "This request cannot be completed in the current state." }, { status: 409 });
    if (error.code === "P0002") return Response.json({ error: "The booking or request could not be found." }, { status: 404 });
    return Response.json({ error: "The change could not be saved. Refresh and try again." }, { status: 503 });
}

export async function POST(request: Request) {
    if (!isSameOrigin(request)) return Response.json({ error: "Request could not be verified." }, { status: 403 });
    const payload: unknown = await parseBody(request);
    if (!isRecord(payload)
        || !isUuid(payload.bookingId)
        || (payload.requestType !== "cancellation" && payload.requestType !== "reschedule")
        || typeof payload.reason !== "string"
        || payload.reason.trim().length < 3
        || payload.reason.length > 1000
        || (payload.requestType === "cancellation" && (payload.startsAt != null || payload.endsAt != null))
        || (payload.requestType === "reschedule" && (!isTimestamp(payload.startsAt) || !isTimestamp(payload.endsAt)))) {
        return Response.json({ error: "Complete the required booking change details." }, { status: 400 });
    }

    try {
        const supabase = await createClient();
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) return Response.json({ error: "Sign in to request a booking change." }, { status: 401 });
        const { data, error } = await supabase.rpc("turf_request_booking_change", {
            p_booking_id: payload.bookingId,
            p_request_type: payload.requestType,
            p_reason: payload.reason.trim(),
            p_requested_starts_at: typeof payload.startsAt === "string" ? payload.startsAt : null,
            p_requested_ends_at: typeof payload.endsAt === "string" ? payload.endsAt : null,
        });
        if (error) return rpcError(error);
        return Response.json({ result: data }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
        console.error("Turf booking change request failed.", error);
        return Response.json({ error: "The change request could not be saved. Please try again." }, { status: 503 });
    }
}

export async function PATCH(request: Request) {
    if (!isSameOrigin(request)) return Response.json({ error: "Request could not be verified." }, { status: 403 });
    const payload: unknown = await parseBody(request);
    if (!isRecord(payload)
        || !isUuid(payload.requestId)
        || (payload.decision !== "approve" && payload.decision !== "reject")
        || typeof payload.reason !== "string"
        || payload.reason.trim().length < 3
        || payload.reason.length > 1000) {
        return Response.json({ error: "Review details are incomplete or invalid." }, { status: 400 });
    }
    const refundAmount = payload.refundAmount == null || payload.refundAmount === ""
        ? null
        : typeof payload.refundAmount === "number" && Number.isFinite(payload.refundAmount)
            ? payload.refundAmount
            : typeof payload.refundAmount === "string" && /^\d{1,10}(?:\.\d{1,2})?$/.test(payload.refundAmount)
                ? Number(payload.refundAmount)
                : NaN;
    if (Number.isNaN(refundAmount)
        || (refundAmount !== null && (
            refundAmount <= 0
            || !Number.isFinite(refundAmount)
            || Math.abs(refundAmount * 100 - Math.round(refundAmount * 100)) > 0.0000001
        ))
        || (payload.decision === "reject" && refundAmount !== null)
        || (refundAmount === null && (payload.refundMethod || payload.refundReference))
        || (refundAmount !== null
            && (typeof payload.refundMethod !== "string" || payload.refundMethod.trim().length < 1 || payload.refundMethod.length > 100
                || typeof payload.refundReference !== "string" || payload.refundReference.trim().length < 1 || payload.refundReference.length > 200))) {
        return Response.json({ error: "Refund amount, method, and reference must be provided together." }, { status: 400 });
    }

    try {
        const supabase = await createClient();
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) return Response.json({ error: "Sign in to review booking changes." }, { status: 401 });
        const { data, error } = await supabase.rpc("turf_review_booking_change", {
            p_request_id: payload.requestId,
            p_decision: payload.decision,
            p_reason: payload.reason.trim(),
            p_refund_amount: refundAmount,
            p_refund_method: typeof payload.refundMethod === "string" ? payload.refundMethod.trim() || null : null,
            p_refund_reference: typeof payload.refundReference === "string" ? payload.refundReference.trim() || null : null,
        });
        if (error) return rpcError(error);
        return Response.json({ result: data }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
        console.error("Turf booking change review failed.", error);
        return Response.json({ error: "The review could not be saved. Please try again." }, { status: 503 });
    }
}
