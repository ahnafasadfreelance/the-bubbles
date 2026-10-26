"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Task = Record<string, unknown>;

function isRecord(value: unknown): value is Task {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function humanize(value: string) {
    return value.replaceAll("_", " ");
}

function price(value: unknown) {
    return typeof value === "number"
        ? new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(value)
        : null;
}

function date(value: unknown) {
    return typeof value === "string"
        ? new Intl.DateTimeFormat("en-BD", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
        : null;
}

function ReviewTask({ task }: { task: Task }) {
    const router = useRouter();
    const [reason, setReason] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const kind = task.kind === "payment_review" ? "payment" : task.kind === "booking_review" ? "booking" : null;
    const canDecide = kind !== null && typeof task.id === "string";

    async function decide(decision: "approve" | "reject" | "verify") {
        if (!canDecide || busy) return;
        if (decision !== "reject" && !window.confirm(decision === "approve"
            ? "Approve this request? The agreed price will be locked and payment deadline started."
            : "Verify this payment? This can confirm the booking once the required advance is reached.")) return;
        if (decision === "reject" && reason.trim().length < 3) {
            setError("Enter a reason before rejecting.");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const response = await fetch("/api/turf/review", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kind, id: task.id, decision, reason: reason || null }),
            });
            const result: unknown = await response.json();
            if (!response.ok) {
                throw new Error(isRecord(result) && typeof result.error === "string"
                    ? result.error
                    : "Review could not be saved.");
            }
            router.refresh();
        } catch (reviewError) {
            setError(reviewError instanceof Error ? reviewError.message : "Review could not be saved.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <article className={`rounded-2xl border p-4 ${task.overdue === true || task.status === "duplicate_flagged" ? "border-amber-300 bg-amber-50" : "border-[#dce8e0] bg-white"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="font-mono text-sm font-bold text-[#087a4a]">{typeof task.reference === "string" ? task.reference : "Turf task"}</p>
                    <p className="mt-1 font-semibold">{typeof task.customer_name === "string" ? task.customer_name : "Customer"}</p>
                    <p className="text-sm text-[#597267]">{typeof task.customer_phone === "string" ? task.customer_phone : ""}</p>
                </div>
                <div className="text-right">
                    <p className="text-xs font-bold uppercase capitalize text-[#547064]">{typeof task.status === "string" ? humanize(task.status) : humanize(String(task.kind ?? "task"))}</p>
                    {price(task.amount ?? task.price) ? <p className="mt-1 font-bold">{price(task.amount ?? task.price)}</p> : null}
                </div>
            </div>
            {date(task.starts_at) ? <p className="mt-3 text-sm">{date(task.starts_at)}{date(task.ends_at) ? ` – ${date(task.ends_at)}` : ""}</p> : null}
            {typeof task.transaction_reference === "string" ? <p className="mt-2 break-all text-xs text-[#597267]">Transaction reference: {task.transaction_reference}</p> : null}
            {task.overdue === true ? <p className="mt-2 text-xs font-bold uppercase text-amber-800">Overdue · slot remains protected</p> : null}
            {task.duplicate_of ? <p className="mt-2 text-xs font-bold text-amber-800">Duplicate reference flagged · investigate before any verification.</p> : null}
            {task.kind === "payment_deadline" ? <p className="mt-2 text-sm text-[#597267]">Advance deadline: {date(task.deadline)}</p> : null}
            {canDecide ? (
                <div className="mt-4 border-t border-[#e4ece7] pt-3">
                    <label className="block text-xs font-semibold text-[#597267]" htmlFor={`reason-${String(task.id)}`}>
                        Review reason (required for rejection)
                    </label>
                    <textarea id={`reason-${String(task.id)}`} rows={2} maxLength={1000} value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-[#cbd9d0] bg-white px-3 py-2 text-sm" />
                    <div className="mt-2 flex flex-wrap gap-2">
                        {kind === "booking" ? (
                            <>
                                <button type="button" onClick={() => decide("approve")} disabled={busy}
                                    className="min-h-10 rounded-lg bg-[#087a4a] px-4 text-sm font-bold text-white disabled:opacity-50">Approve request</button>
                                <button type="button" onClick={() => decide("reject")} disabled={busy}
                                    className="min-h-10 rounded-lg border border-red-300 px-4 text-sm font-bold text-red-800 disabled:opacity-50">Reject request</button>
                            </>
                        ) : (
                            <>
                                <button type="button" onClick={() => decide("verify")} disabled={busy || task.status === "duplicate_flagged"}
                                    className="min-h-10 rounded-lg bg-[#087a4a] px-4 text-sm font-bold text-white disabled:opacity-50">Verify received payment</button>
                                <button type="button" onClick={() => decide("reject")} disabled={busy}
                                    className="min-h-10 rounded-lg border border-red-300 px-4 text-sm font-bold text-red-800 disabled:opacity-50">Reject submission</button>
                            </>
                        )}
                    </div>
                    {error ? <p role="alert" className="mt-2 text-sm text-red-800">{error}</p> : null}
                </div>
            ) : null}
        </article>
    );
}

function ChangeReviewTask({ task }: { task: Task }) {
    const router = useRouter();
    const [reason, setReason] = useState("");
    const [refundAmount, setRefundAmount] = useState("");
    const [refundMethod, setRefundMethod] = useState("");
    const [refundReference, setRefundReference] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function decide(decision: "approve" | "reject") {
        if (busy || typeof task.id !== "string" || reason.trim().length < 3) return;
        if (!window.confirm(decision === "approve"
            ? "Approve this booking change? The booking status or time will change."
            : "Reject this booking change request?")) return;
        setBusy(true);
        setError(null);
        try {
            const response = await fetch("/api/turf/changes", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    requestId: task.id,
                    decision,
                    reason: reason.trim(),
                    refundAmount: refundAmount || null,
                    refundMethod: refundMethod || null,
                    refundReference: refundReference || null,
                }),
            });
            const result: unknown = await response.json();
            if (!response.ok) {
                throw new Error(isRecord(result) && typeof result.error === "string"
                    ? result.error : "Change review could not be saved.");
            }
            router.refresh();
        } catch (reviewError) {
            setError(reviewError instanceof Error ? reviewError.message : "Change review could not be saved.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <article className="rounded-2xl border border-[#dce8e0] bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="font-mono text-sm font-bold text-[#087a4a]">{typeof task.reference === "string" ? task.reference : "Turf change request"}</p>
                    <p className="mt-1 font-semibold">{typeof task.customer_name === "string" ? task.customer_name : "Customer"}</p>
                    <p className="text-sm text-[#597267]">{typeof task.customer_phone === "string" ? task.customer_phone : ""}</p>
                </div>
                <p className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold capitalize text-amber-900">
                    {typeof task.request_type === "string" ? humanize(task.request_type) : "Change"} request
                </p>
            </div>
            <p className="mt-3 text-sm">{typeof task.reason === "string" ? task.reason : ""}</p>
            {date(task.starts_at) ? <p className="mt-2 text-xs text-[#597267]">Current time: {date(task.starts_at)} – {date(task.ends_at)}</p> : null}
            {task.request_type === "reschedule" ? (
                <p className="mt-1 text-xs font-semibold text-[#087a4a]">Requested: {date(task.requested_starts_at)} – {date(task.requested_ends_at)}</p>
            ) : (
                <p className="mt-1 text-xs text-[#597267]">Verified payments: {price(task.verified_paid) ?? "BDT 0"}</p>
            )}
            <div className="mt-4 space-y-3 border-t border-[#e4ece7] pt-3">
                {task.request_type === "cancellation" ? (
                    <fieldset className="grid gap-2 sm:grid-cols-3">
                        <legend className="mb-1 text-xs font-semibold text-[#597267]">Optional: record a refund already paid (leave all blank if none)</legend>
                        <input aria-label="Refund amount" type="number" min="0.01" step="0.01" value={refundAmount}
                            onChange={(event) => setRefundAmount(event.target.value)} placeholder="Amount (BDT)"
                            className="min-h-10 rounded-lg border border-[#cbd9d0] px-3 text-sm" />
                        <input aria-label="Refund method" value={refundMethod} onChange={(event) => setRefundMethod(event.target.value)}
                            maxLength={100} placeholder="Refund method" className="min-h-10 rounded-lg border border-[#cbd9d0] px-3 text-sm" />
                        <input aria-label="Refund transaction reference" value={refundReference} onChange={(event) => setRefundReference(event.target.value)}
                            maxLength={200} placeholder="Transfer reference" className="min-h-10 rounded-lg border border-[#cbd9d0] px-3 text-sm" />
                    </fieldset>
                ) : null}
                <label className="block text-xs font-semibold text-[#597267]">
                    Decision reason
                    <textarea rows={2} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-[#cbd9d0] px-3 py-2 text-sm" />
                </label>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => decide("approve")} disabled={busy || reason.trim().length < 3}
                        className="min-h-10 rounded-lg bg-[#087a4a] px-4 text-sm font-bold text-white disabled:opacity-50">
                        Approve {task.request_type === "cancellation" ? "cancellation" : "reschedule"}
                    </button>
                    <button type="button" onClick={() => decide("reject")} disabled={busy || reason.trim().length < 3}
                        className="min-h-10 rounded-lg border border-red-300 px-4 text-sm font-bold text-red-800 disabled:opacity-50">Reject request</button>
                </div>
                {error ? <p role="alert" className="text-sm text-red-800">{error}</p> : null}
            </div>
        </article>
    );
}

export function TurfStaffQueue({ tasks, changeRequests = [] }: { tasks: unknown[]; changeRequests?: unknown[] }) {
    const parsedTasks = tasks.filter(isRecord);
    const parsedChanges = changeRequests.filter(isRecord);
    if (!parsedTasks.length && !parsedChanges.length) {
        return <p className="rounded-2xl border border-dashed border-[#cbd9d0] bg-white p-6 text-sm text-[#597267]">No open staff tasks. New requests, overdue items, and payment reviews will appear here.</p>;
    }
    return (
        <div className="space-y-3">
            {parsedChanges.map((task, index) => <ChangeReviewTask key={`change-${String(task.id ?? index)}`} task={task} />)}
            {parsedTasks.map((task, index) => <ReviewTask key={String(task.id ?? index)} task={task} />)}
        </div>
    );
}
