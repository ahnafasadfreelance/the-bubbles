"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function localDhakaDateTime(value: string) {
    const date = new Date(value);
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Dhaka",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function TurfChangeRequestForm({
    bookingId,
    status,
    startsAt,
    endsAt,
    requests,
}: {
    bookingId: string;
    status: string;
    startsAt: string;
    endsAt: string;
    requests: Array<{ request_type: string; status: string; reason: string; review_reason: string | null; created_at: string }>;
}) {
    const router = useRouter();
    const [requestType, setRequestType] = useState<"cancellation" | "reschedule">("cancellation");
    const [reason, setReason] = useState("");
    const [requestedStart, setRequestedStart] = useState(localDhakaDateTime(startsAt));
    const [requestedEnd, setRequestedEnd] = useState(localDhakaDateTime(endsAt));
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const canCancel = ["pending", "approved_awaiting_payment", "payment_under_review", "confirmed"].includes(status);
    const canReschedule = status === "confirmed";
    const pendingRequest = requests.find((request) => request.status === "pending");

    if (!canCancel) return null;
    if (pendingRequest) {
        return (
            <section className="mt-8 border-t border-[#e8efea] pt-6">
                <h2 className="text-lg font-extrabold">Change request awaiting staff</h2>
                <p className="mt-2 text-sm text-[#597267]">
                    Your {pendingRequest.request_type} request is pending. Your booking remains unchanged until staff decides.
                </p>
                <p className="mt-1 text-xs text-[#6a8176]">Submitted {new Intl.DateTimeFormat("en-BD", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" }).format(new Date(pendingRequest.created_at))}</p>
            </section>
        );
    }

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy || reason.trim().length < 3) return;
        setBusy(true);
        setError(null);
        setMessage(null);
        try {
            const response = await fetch("/api/turf/changes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    bookingId,
                    requestType,
                    reason: reason.trim(),
                    startsAt: requestType === "reschedule" ? `${requestedStart}:00+06:00` : null,
                    endsAt: requestType === "reschedule" ? `${requestedEnd}:00+06:00` : null,
                }),
            });
            const result: unknown = await response.json();
            if (!response.ok) {
                throw new Error(typeof result === "object" && result !== null && "error" in result
                    && typeof result.error === "string" ? result.error : "Request could not be saved.");
            }
            setMessage("Your request was sent to staff for review. Your current booking remains unchanged until it is decided.");
            setReason("");
            router.refresh();
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : "Request could not be saved.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="mt-8 border-t border-[#e8efea] pt-6">
            <h2 className="text-lg font-extrabold">Request a booking change</h2>
            <p className="mt-1 text-sm text-[#597267]">Cancellation and rescheduling requests require staff approval. Any refund is decided and recorded by staff.</p>
            <form onSubmit={submit} className="mt-3 space-y-3">
                <label className="block text-sm font-semibold">
                    Change requested
                    <select value={requestType} onChange={(event) => setRequestType(event.target.value as "cancellation" | "reschedule")}
                        className="mt-1 min-h-11 w-full rounded-lg border border-[#cbd9d0] bg-white px-3">
                        <option value="cancellation">Cancel this booking</option>
                        {canReschedule ? <option value="reschedule">Request a different time</option> : null}
                    </select>
                </label>
                {requestType === "reschedule" ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm font-semibold">New start (Dhaka time)
                            <input type="datetime-local" required value={requestedStart} onChange={(event) => setRequestedStart(event.target.value)}
                                className="mt-1 min-h-11 w-full rounded-lg border border-[#cbd9d0] px-3" />
                        </label>
                        <label className="block text-sm font-semibold">New end (Dhaka time)
                            <input type="datetime-local" required value={requestedEnd} onChange={(event) => setRequestedEnd(event.target.value)}
                                className="mt-1 min-h-11 w-full rounded-lg border border-[#cbd9d0] px-3" />
                        </label>
                    </div>
                ) : null}
                <label className="block text-sm font-semibold">
                    Reason
                    <textarea required minLength={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)}
                        rows={3} className="mt-1 w-full rounded-lg border border-[#cbd9d0] px-3 py-2" />
                </label>
                <button type="submit" disabled={busy || reason.trim().length < 3}
                    className="min-h-11 rounded-xl bg-[#087a4a] px-5 text-sm font-bold text-white disabled:opacity-50">
                    {busy ? "Sending..." : "Send request for review"}
                </button>
                {message ? <p role="status" className="text-sm text-[#087a4a]">{message}</p> : null}
                {error ? <p role="alert" className="text-sm text-red-800">{error}</p> : null}
            </form>
        </section>
    );
}
