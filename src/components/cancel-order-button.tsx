"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { cancelCustomerOrderAction } from "@/app/cart/actions";

export function CancelOrderButton({ orderId }: { orderId: string }) {
    const router = useRouter();
    const [confirming, setConfirming] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    async function cancel() {
        setSubmitting(true);
        setMessage(null);
        try {
            const result = await cancelCustomerOrderAction(orderId);
            if (result === "cancelled") {
                setMessage("Your order was cancelled.");
                setConfirming(false);
                router.refresh();
            } else if (result === "not_cancellable") {
                setMessage("This order can no longer be cancelled.");
                setConfirming(false);
                router.refresh();
            } else {
                setMessage(result === "not_found" ? "Order not found." : "We could not cancel the order. Please try again.");
            }
        } catch {
            setMessage("We could not cancel the order. Please try again.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div>
            {confirming ? (
                <div className="rounded-2xl border border-[#e0a239]/40 bg-[#241f15] p-4" role="group" aria-label="Confirm order cancellation">
                    <p className="text-sm font-semibold text-[#ffe1a1]">Cancel this pending order?</p>
                    <p className="mt-1 text-xs leading-5 text-[#cbb98d]">This cannot be undone.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => void cancel()} disabled={submitting} className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#9c3535] px-4 text-sm font-bold text-white transition-colors hover:bg-[#812a2a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff9292] disabled:cursor-wait disabled:opacity-60">
                            {submitting ? "Cancelling…" : "Yes, cancel order"}
                        </button>
                        <button type="button" onClick={() => setConfirming(false)} disabled={submitting} className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#315066] px-4 text-sm font-bold text-[#d7e6ef] transition-colors hover:border-[#8aa0b3] disabled:opacity-60">
                            Keep order
                        </button>
                    </div>
                </div>
            ) : (
                <button type="button" onClick={() => setConfirming(true)} className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#ff7070]/45 px-4 text-sm font-bold text-[#ff9292] transition-colors hover:bg-[#ff7070]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff9292]">
                    Cancel pending order
                </button>
            )}
            {message ? <p role="status" className="mt-2 text-xs text-[#a8bed2]">{message}</p> : null}
        </div>
    );
}