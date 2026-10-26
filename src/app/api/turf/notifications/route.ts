import { createClient } from "@/lib/supabase/server";

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
        return Response.json({ error: "Notification details are invalid." }, { status: 400 });
    }
    if (typeof payload !== "object" || payload === null || !("id" in payload)
        || typeof payload.id !== "number" || !Number.isSafeInteger(payload.id) || payload.id < 1) {
        return Response.json({ error: "Notification details are invalid." }, { status: 400 });
    }

    try {
        const supabase = await createClient();
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) return Response.json({ error: "Sign in to update notifications." }, { status: 401 });
        const { data, error } = await supabase.rpc("turf_mark_notification_read", { p_notification_id: payload.id });
        if (error) {
            console.error("Turf notification could not be marked read.", { code: error.code });
            if (error.code === "42501") return Response.json({ error: "Sign in to update notifications." }, { status: 403 });
            if (error.code === "P0002") return Response.json({ error: "Notification not found." }, { status: 404 });
            return Response.json({ error: "Notification could not be updated." }, { status: 503 });
        }
        return Response.json({ result: data }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
        console.error("Turf notification service is unavailable.", error);
        return Response.json({ error: "Notification could not be updated." }, { status: 503 });
    }
}
