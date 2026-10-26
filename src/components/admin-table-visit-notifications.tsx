"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Headset } from "lucide-react";

import { loadAdminTableVisitRequestCountAction } from "@/app/admin/table-visits/actions";
import type { AdminTableVisitRequestCountResult } from "@/lib/table-visit-admin";

type NotificationState = {
    count: number | null;
    refreshFailed: boolean;
    orderModalOpen: boolean;
    setOrderModalOpen: (open: boolean) => void;
};

const NotificationContext = createContext<NotificationState | null>(null);

export function AdminTableVisitNotificationProvider({
    children,
    enabled,
    initialResult,
}: {
    children: ReactNode;
    enabled: boolean;
    initialResult: AdminTableVisitRequestCountResult | null;
}) {
    const [count, setCount] = useState(initialResult?.ok ? initialResult.count : null);
    const [refreshFailed, setRefreshFailed] = useState(initialResult !== null && !initialResult.ok);
    const [orderModalOpen, setOrderModalOpen] = useState(false);

    useEffect(() => {
        if (!enabled) return;
        let active = true;

        async function refresh() {
            try {
                const result = await loadAdminTableVisitRequestCountAction();
                if (!active) return;
                if (result.ok) {
                    setCount(result.count);
                    setRefreshFailed(false);
                } else {
                    setRefreshFailed(true);
                }
            } catch {
                if (active) setRefreshFailed(true);
            }
        }

        void refresh();
        const interval = window.setInterval(() => void refresh(), 10000);
        return () => {
            active = false;
            window.clearInterval(interval);
        };
    }, [enabled]);

    return (
        <NotificationContext.Provider value={{ count, refreshFailed, orderModalOpen, setOrderModalOpen }}>
            {children}
            {enabled ? <AdminTableVisitFloatingLink /> : null}
        </NotificationContext.Provider>
    );
}

export function useAdminTableVisitNotifications() {
    const notifications = useContext(NotificationContext);
    if (!notifications) throw new Error("AdminTableVisitNotificationProvider is required.");
    return notifications;
}

function requestCountLabel(count: number | null, refreshFailed: boolean) {
    if (count === null) return refreshFailed ? "Request count unavailable" : "Loading request count";
    return `${count} pending ${count === 1 ? "request" : "requests"}${refreshFailed ? "; count may be out of date" : ""}`;
}

function RequestCountBadge({ count }: { count: number }) {
    return (
        <span
            className={`inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#f05a67] px-1.5 text-[10px] font-extrabold leading-none text-white shadow-[0_0_12px_rgba(240,90,103,0.45)] ${count > 0 ? "motion-safe:animate-pulse" : ""}`}
            aria-hidden="true"
        >
            {count > 99 ? "99+" : count}
        </span>
    );
}

function AdminTableVisitFloatingLink() {
    const { count, refreshFailed, orderModalOpen } = useAdminTableVisitNotifications();
    const requestLabel = requestCountLabel(count, refreshFailed);

    if (orderModalOpen) return null;

    return (
        <Link
            href="/admin/table-visits"
            aria-label={`Table Visits & Support: ${requestLabel}`}
            title={`Table Visits & Support: ${requestLabel}`}
            className="fixed bottom-5 right-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full border border-[#2b719e] bg-[#06345a] py-1.5 pl-1.5 pr-4 text-xs font-bold text-white shadow-[0_8px_28px_rgba(0,0,0,0.45)] transition hover:bg-[#075084] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6bc7ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#061d36] lg:hidden"
        >
            <span className={`flex h-9 w-9 items-center justify-center rounded-full bg-[#078cf0] text-white ${count !== null && count > 0 ? "motion-safe:animate-pulse" : ""}`}>
                <Headset className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>Table Help</span>
            {count !== null && count > 0 ? <RequestCountBadge count={count} /> : null}
        </Link>
    );
}

export function AdminTableVisitRequestBadge({ count }: { count: number | null }) {
    return count !== null && count > 0 ? <RequestCountBadge count={count} /> : null;
}
