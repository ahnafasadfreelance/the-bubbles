"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Notification = {
    id: number;
    title: string;
    body: string;
    href: string;
    created_at: string;
    read_at: string | null;
};

function formattedDate(value: string) {
    return new Intl.DateTimeFormat("en-BD", {
        timeZone: "Asia/Dhaka",
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
}

export function TurfNotificationList({ notifications }: { notifications: Notification[] }) {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<number | null>(null);

    async function markRead(id: number) {
        if (busyId !== null) return;
        setBusyId(id);
        setError(null);
        try {
            const response = await fetch("/api/turf/notifications", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });
            if (!response.ok) {
                const body: unknown = await response.json();
                throw new Error(typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
                    ? body.error : "Could not update this notification.");
            }
            router.refresh();
        } catch (markError) {
            setError(markError instanceof Error ? markError.message : "Could not update this notification.");
        } finally {
            setBusyId(null);
        }
    }

    if (!notifications.length) {
        return <p className="rounded-2xl border border-dashed border-[#cbd9d0] bg-white p-6 text-sm text-[#597267]">No turf notifications yet.</p>;
    }

    return (
        <div className="space-y-3">
            {notifications.map((notification) => {
                const href = notification.href.startsWith("/") && !notification.href.startsWith("//")
                    ? notification.href : "/account/turf-bookings";
                return (
                    <article key={notification.id} className={`rounded-2xl border p-4 ${notification.read_at ? "border-[#dce8e0] bg-white" : "border-emerald-300 bg-emerald-50"}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <Link href={href} className="font-bold text-[#087a4a] hover:underline">{notification.title}</Link>
                                <p className="mt-1 text-sm text-[#405d4f]">{notification.body}</p>
                                <p className="mt-2 text-xs text-[#6a8176]">{formattedDate(notification.created_at)}</p>
                            </div>
                            {!notification.read_at ? (
                                <button type="button" onClick={() => markRead(notification.id)} disabled={busyId !== null}
                                    className="min-h-9 rounded-lg border border-[#b9cfc1] px-3 text-xs font-bold text-[#087a4a] disabled:opacity-50">
                                    {busyId === notification.id ? "Saving..." : "Mark read"}
                                </button>
                            ) : <span className="text-xs font-semibold text-[#6a8176]">Read</span>}
                        </div>
                    </article>
                );
            })}
            {error ? <p role="alert" className="text-sm text-red-800">{error}</p> : null}
        </div>
    );
}
