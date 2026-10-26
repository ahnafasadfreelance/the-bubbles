"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { LifeBuoy, MessageCircle, Send, X } from "lucide-react";

import {
    createTableSupportRequestAction,
    loadTableVisitStateAction,
    sendTableVisitMessageAction,
    type TableVisitState,
} from "@/app/table-visit/actions";

const REQUESTS = [
    { type: "waiter", label: "Call a waiter" },
    { type: "bill", label: "Request the bill" },
    { type: "water_cutlery", label: "Water or cutlery" },
] as const;

function remainingSeconds(until: string | null, serverNow: string) {
    return until ? Math.max(0, Math.ceil((Date.parse(until) - Date.parse(serverNow)) / 1000)) : 0;
}

function clock(seconds: number) {
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function TableSupportButton() {
    const [state, setState] = useState<TableVisitState | null>(null);
    const [stateReceivedAt, setStateReceivedAt] = useState(0);
    const [inactive, setInactive] = useState(false);
    const [open, setOpen] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const [message, setMessage] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const refreshing = useRef(false);

    async function refresh() {
        if (refreshing.current) return;
        refreshing.current = true;
        try {
            const result = await loadTableVisitStateAction();
            if (result.ok) {
                setState(result.state);
                setStateReceivedAt(Date.now());
                setInactive(!result.state);
                window.dispatchEvent(new CustomEvent("table-visit-state", { detail: result.state }));
            } else setError(result.reason);
        } catch {
            setError("Table support could not be refreshed. Check your connection and retry.");
        } finally {
            refreshing.current = false;
        }
    }

    useEffect(() => {
        const initial = window.setTimeout(() => void refresh(), 0);
        const poll = window.setInterval(() => void refresh(), 5000);
        const tick = window.setInterval(() => setNow(Date.now()), 1000);
        return () => {
            window.clearTimeout(initial);
            window.clearInterval(poll);
            window.clearInterval(tick);
        };
    }, []);

    const serverNow = state
        ? new Date(Date.parse(state.serverNow) + Math.max(0, now - stateReceivedAt)).toISOString()
        : new Date(now).toISOString();
    const cooldown = state ? remainingSeconds(state.supportCooldownUntil, serverNow) : 0;
    const visitRemaining = state ? remainingSeconds(state.visitExpiresAt, serverNow) : 0;
    const active = Boolean(state && visitRemaining > 0);

    async function requestSupport(type: (typeof REQUESTS)[number]["type"]) {
        setBusy(true);
        setError("");
        try {
            const result = await createTableSupportRequestAction({ type });
            if (!result.ok) {
                setError(result.reason === "cooldown"
                    ? "Someone at this table just sent a request. Please wait for the shared countdown."
                    : result.reason === "closed"
                        ? "This table visit has ended. Scan the table QR code to start again."
                        : "The request could not be sent. Please try again.");
            }
            await refresh();
        } catch {
            setError("The request could not be sent. Check your connection and try again.");
        } finally {
            setBusy(false);
        }
    }

    async function sendMessage(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
            const result = await sendTableVisitMessageAction(message);
            if (result.ok) setMessage("");
            else setError(result.reason === "cooldown"
                ? "Someone at this table just sent a request. Please wait for the shared countdown."
                : result.reason === "closed"
                    ? "This table visit has ended. Scan the table QR code to start again."
                    : "Your message could not be sent. Please try again.");
            await refresh();
        } catch {
            setError("Your message could not be sent. Check your connection and try again.");
        } finally {
            setBusy(false);
        }
    }

    if (inactive || (state && !active)) return null;

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label="Open table support"
                className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-3 z-30 inline-flex min-h-12 items-center gap-2 rounded-full border border-[#8adbf2] bg-[#07395c] px-4 text-xs font-bold text-white shadow-lg hover:bg-[#075084] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#50d7f5] sm:bottom-6 sm:left-6"
            >
                <LifeBuoy className="h-4 w-4 text-[#56d9f1]" aria-hidden="true" />
                <span>Need help?</span>
                {cooldown > 0 ? <span className="rounded-full bg-white/15 px-2 py-1 font-mono text-[10px] tabular-nums">{clock(cooldown)}</span> : null}
            </button>

            {open ? (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#03172b]/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
                    <section role="dialog" aria-modal="true" aria-labelledby="table-support-title" className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white text-[#09294d] shadow-2xl sm:rounded-2xl">
                        <header className="flex items-center justify-between border-b border-[#d9e5ef] px-4 py-3">
                            <div>
                                <h2 id="table-support-title" className="text-base font-bold">Table support</h2>
                                <p className="mt-0.5 text-xs text-[#617991]">Requests are shared by everyone at this table.</p>
                            </div>
                            <button type="button" aria-label="Close support" onClick={() => setOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full text-[#536d82] hover:bg-[#edf4f8]"><X className="h-4 w-4" aria-hidden="true" /></button>
                        </header>
                        <div className="space-y-4 overflow-y-auto p-4">
                            {cooldown > 0 ? (
                                <p role="timer" className="rounded-lg border border-[#c5dfef] bg-[#eef8fd] px-3 py-2 text-xs text-[#07577f]">
                                    Support is available again in <strong className="font-mono tabular-nums">{clock(cooldown)}</strong>. This countdown is shared across the table.
                                </p>
                            ) : null}
                            <div className="grid gap-2 sm:grid-cols-3">
                                {REQUESTS.map(({ type, label }) => (
                                    <button key={type} type="button" disabled={busy || cooldown > 0 || !state} onClick={() => void requestSupport(type)} className="min-h-12 rounded-lg bg-[#0759a8] px-3 py-2 text-xs font-bold text-white hover:bg-[#087bc1] disabled:cursor-not-allowed disabled:opacity-45">{label}</button>
                                ))}
                            </div>
                            <section aria-label="Customer and staff messages" className="rounded-xl border border-[#d9e5ef]">
                                <h3 className="flex items-center gap-2 border-b border-[#e7eef4] px-3 py-2 text-xs font-bold"><MessageCircle className="h-4 w-4 text-[#087bc1]" aria-hidden="true" /> Message staff</h3>
                                <div className="max-h-52 space-y-2 overflow-y-auto px-3 py-2">
                                    {state?.messages.length ? state.messages.map((entry) => (
                                        <p key={entry.id} className={`max-w-[88%] rounded-lg px-3 py-2 text-xs leading-5 ${entry.sender_type === "staff" ? "mr-auto bg-[#eef3f7] text-[#294b63]" : "ml-auto bg-[#eaf7ff] text-[#075084]"}`}>
                                            <span className="mb-0.5 block text-[10px] font-bold">{entry.sender_name}{entry.sender_type === "staff" ? " · Staff" : ""}</span>
                                            {entry.body}
                                        </p>
                                    )) : <p className="py-3 text-center text-xs text-[#71879a]">Send a message if you need anything else.</p>}
                                </div>
                                <form onSubmit={(event) => void sendMessage(event)} className="flex gap-2 border-t border-[#e7eef4] p-2">
                                    <label className="sr-only" htmlFor="table-support-message">Message staff</label>
                                    <input id="table-support-message" maxLength={1000} required value={message} onChange={(event) => setMessage(event.target.value)} placeholder={cooldown > 0 ? `Available in ${clock(cooldown)}` : "Write a message…"} disabled={busy || cooldown > 0 || !state} className="min-h-10 min-w-0 flex-1 rounded-md border border-[#cbdbe7] px-3 text-xs outline-none focus:border-[#087bc1] disabled:bg-[#f2f5f7]" />
                                    <button type="submit" disabled={busy || cooldown > 0 || !state || !message.trim()} aria-label="Send message" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#087bc1] text-white disabled:opacity-40"><Send className="h-4 w-4" aria-hidden="true" /></button>
                                </form>
                            </section>
                            {state?.requests.length ? (
                                <section aria-label="Recent requests">
                                    <h3 className="mb-2 text-xs font-bold">Recent requests</h3>
                                    <ul className="space-y-1.5">
                                        {state.requests.slice(0, 4).map((request) => (
                                            <li key={request.id} className="flex items-center justify-between gap-3 rounded-md bg-[#f3f7fa] px-3 py-2 text-xs">
                                                <span>{request.request_type === "waiter" ? "Waiter requested" : request.request_type === "bill" ? "Bill requested" : "Water or cutlery requested"}{request.customer_message ? `: ${request.customer_message}` : ""}</span>
                                                <span className="shrink-0 text-[10px] capitalize text-[#617991]">{request.status}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            ) : null}
                            {error ? <p role="alert" className="rounded-md border border-[#efc2c2] bg-[#fff2f2] px-3 py-2 text-xs text-[#822e2e]">{error}</p> : null}
                        </div>
                    </section>
                </div>
            ) : null}
        </>
    );
}
