import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function isIsoDate(value: string | null): value is string {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function GET(request: Request) {
    const localDate = new URL(request.url).searchParams.get("date");
    if (!isIsoDate(localDate)) {
        return Response.json({ error: "Choose a valid date." }, {
            status: 400,
            headers: { "Cache-Control": "private, no-store" },
        });
    }

    try {
        const supabase = await createClient();
        const { data, error } = await supabase.rpc("turf_public_day", { p_local_date: localDate });
        if (error) {
            console.error("Turf public availability query failed.", { code: error.code });
            return Response.json({ error: "Availability could not be loaded. Please try again." }, {
                status: error.code === "22023" ? 400 : 503,
                headers: { "Cache-Control": "private, no-store" },
            });
        }
        return Response.json({ day: data }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
        console.error("Turf public availability is unavailable.", error);
        return Response.json({ error: "Availability could not be loaded. Please try again." }, {
            status: 503,
            headers: { "Cache-Control": "private, no-store" },
        });
    }
}
