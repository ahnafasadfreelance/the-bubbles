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

export function OrderingSessionNotice({ tableLabel }: { tableLabel?: string }) {
    const session = useOrderingSession();
    if (!session) {
        return tableLabel ? (
            <aside aria-label="Dine-in table" className="flex items-center gap-2 rounded-md border border-[#16466d] bg-[#0b2e50] px-3 py-2 text-xs text-[#b8d5e8]">
                <span className="font-bold uppercase tracking-wide text-[#4bd4f0]">Dine in</span>
                <span aria-hidden="true" className="text-[#66859c]">·</span>
                <span className="font-semibold text-white">{tableLabel}</span>
            </aside>
        ) : null;
    }

    if (!session.active) {
        return (
            <aside role="alert" className="border-l-4 border-[#b74646] bg-[#fff0f0] px-4 py-3 text-sm text-[#7c2626]">
                <p className="font-bold">Your ordering session has expired.</p>
                <p className="mt-1">Scan the table QR code again to open a new 10-minute ordering window. Your cart is saved while ordering is paused.</p>
            </aside>
        );
    }

    return (
        <aside aria-label="Dine-in ordering session" className="flex min-h-10 items-center justify-between gap-3 rounded-md border border-[#16466d] bg-[#0b2e50] px-3 py-2 text-[#d5e8f4]">
            <p className="flex min-w-0 items-center gap-2 text-xs">
                <span className="font-bold uppercase tracking-wide text-[#4bd4f0]">Dine in</span>
                {tableLabel ? (
                    <>
                        <span aria-hidden="true" className="text-[#66859c]">·</span>
                        <span className="truncate font-semibold text-white">{tableLabel}</span>
                    </>
                ) : null}
            </p>
            <p
                role="timer"
                aria-label={`Ordering time left: ${session.formattedTime}`}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${session.remainingSeconds <= 60 ? "bg-[#ffe4e4] text-[#a32323]" : session.remainingSeconds <= 120 ? "bg-[#fff0e8] text-[#a84924]" : "bg-white text-[#0759a8]"}`}
            >
                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="font-medium">Time left to order</span>
                {session.formattedTime}
            </p>
        </aside>
    );
}
