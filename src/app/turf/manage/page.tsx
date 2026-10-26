import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarDays, ClipboardList, Clock3, CreditCard, Settings2 } from "lucide-react";

import { TurfStaffQueue } from "@/components/turf-staff-queue";
import { getCurrentUser } from "@/lib/supabase/auth-server";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Turf Management", robots: { index: false, follow: false } };

function isRecord(value: unknown): value is Record<string, Json> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberMetric(summary: Record<string, Json>, key: string) {
    return typeof summary[key] === "number" ? summary[key] : 0;
}

export default async function TurfManagementPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/login?next=%2Fturf%2Fmanage");

    const supabase = await createClient();
    const { data: role, error: roleError } = await supabase.rpc("turf_current_staff_role");
    if (roleError) {
        console.error("Turf staff role could not be loaded.", {
            code: roleError.code,
            message: roleError.message,
        });
        return (
            <main className="min-h-screen bg-[#f4f8f6] p-6 text-[#102b22]">
                <section className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-white p-6">
                    <h1 className="text-xl font-bold">Turf access could not be checked</h1>
                    <p className="mt-2 text-sm text-[#597267]">The turf database setup may be incomplete. Ask an administrator to verify that all turf migrations were applied to the Supabase project used by this app.</p>
                    <Link href="/turf" className="mt-4 inline-block font-semibold text-[#087a4a]">Return to turf information</Link>
                </section>
            </main>
        );
    }
    if (role !== "full_admin" && role !== "turf_manager") {
        return (
            <main className="min-h-screen bg-[#f4f8f6] p-6 text-[#102b22]">
                <section className="mx-auto max-w-3xl rounded-2xl border border-[#dce8e0] bg-white p-6">
                    <h1 className="text-xl font-bold">Turf staff access required</h1>
                    <p className="mt-2 text-sm text-[#597267]">
                        You are signed in, but your account does not have an active turf staff role. Ask an existing restaurant Owner or Full Admin to assign your already Google-authenticated account as Turf Manager from <Link href="/admin/staff#turf-access" className="font-semibold text-[#087a4a] hover:underline">Staff &amp; Access</Link>.
                    </p>
                    <Link href="/turf" className="mt-4 inline-block font-semibold text-[#087a4a]">Return to turf information</Link>
                </section>
            </main>
        );
    }

    const [{ data, error }, { data: changesData, error: changesError }] = await Promise.all([
        supabase.rpc("turf_staff_dashboard"),
        supabase.rpc("turf_staff_change_requests"),
    ]);
    if (error || changesError) {
        console.error("Turf management data could not be loaded.", {
            dashboardCode: error?.code,
            dashboardMessage: error?.message,
            changesCode: changesError?.code,
            changesMessage: changesError?.message,
        });
        return (
            <main className="min-h-screen bg-[#f4f8f6] p-6 text-[#102b22]">
                <section className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-white p-6">
                    <h1 className="text-xl font-bold">Turf management unavailable</h1>
                    <p className="mt-2 text-sm text-[#597267]">Your staff access is active, but dashboard data could not be loaded. Ask an administrator to confirm the customer-operations migration was applied to this Supabase project.</p>
                    <Link href="/turf" className="mt-4 inline-block font-semibold text-[#087a4a]">Return to turf information</Link>
                </section>
            </main>
        );
    }
    if (!isRecord(data) || !isRecord(data.summary) || !Array.isArray(data.tasks) || !Array.isArray(data.bookings)
        || !isRecord(changesData) || !Array.isArray(changesData.requests)) {
        console.error("Turf dashboard returned an invalid shape.");
        return <main className="p-8">Turf management data is unavailable. Please retry later.</main>;
    }

    const summary = data.summary;
    const metrics = [
        { label: "Today’s bookings", key: "today_bookings", Icon: CalendarDays },
        { label: "Pending requests", key: "pending_requests", Icon: ClipboardList },
        { label: "Overdue requests", key: "overdue_requests", Icon: Clock3 },
        { label: "Payments to review", key: "payments_awaiting_review", Icon: CreditCard },
        { label: "Deadlines < 6 hours", key: "approaching_payment_deadlines", Icon: Clock3 },
        { label: "Upcoming bookings", key: "upcoming_bookings", Icon: CalendarDays },
    ];

    return (
        <main className="min-h-screen bg-[#f4f8f6] text-[#102b22]">
            <header className="bg-[#082c22] text-white">
                <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
                    <div>
                        <Link href="/turf" className="text-xs font-semibold text-emerald-200 hover:text-white">The Bubbles · Turf</Link>
                        <h1 className="mt-1 text-2xl font-black">Turf Management</h1>
                        <p className="mt-1 text-xs capitalize text-white/60">{role.replaceAll("_", " ")} · shared staff queue</p>
                    </div>
                    <nav aria-label="Turf management" className="flex flex-wrap gap-2 text-sm">
                        <Link href="/turf/manage" className="rounded-lg bg-white/10 px-3 py-2 font-semibold">Overview</Link>
                        <Link href="/turf/manage/settings" className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 hover:bg-white/20"><Settings2 className="h-4 w-4" aria-hidden="true" /> Settings</Link>
                    </nav>
                </div>
            </header>
            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
                <section aria-label="Turf overview" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {metrics.map(({ label, key, Icon }) => (
                        <article key={key} className="rounded-2xl border border-[#dce8e0] bg-white p-4 shadow-sm">
                            <Icon className="h-4 w-4 text-[#138153]" aria-hidden="true" />
                            <p className="mt-3 text-2xl font-black">{numberMetric(summary, key)}</p>
                            <p className="mt-1 text-xs leading-4 text-[#597267]">{label}</p>
                        </article>
                    ))}
                </section>
                <div className="mt-7 grid items-start gap-7 xl:grid-cols-[0.9fr_1.1fr]">
                    <section>
                        <div className="mb-3 flex items-baseline justify-between gap-3">
                            <h2 className="text-xl font-extrabold">Shared task queue</h2>
                            <span className="text-xs text-[#6a8176]">Overdue → payment reviews/deadlines → new requests</span>
                        </div>
                        <TurfStaffQueue tasks={data.tasks} changeRequests={changesData.requests} />
                    </section>
                    <section>
                        <h2 className="mb-3 text-xl font-extrabold">Recent & upcoming bookings</h2>
                        {data.bookings.length ? (
                            <div className="space-y-2">
                                {data.bookings.map((booking, index) => {
                                    if (!isRecord(booking)) return null;
                                    return (
                                        <article key={String(booking.id ?? index)} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dce8e0] bg-white p-4">
                                            <div>
                                                <p className="font-mono text-sm font-bold text-[#087a4a]">{String(booking.reference ?? "")}</p>
                                                <p className="mt-1 text-sm font-semibold">{String(booking.customer_name ?? "Customer")}</p>
                                                <p className="text-xs text-[#6a8176]">{typeof booking.starts_at === "string" ? new Intl.DateTimeFormat("en-BD", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" }).format(new Date(booking.starts_at)) : ""}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-bold capitalize">{String(booking.status ?? "").replaceAll("_", " ")}</p>
                                                <p className="text-xs text-[#6a8176]">{String(booking.player_count ?? "")} players · {typeof booking.price === "number" ? new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(booking.price) : ""}</p>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        ) : <p className="rounded-xl border border-dashed border-[#cbd9d0] bg-white p-5 text-sm text-[#597267]">No bookings to show yet.</p>}
                    </section>
                </div>
            </div>
        </main>
    );
}
