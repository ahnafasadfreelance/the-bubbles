import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { TurfNotificationList } from "@/components/turf-notification-list";
import { getCurrentUser } from "@/lib/supabase/auth-server";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
    title: "Turf Notifications",
    robots: { index: false, follow: false },
};

type Notification = {
    id: number;
    title: string;
    body: string;
    href: string;
    created_at: string;
    read_at: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNotification(value: unknown): Notification | null {
    if (!isRecord(value)
        || typeof value.id !== "number"
        || !Number.isSafeInteger(value.id)
        || typeof value.title !== "string"
        || typeof value.body !== "string"
        || typeof value.href !== "string"
        || typeof value.created_at !== "string") return null;
    return {
        id: value.id,
        title: value.title,
        body: value.body,
        href: value.href,
        created_at: value.created_at,
        read_at: typeof value.read_at === "string" ? value.read_at : null,
    };
}

export default async function TurfNotificationsPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/login?next=%2Faccount%2Fturf-notifications");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("turf_customer_notifications");
    if (error) {
        console.error("Turf notifications could not be loaded.", { code: error.code });
        return <main className="min-h-screen bg-[#f4f8f6] p-6"><p className="mx-auto max-w-3xl rounded-2xl bg-white p-6 text-sm text-red-800">Notifications could not be loaded. Please retry.</p></main>;
    }
    const response: Json = data;
    const notifications = isRecord(response) && Array.isArray(response.notifications)
        ? response.notifications.map(parseNotification).filter((item): item is Notification => item !== null)
        : [];

    return (
        <main className="min-h-screen bg-[#f4f8f6] text-[#102b22]">
            <header className="bg-[#082c22] text-white">
                <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6">
                    <Link href="/account/turf-bookings" className="text-xs font-semibold text-emerald-200 hover:text-white">← My Turf Bookings</Link>
                    <h1 className="mt-2 text-2xl font-black">Turf Notifications</h1>
                </div>
            </header>
            <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
                <TurfNotificationList notifications={notifications} />
            </div>
        </main>
    );
}
