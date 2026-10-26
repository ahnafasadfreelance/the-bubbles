"use client";

import { Clock3 } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { TableSupportButton } from "@/components/table-support-button";
import type { TableVisitState } from "@/app/table-visit/actions";
import type { PublicOrderingSession } from "@/lib/ordering-session";

type OrderingSessionContextValue = {
    active: boolean;
    remainingSeconds: number;
    formattedTime: string;
};

const OrderingSessionContext = createContext<OrderingSessionContextValue | null>(null);

export function OrderingSessionProvider({
    children,
    session,
}: {
    children: React.ReactNode;
    session: PublicOrderingSession | null;
}) {
    const [currentSession, setCurrentSession] = useState(session);
    const [remainingSeconds, setRemainingSeconds] = useState(() => currentSession
        ? Math.max(0, Math.ceil((Date.parse(currentSession.expiresAt) - Date.parse(currentSession.serverNow)) / 1000))
        : 0);

    useEffect(() => {
        function onVisitState(event: Event) {
            const state = (event as CustomEvent<TableVisitState | null>).detail;
            if (!state) {
                setCurrentSession(null);
                return;
            }
            setCurrentSession({
                visitId: state.visitId,
                createdAt: state.startedAt,
                expiresAt: state.orderWindowExpiresAt,
                visitExpiresAt: state.visitExpiresAt,
                supportCooldownUntil: state.supportCooldownUntil,
                serverNow: state.serverNow,
            });
        }
        window.addEventListener("table-visit-state", onVisitState);
        return () => window.removeEventListener("table-visit-state", onVisitState);
    }, []);

    useEffect(() => {
        if (!currentSession) {
            const reset = window.setTimeout(() => setRemainingSeconds(0), 0);
            return () => window.clearTimeout(reset);
        }
        const start = performance.now();
        const serverRemainingMs = Math.max(0, Date.parse(currentSession.expiresAt) - Date.parse(currentSession.serverNow));
        const update = () => setRemainingSeconds(Math.max(0, Math.ceil((serverRemainingMs - (performance.now() - start)) / 1000)));
        const initialUpdate = window.setTimeout(update, 0);
        const interval = window.setInterval(update, 1000);
        return () => {
            window.clearTimeout(initialUpdate);
            window.clearInterval(interval);
        };
    }, [currentSession]);

    const value = useMemo(() => ({
        active: remainingSeconds > 0,
        remainingSeconds,
        formattedTime: `${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")}`,
    }), [remainingSeconds]);

    return (
        <OrderingSessionContext.Provider value={value}>
            {children}
            {session ? <TableSupportButton /> : null}
        </OrderingSessionContext.Provider>
    );
}

export function useOrderingSession() {
    return useContext(OrderingSessionContext);
}

export function OrderingSessionNotice() {
    const session = useOrderingSession();
    if (!session) return null;

    if (!session.active) {
        return (
            <aside role="alert" className="border-l-4 border-[#b74646] bg-[#fff0f0] px-4 py-3 text-sm text-[#7c2626]">
                <p className="font-bold">Your ordering session has expired.</p>
                <p className="mt-1">Scan the table QR code again to open a new 10-minute ordering window. Your cart is saved while ordering is paused.</p>
            </aside>
        );
    }

    return (
        <aside className="flex flex-wrap items-center justify-between gap-2 border-l-4 border-[#14a6d1] bg-[#e9f8fd] px-4 py-3 text-[#07577f]">
            <p className="flex items-center gap-2 text-xs font-semibold sm:text-sm">
                <Clock3 className="h-4 w-4 shrink-0 text-[#087bc1]" aria-hidden="true" />
                <span><span className="font-bold">Your ordering session has started.</span> Please place your order within 10 minutes.</span>
            </p>
            <p
                role="timer"
                aria-label={`Ordering time left: ${session.formattedTime}`}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold tabular-nums ${session.remainingSeconds <= 120 ? "bg-[#fff0e8] text-[#a84924]" : "bg-white text-[#0759a8]"}`}
            >
                ⏱ {session.formattedTime}
            </p>
        </aside>
    );
}
