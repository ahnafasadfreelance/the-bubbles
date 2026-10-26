"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Check, Clock3, MessageSquareText, RefreshCw, Send } from "lucide-react";

import { AdminConfirmDialog } from "@/components/admin-confirm-dialog";
import {
    closeTableVisitAction,
    loadAdminTableVisitsAction,
    replyToTableVisitAction,
    updateTableVisitRequestAction,
} from "@/app/admin/table-visits/actions";
import type { AdminTableVisitsResult, AdminTableVisit } from "@/lib/table-visit-admin";

function remainingMinutes(value: string) {
    return Math.max(0, Math.ceil((Date.parse(value) - Date.now()) / 60000));
}

function dateTime(value: string) {
    return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const requestLabels: Record<string, string> = {
    waiter: "Call a waiter",
    bill: "Request the bill",
    water_cutlery: "Water or cutlery",
};

export function AdminTableVisitsPanel({ initialResult, canCloseVisit = true }: { initialResult: AdminTableVisitsResult; canCloseVisit?: boolean }) {
    const [result, setResult] = useState(initialResult);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [pendingClose, setPendingClose] = useState<AdminTableVisit | null>(null);
    const visits = result.ok ? result.data : [];

    async function refresh() {
        const response = await loadAdminTableVisitsAction();
        setResult(response);
        if (!response.ok) setError(response.reason === "unauthorized"
            ? "Administrator access is required."
            : "Table visits could not be refreshed. Check the database and try again.");
        else setError("");
    }

    useEffect(() => {
        const interval = window.setInterval(() => void refresh(), 10000);
        return () => window.clearInterval(interval);
    }, []);

    async function reply(event: FormEvent<HTMLFormElement>, visitId: string) {
        event.preventDefault();
        const body = drafts[visitId] ?? "";
        setBusy(true);
        setError("");
        const response = await replyToTableVisitAction({ visitId, body });
        if (!response.ok) setError(response.reason);
        else setDrafts((current) => ({ ...current, [visitId]: "" }));
        await refresh();
        setBusy(false);
    }

    async function updateRequest(requestId: string, status: "acknowledged" | "resolved") {
        setBusy(true);
        setError("");
        const response = await updateTableVisitRequestAction({ requestId, status });
        if (!response.ok) setError(response.reason);
        await refresh();
        setBusy(false);
    }

    async function closeVisit() {
        if (!pendingClose) return;
        setBusy(true);
        setError("");
        const response = await closeTableVisitAction(pendingClose.id);
        if (!response.ok) setError(response.reason);
        setPendingClose(null);
        await refresh();
        setBusy(false);
    }

    return (
        <div className="space-y-3">
            <AdminConfirmDialog
                open={canCloseVisit && pendingClose !== null}
                title="Close this table visit?"
                description={pendingClose ? `Customers at ${pendingClose.tableLabel} will no longer be able to order or use support through this visit. This cannot be reopened.` : ""}
                confirmLabel="Close visit"
                busy={busy}
                onCancel={() => setPendingClose(null)}
                onConfirm={() => void closeVisit()}
            />
            {error ? <p role="alert" className="rounded border border-[#743b47] bg-[#331f35] px-3 py-2 text-xs text-[#ffd9df]">{error}</p> : null}
            {!result.ok ? (
                <div role="alert" className="rounded border border-[#743b47] bg-[#331f35] px-4 py-6 text-center text-sm text-[#ffd9df]">{result.reason === "unauthorized" ? "Administrator access is required." : "Active table visits could not be loaded."}</div>
            ) : visits.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[#245477] bg-[#092746] px-5 py-12 text-center">
                    <MessageSquareText className="mx-auto h-8 w-8 text-[#48b7ff]" aria-hidden="true" />
                    <h2 className="mt-3 text-sm font-semibold text-white">No active table visits</h2>
                    <p className="mt-1 text-xs text-[#91a9c2]">New QR scans and customer support requests will appear here.</p>
                    <button type="button" onClick={() => void refresh()} className="mt-4 inline-flex min-h-9 items-center gap-2 rounded bg-[#0b3c63] px-3 text-xs font-semibold text-white hover:bg-[#075084]"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Refresh</button>
                </div>
            ) : (
                <div className="grid gap-3 xl:grid-cols-2">
                    {visits.map((visit) => (
                        <article key={visit.id} className="overflow-hidden rounded-lg border border-[#1b4667] bg-[#08243f]">
                            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#163b5a] px-4 py-3">
                                <div>
                                    <h2 className="text-sm font-bold text-white">{visit.tableLabel}</h2>
                                    <p className="mt-1 text-[10px] text-[#91a9c2]">Visit started {dateTime(visit.startedAt)} · Last activity {dateTime(visit.lastActivityAt)}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center gap-1 rounded-full bg-[#123e4c] px-2 py-1 text-[10px] font-semibold text-[#bfece0]"><Clock3 className="h-3 w-3" aria-hidden="true" /> Auto-expires in {remainingMinutes(new Date(Date.parse(visit.lastActivityAt) + 90 * 60 * 1000).toISOString())}m</span>
                                    {canCloseVisit ? <button type="button" disabled={busy} onClick={() => setPendingClose(visit)} className="min-h-8 rounded border border-[#995454] px-2.5 text-[10px] font-bold text-[#ffd9df] hover:bg-[#4b2930] disabled:opacity-50">Close visit</button> : null}
                                </div>
                            </header>
                            <div className="grid gap-3 p-3">
                                <section className="rounded-md border border-[#194464] bg-[#061d36] p-3">
                                    <h3 className="mb-2 text-[11px] font-bold text-white">Customer requests</h3>
                                    {visit.requests.length === 0 ? <p className="text-[10px] text-[#91a9c2]">No support requests yet.</p> : (
                                        <ul className="space-y-2">
                                            {visit.requests.map((request) => (
                                                <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-[#0b2e50] px-2.5 py-2">
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-semibold text-[#f5f9ff]">{requestLabels[request.request_type] || "Customer request"}</p>
                                                        {request.customer_message ? <p className="mt-0.5 text-[10px] text-[#c4d4e1]">{request.customer_message}</p> : null}
                                                        <p className="mt-0.5 text-[9px] text-[#91a9c2]">{dateTime(request.created_at)} · <span className="capitalize">{request.status}</span></p>
                                                    </div>
                                                    {request.status !== "resolved" ? <button type="button" disabled={busy} onClick={() => void updateRequest(request.id, request.status === "pending" ? "acknowledged" : "resolved")} className="inline-flex min-h-8 items-center gap-1 rounded bg-[#075084] px-2.5 text-[10px] font-semibold text-white hover:bg-[#087bc1] disabled:opacity-50"><Check className="h-3 w-3" aria-hidden="true" />{request.status === "pending" ? "Acknowledge" : "Resolve"}</button> : null}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </section>
                                <section className="rounded-md border border-[#194464] bg-[#061d36] p-3">
                                    <h3 className="mb-2 text-[11px] font-bold text-white">Customer–staff messages</h3>
                                    <div className="max-h-52 space-y-2 overflow-y-auto">
                                        {visit.messages.length ? visit.messages.map((message) => (
                                            <p key={message.id} className={`max-w-[90%] rounded-md px-2.5 py-2 text-[10px] leading-4 ${message.sender_type === "staff" ? "ml-auto bg-[#0d456c] text-[#e1f5ff]" : "mr-auto bg-[#102f4b] text-[#d7e4ef]"}`}>
                                                <span className="mb-0.5 block text-[9px] font-bold">{message.sender_name}{message.sender_type === "staff" ? " · Staff" : ""} · {dateTime(message.created_at)}</span>
                                                {message.body}
                                            </p>
                                        )) : <p className="text-[10px] text-[#91a9c2]">No messages yet.</p>}
                                    </div>
                                    <form onSubmit={(event) => void reply(event, visit.id)} className="mt-2 flex gap-2 border-t border-[#163b5a] pt-2">
                                        <label className="sr-only" htmlFor={`reply-${visit.id}`}>Reply to {visit.tableLabel}</label>
                                        <input id={`reply-${visit.id}`} maxLength={1000} value={drafts[visit.id] ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [visit.id]: event.target.value }))} placeholder="Write a reply…" className="min-h-9 min-w-0 flex-1 rounded border border-[#245477] bg-[#03172b] px-3 text-xs text-white outline-none placeholder:text-[#7892a8] focus:border-[#36adff]" />
                                        <button type="submit" disabled={busy || !(drafts[visit.id] ?? "").trim()} aria-label={`Send reply to ${visit.tableLabel}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[#078cf0] text-white disabled:opacity-40"><Send className="h-4 w-4" aria-hidden="true" /></button>
                                    </form>
                                </section>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
}
