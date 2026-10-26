import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TurfSettingsPanel } from "@/components/turf-settings-panel";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Turf Settings", robots: { index: false, follow: false } };

export default async function TurfSettingsPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/login?next=%2Fturf%2Fmanage%2Fsettings");
    const supabase = await createClient();
    const [{ data: role, error: roleError }, { data, error }] = await Promise.all([
        supabase.rpc("turf_current_staff_role"),
        supabase.rpc("turf_staff_settings"),
    ]);
    if (roleError || error) {
        console.error("Turf configuration could not be loaded.", { roleCode: roleError?.code, settingsCode: error?.code });
        return <main className="min-h-screen bg-[#f4f8f6] p-6"><section className="mx-auto max-w-3xl rounded-2xl bg-white p-6"><h1 className="text-xl font-bold">Turf settings unavailable</h1><p className="mt-2 text-sm text-[#597267]">Check staff access and that the turf migration is installed.</p><Link href="/turf/manage" className="mt-4 inline-block font-semibold text-[#087a4a]">Back to management</Link></section></main>;
    }
    if (role !== "full_admin" && role !== "turf_manager") redirect("/turf");

    return (
        <main className="min-h-screen bg-[#f4f8f6] text-[#102b22]">
            <header className="bg-[#082c22] text-white">
                <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
                    <div><Link href="/turf/manage" className="text-xs font-semibold text-emerald-200">← Turf Management</Link><h1 className="mt-1 text-2xl font-black">Schedule & settings</h1></div>
                    <span className="text-xs capitalize text-white/60">{role.replaceAll("_", " ")}</span>
                </div>
            </header>
            <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
                <TurfSettingsPanel initial={data} />
            </div>
        </main>
    );
}
