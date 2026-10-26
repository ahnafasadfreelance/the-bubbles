import { timingSafeEqual } from "node:crypto";

import { createPrivilegedClient } from "@/lib/supabase/privileged-server";

export async function POST(request: Request) {
    const configuredSecret = process.env.TURF_CRON_SECRET?.trim();
    if (!configuredSecret || Buffer.byteLength(configuredSecret) < 32) {
        return Response.json({ error: "Scheduled turf processing is not configured." }, { status: 503 });
    }

    const authorization = request.headers.get("authorization");
    const presentedSecret = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
    const expected = Buffer.from(configuredSecret);
    const actual = Buffer.from(presentedSecret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    try {
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase.rpc("turf_process_expiries");
        if (error) {
            console.error("Scheduled turf expiry processing failed.", { code: error.code });
            return Response.json({ error: "Scheduled processing failed." }, { status: 503 });
        }
        return Response.json({ result: data }, {
            headers: { "Cache-Control": "private, no-store" },
        });
    } catch (error) {
        console.error("Turf expiry worker is unavailable.", error);
        return Response.json({ error: "Scheduled processing failed." }, { status: 503 });
    }
}
