"use client";

import { useRef, useState } from "react";

type TurfPaymentMethod = {
    method: string;
    display_name: string;
    account_details: string;
    account_type: string;
    instructions: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function TurfPaymentForm({
    bookingId,
    methods,
    outstandingAdvance,
}: {
    bookingId: string;
    methods: TurfPaymentMethod[];
    outstandingAdvance: number;
}) {
    const [method, setMethod] = useState(methods[0]?.method ?? "");
    const [amount, setAmount] = useState(outstandingAdvance);
    const [reference, setReference] = useState("");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [submitted, setSubmitted] = useState(false);
    const idempotencyKey = useRef<string | null>(null);
    const selectedMethod = methods.find((item) => item.method === method);

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        setBusy(true);
        idempotencyKey.current ??= crypto.randomUUID();
        try {
            const response = await fetch("/api/turf/payments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    bookingId,
                    method,
                    amount,
                    reference,
                    note: note || null,
                    idempotencyKey: idempotencyKey.current,
                }),
            });
            const result: unknown = await response.json();
            if (!response.ok) {
                throw new Error(isRecord(result) && typeof result.error === "string"
                    ? result.error
                    : "Payment details could not be submitted.");
            }
            setSubmitted(true);
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : "Payment details could not be submitted.");
        } finally {
            setBusy(false);
        }
    }

    if (submitted) {
        return <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
            Payment details submitted for staff review. Your booking is not confirmed until staff verify the payment.
        </p>;
    }

    if (methods.length === 0) {
        return <p className="mt-3 text-sm leading-6 text-[#597267]">
            No online payment methods are configured. Contact The Bubbles for payment instructions; do not send money to an unverified account.
        </p>;
    }

    return (
        <form onSubmit={submit} className="mt-4 space-y-4">
            <div>
                <label htmlFor="turf-payment-method" className="block text-sm font-bold">Payment method</label>
                <select id="turf-payment-method" required value={method} onChange={(event) => setMethod(event.target.value)}
                    className="mt-2 min-h-11 w-full rounded-xl border border-[#cbd9d0] bg-white px-3 text-sm">
                    {methods.map((paymentMethod) => (
                        <option key={paymentMethod.method} value={paymentMethod.method}>{paymentMethod.display_name}</option>
                    ))}
                </select>
            </div>
            {selectedMethod ? (
                <div className="rounded-xl bg-[#f4f8f6] p-4 text-sm">
                    <p className="font-bold">{selectedMethod.account_type}</p>
                    <p className="mt-1 break-all font-mono">{selectedMethod.account_details}</p>
                    <p className="mt-2 whitespace-pre-wrap text-[#597267]">{selectedMethod.instructions}</p>
                </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <label htmlFor="turf-payment-reference" className="block text-sm font-bold">Transaction/reference ID</label>
                    <input id="turf-payment-reference" required maxLength={200} value={reference}
                        onChange={(event) => setReference(event.target.value)}
                        className="mt-2 min-h-11 w-full rounded-xl border border-[#cbd9d0] px-3 text-sm" />
                </div>
                <div>
                    <label htmlFor="turf-payment-amount" className="block text-sm font-bold">Amount (BDT)</label>
                    <input id="turf-payment-amount" required type="number" min="0.01" max={outstandingAdvance}
                        step="0.01" value={amount} onChange={(event) => setAmount(Number(event.target.value))}
                        className="mt-2 min-h-11 w-full rounded-xl border border-[#cbd9d0] px-3 text-sm" />
                </div>
            </div>
            <div>
                <label htmlFor="turf-payment-note" className="block text-sm font-bold">Note <span className="font-normal text-[#6a8176]">(optional)</span></label>
                <textarea id="turf-payment-note" maxLength={2000} rows={2} value={note}
                    onChange={(event) => setNote(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-[#cbd9d0] px-3 py-2 text-sm" />
            </div>
            {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
            <button type="submit" disabled={busy || !method || amount <= 0 || amount > outstandingAdvance || !reference.trim()}
                className="min-h-11 w-full rounded-xl bg-[#087a4a] px-4 font-bold text-white hover:bg-[#06643d] disabled:cursor-not-allowed disabled:bg-[#a8b8af]">
                {busy ? "Submitting…" : "Submit payment for verification"}
            </button>
            <p className="text-xs leading-5 text-[#6a8176]">A transaction reference is not proof of payment. Staff will verify the actual receipt before your booking can be confirmed.</p>
        </form>
    );
}
