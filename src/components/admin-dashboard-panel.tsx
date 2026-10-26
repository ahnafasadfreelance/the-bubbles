"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, BadgeCheck, Banknote, Bell, BellOff, CalendarDays, ChefHat, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, CreditCard, Filter, PackageCheck, RefreshCw, Search, Users, Wallet, X, type LucideIcon } from "lucide-react";

import {
    loadAdminDashboardAction,
    loadOrderManagementDashboardAction,
    setAdminPreparationEstimateAction,
    transitionAdminOrderAction,
} from "@/app/admin/actions";
import { recordOrderPaymentAction, type RecordOrderPaymentResult } from "@/app/admin/payment-actions";
import { formatPrice } from "@/lib/format-price";
import { createClient } from "@/lib/supabase/client";
import { activateNotificationAudio, playNotificationSound } from "@/lib/notification-sound";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, canTransitionOrder, type OrderStatus } from "@/lib/order-status";
import type { AdminDashboard, AdminDashboardResult, AdminOrder, AdminOrderBucket } from "@/lib/admin-data";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, type PaymentMethod, type PaymentStatus } from "@/lib/payment";
import type { AdminRole } from "@/lib/admin-auth";
import { useAdminTableVisitNotifications } from "@/components/admin-table-visit-notifications";

const DEFAULT_PAGE_SIZE = 25;
const NOTIFICATION_PREFERENCE_KEY = "blue-table-admin-order-notifications";
const STATUS_STYLES: Record<OrderStatus, string> = {
    pending: "border-[#f0d49b] bg-[#fff7e7] text-[#805312]",
    confirmed: "border-[#b7d7ed] bg-[#edf7fd] text-[#13577e]",
    preparing: "border-[#c3c6ed] bg-[#f0f1ff] text-[#444b89]",
    ready: "border-[#b7dfd4] bg-[#eaf8f3] text-[#236c58]",
    completed: "border-[#c8d9e7] bg-[#f1f6fa] text-[#4b6477]",
    rejected: "border-[#edc2c2] bg-[#fff1f1] text-[#8c3737]",
    cancelled: "border-[#d4dce2] bg-[#f3f5f6] text-[#5e6b74]",
};
const STATUS_BADGE_STYLES = "inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-extrabold tracking-wide shadow-sm ring-1 ring-inset ring-white/50 bg-gradient-to-b from-white/55 via-white/10 to-black/5";
const ORDER_ROW_STYLES: Record<OrderStatus, string> = {
    pending: "border-[#edcf8f] bg-[#fff6df]",
    confirmed: "border-[#b7d7ed] bg-[#eaf6ff]",
    preparing: "border-[#cac5f4] bg-[#f1efff]",
    ready: "border-[#afe0cb] bg-[#e8f8f0]",
    completed: "border-[#b8e2c8] bg-[#eaf8ee]",
    rejected: "border-[#efc0c6] bg-[#fff0f2]",
    cancelled: "border-[#d5dde4] bg-[#f1f4f6]",
};
const STATUS_ACCENTS: Record<OrderStatus, string> = {
    pending: "bg-[#f4aa16]",
    confirmed: "bg-[#078cf0]",
    preparing: "bg-[#6858ef]",
    ready: "bg-[#12ae67]",
    completed: "bg-[#0aa783]",
    rejected: "bg-[#e34b5e]",
    cancelled: "bg-[#647789]",
};
const PAYMENT_STATUS_STYLES: Record<PaymentStatus, string> = {
    unpaid: "border-[#f0d49b] bg-[#fff7e7] text-[#805312]",
    partially_paid: "border-[#b7d7ed] bg-[#edf7fd] text-[#13577e]",
    paid: "border-[#b7dfd4] bg-[#eaf8f3] text-[#236c58]",
    refunded: "border-[#d4dce2] bg-[#f3f5f6] text-[#5e6b74]",
};
const PAYMENT_METHOD_ICONS = {
    card: CreditCard,
    bkash: Wallet,
    cash: Banknote,
} satisfies Record<PaymentMethod, LucideIcon>;

type Filters = {
    status: OrderStatus | "all";
    search: string;
    offset: number;
    table?: string;
    fromDate?: string;
    toDate?: string;
    paymentStatus?: "all" | PaymentStatus;
    paymentMethod?: "all" | PaymentMethod;
};

function timestamp(value: string) {
    return new Date(value).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
}

function isDashboardResult(value: unknown): value is { ok: true; data: AdminDashboard } {
    return typeof value === "object" && value !== null && "ok" in value && value.ok === true && "data" in value;
}

function statusMessage(reason: string, currentStatus?: OrderStatus) {
    if (reason === "stale") return currentStatus
        ? `This order changed elsewhere and is now ${ORDER_STATUS_LABELS[currentStatus].toLowerCase()}. The latest order has been loaded.`
        : "This order changed elsewhere. The latest status has been loaded.";
    if (reason === "invalid_transition") return currentStatus
        ? `This order is now ${ORDER_STATUS_LABELS[currentStatus].toLowerCase()}; that change is no longer available.`
        : "That status change is no longer available for this order.";
    if (reason === "not_found") return "This order could not be found.";
    if (reason === "unauthorized") return "Your admin session is no longer authorized. Refresh and sign in again.";
    if (reason === "invalid") return "The requested change was invalid. Check the order and try again.";
    return "We could not save that change. Please retry.";
}

function statusForAction(status: OrderStatus): OrderStatus | null {
    return ORDER_STATUSES.find((next) => canTransitionOrder(status, next) && next !== "rejected" && next !== "cancelled") ?? null;
}

function OverviewKpi({ label, value, detail, accent, icon: Icon }: { label: string; value: string | number; detail: string; accent: string; icon: LucideIcon }) {
    return (
        <article className="min-w-0 rounded-md border border-[#16466d] bg-[#0b2e50] px-3 py-3 shadow-[0_8px_22px_rgba(0,0,0,0.12)] sm:px-3.5">
            <div className="flex items-center justify-between gap-2"><p className="truncate text-[9px] font-semibold text-[#b4c6d9] sm:text-[10px]">{label}</p><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${accent}`}><Icon className="h-3 w-3 text-white" aria-hidden="true" /></span></div>
            <p className="mt-2 text-[22px] font-bold leading-6 tabular-nums text-[#f5f9ff]">{value}</p>
            <p className="mt-1 truncate text-[9px] leading-3.5 text-[#91a9c2]">{detail}</p>
        </article>
    );
}

function PaymentMetric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
    return <article className="min-w-0 rounded-md border border-[#16466d] bg-[#082744] px-3 py-2.5"><h3 className="text-[9px] font-semibold uppercase tracking-wide text-[#91a9c2]">{label}</h3><p className="mt-1 truncate text-lg font-bold tabular-nums text-white">{value}</p><p className="mt-1 truncate text-[9px] text-[#91a9c2]" title={detail}>{detail}</p></article>;
}

function relativeTime(value: string) {
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

function preparationTimeRemaining(readyAt: string | null, now: number) {
    if (!readyAt || now <= 0) return null;
    return Math.max(0, Math.ceil((Date.parse(readyAt) - now) / 60000));
}

function PaymentCollectionDialog({
    order,
    onClose,
    onCollect,
}: {
    order: AdminOrder;
    onClose: () => void;
    onCollect: (order: AdminOrder, amount: number, method: PaymentMethod, notes: string, idempotencyKey: string) => Promise<RecordOrderPaymentResult>;
}) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [method, setMethod] = useState<PaymentMethod>(order.preferred_payment_method ?? "cash");
    const [amount, setAmount] = useState((order.total - order.amount_paid).toFixed(2));
    const [notes, setNotes] = useState("");
    const [verified, setVerified] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const retryKey = useRef<{ fingerprint: string; key: string } | null>(null);
    const outstanding = Math.max(0, order.total - order.amount_paid);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        dialog.showModal();
        return () => {
            if (dialog.open) dialog.close();
        };
    }, []);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const numericAmount = Number(amount);
        if (!verified || !Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > outstanding || Number(numericAmount.toFixed(2)) !== numericAmount) {
            setError("Enter a valid amount no greater than the outstanding balance, then confirm that you received and verified it.");
            return;
        }
        const fingerprint = JSON.stringify([order.id, numericAmount, method, notes.trim()]);
        if (!retryKey.current || retryKey.current.fingerprint !== fingerprint) {
            retryKey.current = { fingerprint, key: crypto.randomUUID() };
        }
        setBusy(true);
        setError("");
        try {
            const result = await onCollect(order, numericAmount, method, notes.trim(), retryKey.current.key);
            if (result.ok) {
                dialogRef.current?.close();
                onClose();
            } else {
                setError(result.reason === "amount_exceeds_balance"
                    ? "This order balance changed. Refresh the order before recording another amount."
                    : result.reason === "not_collectable"
                        ? "This order can no longer accept a payment."
                        : result.reason === "unauthorized"
                            ? "Your administrator session is no longer authorized. Refresh and sign in again."
                            : result.reason === "invalid"
                                ? "The payment details were invalid. Review them and try again."
                                : "The payment could not be recorded. Please retry; submitting the same details again is safe.");
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <dialog
            ref={dialogRef}
            role="dialog"
            aria-labelledby={`collect-payment-title-${order.id}`}
            onCancel={(event) => {
                event.preventDefault();
                if (!busy) onClose();
            }}
            className="fixed inset-0 z-[80] m-0 flex h-full max-h-none w-full max-w-none items-end justify-center overflow-y-auto bg-transparent p-0 backdrop:bg-[#03172b]/75 sm:items-center sm:p-4"
        >
            <form onSubmit={(event) => void submit(event)} className="w-full max-w-lg rounded-t-xl border border-[#d7e2ec] bg-white p-5 text-[#09294d] shadow-xl sm:rounded-xl">
                <h2 id={`collect-payment-title-${order.id}`} className="text-lg font-bold">Record payment · {order.order_number}</h2>
                <p className="mt-1 text-sm text-[#617991]">Table {order.table_number_snapshot} · Order total {formatPrice(order.total, order.currency)}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 rounded-md bg-[#f4f8fb] p-3 text-sm">
                    <div><dt className="text-xs text-[#617991]">Preferred method</dt><dd className="mt-1 font-semibold">{order.preferred_payment_method ? PAYMENT_METHOD_LABELS[order.preferred_payment_method] : "Not recorded"}</dd></div>
                    <div><dt className="text-xs text-[#617991]">Already collected</dt><dd className="mt-1 font-semibold tabular-nums">{formatPrice(order.amount_paid, order.currency)}</dd></div>
                    <div className="col-span-2 border-t border-[#dce6ed] pt-2"><dt className="text-xs font-semibold text-[#617991]">Outstanding balance</dt><dd className="mt-1 text-xl font-bold tabular-nums text-[#0759a8]">{formatPrice(outstanding, order.currency)}</dd></div>
                </dl>
                <fieldset className="mt-4">
                    <legend className="text-xs font-bold">Actual method received</legend>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                        {(["card", "bkash", "cash"] as const).map((value) => {
                            const Icon = PAYMENT_METHOD_ICONS[value];
                            return <label key={value} className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border px-2 text-xs font-semibold focus-within:ring-2 focus-within:ring-[#087bc1] ${method === value ? "border-[#087bc1] bg-[#e9f8fd] text-[#0759a8]" : "border-[#cbdbe7] text-[#37566f]"}`}><input type="radio" name={`payment-method-${order.id}`} value={value} checked={method === value} onChange={() => setMethod(value)} className="sr-only" /><Icon className="h-4 w-4" aria-hidden="true" />{PAYMENT_METHOD_LABELS[value]}</label>;
                        })}
                    </div>
                </fieldset>
                {method === "bkash" || method === "card" ? <p className="mt-2 text-xs leading-5 text-[#617991]">Verify receipt using the restaurant&apos;s actual {method === "bkash" ? "bKash process" : "card terminal"} before recording it.</p> : null}
                <label className="mt-4 block text-xs font-bold">Amount received
                    <span className="mt-1 flex gap-2">
                        <input type="number" required min="0.01" max={outstanding.toFixed(2)} step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="h-11 min-w-0 flex-1 rounded-md border border-[#cbdbe7] px-3 text-sm font-normal outline-none focus:border-[#087bc1] focus:ring-2 focus:ring-[#087bc1]/20" />
                        <button type="button" onClick={() => setAmount(outstanding.toFixed(2))} className="min-h-11 rounded-md border border-[#b9d0e1] px-3 text-xs font-semibold text-[#0759a8] hover:bg-[#edf8ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087bc1]">Full balance</button>
                    </span>
                </label>
                <label className="mt-3 block text-xs font-bold">Collection note <span className="font-normal text-[#71879a]">(optional)</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={300} rows={2} className="mt-1 w-full rounded-md border border-[#cbdbe7] px-3 py-2 text-sm font-normal outline-none focus:border-[#087bc1] focus:ring-2 focus:ring-[#087bc1]/20" /></label>
                <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-[#37566f]"><input type="checkbox" required checked={verified} onChange={(event) => setVerified(event.target.checked)} className="mt-1 accent-[#087bc1]" />I confirm I physically received and manually verified this payment at the table.</label>
                {error ? <p role="alert" className="mt-3 rounded border-l-2 border-[#a32929] bg-[#fff3f3] px-3 py-2 text-xs text-[#7a2929]">{error}</p> : null}
                <div className="mt-5 flex justify-end gap-2">
                    <button type="button" disabled={busy} onClick={onClose} className="min-h-10 rounded border border-[#b9d0e1] px-4 text-sm font-semibold text-[#37566f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087bc1] disabled:opacity-50">Cancel</button>
                    <button type="submit" disabled={busy || !verified} className="min-h-10 rounded bg-[#0759a8] px-4 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087bc1] disabled:opacity-50">{busy ? "Recording…" : "Confirm collection"}</button>
                </div>
            </form>
        </dialog>
    );
}

function OrderCard({
    order,
    busy,
    onTransition,
    onEstimate,
    estimateRange,
    clockNow,
    detailsOpen = false,
    onCollect,
}: {
    order: AdminOrder;
    busy: boolean;
    onTransition: (order: AdminOrder, nextStatus: OrderStatus) => void;
    onEstimate: (order: AdminOrder, minutes: number) => void;
    estimateRange: { min: number; max: number };
    clockNow: number;
    detailsOpen?: boolean;
    onCollect: (order: AdminOrder, amount: number, method: PaymentMethod, notes: string, idempotencyKey: string) => Promise<RecordOrderPaymentResult>;
}) {
    const [collecting, setCollecting] = useState(false);
    const [estimate, setEstimate] = useState(order.estimated_preparation_minutes?.toString() ?? String(Math.min(Math.max(30, estimateRange.min), estimateRange.max)));
    const nextStatus = statusForAction(order.status);
    const showEstimate = order.status === "confirmed" || order.status === "preparing";
    const estimateExpired = order.status === "preparing"
        && order.estimated_ready_at !== null
        && clockNow > 0
        && Date.parse(order.estimated_ready_at) <= clockNow;
    const minutesRemaining = order.status === "preparing" ? preparationTimeRemaining(order.estimated_ready_at, clockNow) : null;

    return (
        <article className={`overflow-hidden rounded-lg border transition-colors duration-200 ${ORDER_ROW_STYLES[order.status]}`}>
            <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4 sm:px-5">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-[#09294d]">{order.order_number}</h3>
                        <span className={`${STATUS_BADGE_STYLES} px-2.5 py-1 text-[10px] sm:px-3 sm:py-1.5 sm:text-[11px] uppercase tracking-wider ${STATUS_STYLES[order.status]}`}>
                            {ORDER_STATUS_LABELS[order.status]}
                        </span>
                    </div>
                    <p className="mt-1 text-xs text-[#617991]">Submitted <time dateTime={order.created_at}>{timestamp(order.created_at)}</time></p>
                </div>
                <div className="text-right"><p className="text-sm font-bold tabular-nums text-[#09294d]">{formatPrice(order.total, order.currency)}</p><span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold ${PAYMENT_STATUS_STYLES[order.payment_status]}`}>{PAYMENT_STATUS_LABELS[order.payment_status]}</span></div>
            </div>

            <div className="grid gap-x-6 gap-y-3 border-t border-[#e4ecf2] px-4 py-4 text-xs sm:grid-cols-2 sm:px-5 lg:grid-cols-4">
                <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#7890a3]">Customer</p><p className="mt-1 truncate font-semibold text-[#234861]">{order.customer_name}</p>{order.customer_email ? <a className="mt-0.5 block truncate text-[#0871ad] underline decoration-transparent hover:decoration-current" href={`mailto:${encodeURIComponent(order.customer_email)}`}>{order.customer_email}</a> : <p className="mt-0.5 text-[#7890a3]">No email on file</p>}</div>
                <div><p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#7890a3]">Table</p><p className="mt-1 font-semibold text-[#234861]">{order.table_name_snapshot ? `${order.table_name_snapshot} · ${order.table_number_snapshot}` : `Table ${order.table_number_snapshot}`}</p></div>
                <div><p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#7890a3]">Payment</p><p className="mt-1 font-semibold text-[#234861]">Preferred · {order.preferred_payment_method ? PAYMENT_METHOD_LABELS[order.preferred_payment_method] : "Not recorded"}</p><p className="mt-0.5 text-[#617991]">Collected {formatPrice(order.amount_paid, order.currency)} · Due {formatPrice(Math.max(0, order.total - order.amount_paid), order.currency)}</p></div>
                <div><p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#7890a3]">Items</p><p className="mt-1 font-semibold text-[#234861]">{order.items.length} {order.items.length === 1 ? "dish" : "dishes"}</p></div>
            </div>

            <details open={detailsOpen || undefined} className={`group border-t border-[#244b68]/20 ${detailsOpen ? "[&>summary]:hidden" : ""}`}>
                <summary className="cursor-pointer list-none px-4 py-3 text-xs font-bold text-[#0759a8] outline-none hover:bg-white/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#087bc1] sm:px-5">
                    <span className="group-open:hidden">View order details</span><span className="hidden group-open:inline">Hide order details</span>
                </summary>
                <div className="grid gap-5 border-t border-[#244b68]/20 bg-white/65 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(220px,0.8fr)]">
                    <div>
                        <section aria-label="Order progress" className="mb-4 rounded-md border border-[#d9e5ef] bg-white p-3">
                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#617991]">Order progress</h4>
                            <ol className="mt-3 grid grid-cols-5 gap-1">
                                {(["pending", "confirmed", "preparing", "ready", "completed"] as const).map((step, index) => {
                                    const currentIndex = order.status === "rejected" || order.status === "cancelled"
                                        ? -1
                                        : (["pending", "confirmed", "preparing", "ready", "completed"] as const).indexOf(order.status);
                                    const reached = currentIndex >= index;
                                    return <li key={step} className="min-w-0 text-center">
                                        <span className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full border text-[9px] font-bold ${reached ? `${STATUS_ACCENTS[step]} border-transparent text-white` : "border-[#bdcbd7] bg-white text-[#71879a]"}`}>{reached && index < currentIndex ? <Check className="h-3 w-3" aria-hidden="true" /> : index + 1}</span>
                                        <span className={`mt-1 block truncate text-[8px] sm:text-[9px] ${reached ? "font-semibold text-[#234861]" : "text-[#71879a]"}`}>{index === 0 ? "Placed" : ORDER_STATUS_LABELS[step]}</span>
                                    </li>;
                                })}
                            </ol>
                            {order.status === "rejected" || order.status === "cancelled" ? <p className="mt-2 text-[10px] font-semibold text-[#8c3737]">{ORDER_STATUS_LABELS[order.status]}</p> : null}
                        </section>
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#617991]">Dishes</h4>
                        <ul className="mt-2 divide-y divide-[#e4ecf2]">
                            {order.items.map((item) => (
                                <li key={item.id} className="py-2 text-xs">
                                    <div className="flex items-start justify-between gap-4"><p className="font-semibold text-[#234861]">{item.quantity} × {item.item_name}</p><p className="shrink-0 tabular-nums text-[#37566f]">{formatPrice(item.line_total, order.currency)}</p></div>
                                    <p className="mt-0.5 text-[11px] text-[#71879a]">{formatPrice(item.unit_price, order.currency)} each</p>
                                    {item.special_instructions ? <p className="mt-1 border-l-2 border-[#80cfe3] pl-2 text-[11px] leading-5 text-[#37566f]">Dish note: {item.special_instructions}</p> : null}
                                </li>
                            ))}
                        </ul>
                        {order.customer_note ? <p className="mt-3 border-l-2 border-[#edc477] bg-[#fffaf0] px-3 py-2 text-xs leading-5 text-[#684d1f]"><strong>Order instructions:</strong> {order.customer_note}</p> : null}
                        {order.rejection_reason ? <p className="mt-3 border-l-2 border-[#d37a7a] bg-[#fff3f3] px-3 py-2 text-xs leading-5 text-[#7a2929]"><strong>Rejection reason:</strong> {order.rejection_reason}</p> : null}
                        <section className="mt-4 border-t border-[#e4ecf2] pt-3" aria-label="Payment history">
                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#617991]">Payment history · staff-recorded</h4>
                            {order.payment_collections.length ? <ul className="mt-2 space-y-2">{order.payment_collections.map((payment) => <li key={payment.id} className="rounded border border-[#d9e5ef] bg-white px-3 py-2 text-xs"><div className="flex flex-wrap justify-between gap-2"><span className="font-semibold text-[#234861]">{PAYMENT_METHOD_LABELS[payment.payment_method]} · {formatPrice(payment.amount, order.currency)}</span><time className="text-[#617991]" dateTime={payment.collected_at}>{timestamp(payment.collected_at)}</time></div><p className="mt-1 text-[#617991]">Recorded by {payment.collected_by_name} · staff ID {payment.collected_by} · manually verified by staff</p>{payment.notes ? <p className="mt-1 text-[#617991]">Note: {payment.notes}</p> : null}</li>)}</ul> : order.amount_paid > 0 ? <p className="mt-2 text-xs text-[#71879a]">This order was marked paid before payment-level history was introduced; no individual collection details are available.</p> : <p className="mt-2 text-xs text-[#71879a]">No payments recorded.</p>}
                        </section>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#617991]">Order total</h4>
                            <dl className="mt-2 space-y-1.5 text-xs">
                                <div className="flex justify-between gap-3"><dt className="text-[#617991]">Subtotal</dt><dd className="tabular-nums">{formatPrice(order.subtotal, order.currency)}</dd></div>
                                <div className="flex justify-between gap-3"><dt className="text-[#617991]">Discount</dt><dd className="tabular-nums">−{formatPrice(order.discount_total, order.currency)}</dd></div>
                                <div className="flex justify-between gap-3 border-t border-[#d9e5ef] pt-2 font-bold"><dt>Total due at counter</dt><dd className="tabular-nums">{formatPrice(order.total, order.currency)}</dd></div>
                            </dl>
                            <p className="mt-2 text-[10px] leading-4 text-[#71879a]">Payment recorded as {order.payment_status}; totals are order records, not collected payments.</p>
                        </div>
                        {showEstimate ? (
                            <form className="border-t border-[#e4ecf2] pt-3" onSubmit={(event) => { event.preventDefault(); const minutes = Number(estimate); if (Number.isInteger(minutes)) onEstimate(order, minutes); }}>
                                <label htmlFor={`estimate-${order.id}`} className="text-[10px] font-bold uppercase tracking-widest text-[#617991]">Estimated preparation</label>
                                <div className="mt-2 flex items-center gap-2">
                                    <input key={order.estimated_preparation_minutes ?? "unset"} id={`estimate-${order.id}`} type="number" min={estimateRange.min} max={estimateRange.max} step={1} value={estimate} onChange={(event) => setEstimate(event.target.value)} className="h-9 w-24 border border-[#cbdbe7] bg-white px-2 text-sm tabular-nums text-[#09294d] outline-none focus:border-[#087bc1] focus:ring-2 focus:ring-[#087bc1]/20" />
                                    <span className="text-xs text-[#617991]">minutes</span>
                                    <button type="submit" disabled={busy} className="ml-auto min-h-9 border border-[#b9d0e1] px-3 text-[11px] font-bold text-[#0759a8] hover:bg-[#edf8ff] disabled:opacity-50">Save estimate</button>
                                </div>
                                <p className="mt-1 text-[10px] text-[#71879a]">{estimateRange.min}–{estimateRange.max} minutes · estimate only, not elapsed time</p>
                                {order.preparation_started_at ? <p className="mt-2 text-[10px] text-[#617991]">Started <time dateTime={order.preparation_started_at}>{timestamp(order.preparation_started_at)}</time></p> : <p className="mt-2 text-[10px] text-[#71879a]">Countdown starts when staff begin preparation.</p>}
                                {order.estimated_ready_at ? <p className={`mt-1 text-[10px] font-semibold ${estimateExpired ? "text-[#9b5416]" : "text-[#617991]"}`}>{estimateExpired ? "Estimate expired · " : minutesRemaining !== null ? `${minutesRemaining} minutes remaining · ready ` : "Estimated ready · "}<time dateTime={order.estimated_ready_at}>{timestamp(order.estimated_ready_at)}</time></p> : null}
                            </form>
                        ) : order.estimated_preparation_minutes !== null || order.preparation_started_at || order.estimated_ready_at ? (
                            <div className="space-y-1 border-t border-[#e4ecf2] pt-3 text-[10px] text-[#617991]">
                                {order.estimated_preparation_minutes !== null ? <p>Estimated preparation: <strong className="text-[#234861]">{order.estimated_preparation_minutes} minutes</strong></p> : null}
                                {order.preparation_started_at ? <p>Started <time dateTime={order.preparation_started_at}>{timestamp(order.preparation_started_at)}</time></p> : null}
                                {order.estimated_ready_at ? <p className={estimateExpired ? "font-semibold text-[#9b5416]" : ""}>{estimateExpired ? "Estimate expired · " : minutesRemaining !== null ? `${minutesRemaining} minutes remaining · ready ` : "Estimated ready · "}<time dateTime={order.estimated_ready_at}>{timestamp(order.estimated_ready_at)}</time></p> : null}
                            </div>
                        ) : null}
                    </div>
                </div>
            </details>

            {order.status === "pending" || nextStatus ? (
                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#e4ecf2] px-4 py-3 sm:px-5">
                    {order.status === "pending" ? <button type="button" disabled={busy} onClick={() => onTransition(order, "rejected")} className="min-h-10 border border-[#e3baba] px-4 text-xs font-bold text-[#8b3333] hover:bg-[#fff2f2] disabled:cursor-not-allowed disabled:opacity-50">Reject</button> : null}
                    {nextStatus ? <button type="button" disabled={busy} onClick={() => onTransition(order, nextStatus)} className="min-h-10 bg-[#0759a8] px-4 text-xs font-bold text-white hover:bg-[#064987] disabled:cursor-not-allowed disabled:opacity-50">{nextStatus === "confirmed" ? "Accept order" : nextStatus === "preparing" ? "Start preparing" : nextStatus === "ready" ? "Mark ready" : "Complete order"}</button> : null}
                </div>
            ) : null}
            {order.status !== "rejected" && order.status !== "cancelled" && order.payment_status !== "refunded" && order.total > order.amount_paid ? (
                <div className="flex justify-end border-t border-[#e4ecf2] px-4 py-3 sm:px-5">
                    <button type="button" onClick={() => setCollecting(true)} className="min-h-10 rounded-md bg-[#0759a8] px-4 text-xs font-bold text-white hover:bg-[#064987] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087bc1]">Collect payment</button>
                </div>
            ) : null}
            {collecting ? <PaymentCollectionDialog order={order} onClose={() => setCollecting(false)} onCollect={onCollect} /> : null}
        </article>
    );
}

export function AdminDashboardPanel({
    initialResult,
    initialStatus = "pending",
    variant = "orders",
    buckets = [],
    estimateRange = { min: 5, max: 240 },
    customerCount = null,
    role = "owner",
}: {
    initialResult: AdminDashboardResult;
    initialStatus?: OrderStatus | "all";
    variant?: "overview" | "orders";
    buckets?: AdminOrderBucket[];
    estimateRange?: { min: number; max: number };
    customerCount?: number | null;
    role?: AdminRole;
}) {
    const pageSize = variant === "orders" ? 20 : DEFAULT_PAGE_SIZE;
    const initialData = initialResult.ok ? initialResult.data : null;
    const [dashboard, setDashboard] = useState<AdminDashboard | null>(initialData);
    const [clockNow, setClockNow] = useState(0);
    const [status, setStatus] = useState<OrderStatus | "all">(initialStatus);
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [tableInput, setTableInput] = useState("");
    const [table, setTable] = useState("");
    const [fromDateInput, setFromDateInput] = useState("");
    const [fromDate, setFromDate] = useState("");
    const [toDateInput, setToDateInput] = useState("");
    const [toDate, setToDate] = useState("");
    const [paymentInput, setPaymentInput] = useState<Filters["paymentStatus"]>("all");
    const [paymentStatus, setPaymentStatus] = useState<Filters["paymentStatus"]>("all");
    const [paymentMethodInput, setPaymentMethodInput] = useState<Filters["paymentMethod"]>("all");
    const [paymentMethod, setPaymentMethod] = useState<Filters["paymentMethod"]>("all");
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(false);
    const [requestError, setRequestError] = useState(initialResult.ok ? "" : initialResult.reason === "unconfigured"
        ? "Admin database access is not configured. Set NEXT_PUBLIC_SUPABASE_URL and the server-only SUPABASE_SERVICE_ROLE_KEY."
        : "Order data could not be loaded. Check the database setup and retry.");
    const [actionMessage, setActionMessage] = useState("");
    const [successToast, setSuccessToast] = useState("");
    const [busy, setBusy] = useState(false);
    const [muted, setMuted] = useState(true);
    const [newOrderNotice, setNewOrderNotice] = useState("");
    const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "fallback">(role === "order_management" ? "connected" : "connecting");
    const [openOrderId, setOpenOrderId] = useState<string | null>(null);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [pendingTransition, setPendingTransition] = useState<{ order: AdminOrder; nextStatus: OrderStatus } | null>(null);
    const [rejectionReason, setRejectionReason] = useState("");
    const seenOrderIds = useRef(new Set((initialData?.orders ?? []).filter((order) => order.status === "pending").map((order) => order.id)));
    const requestId = useRef(0);
    const searchDebounce = useRef<number | null>(null);
    const detailCloseButton = useRef<HTMLButtonElement>(null);
    const filterCloseButton = useRef<HTMLButtonElement>(null);
    const filterTriggerButton = useRef<HTMLButtonElement>(null);
    const confirmCancelButton = useRef<HTMLButtonElement>(null);
    const detailTrigger = useRef<HTMLElement | null>(null);
    const refreshState = useRef({ busy, muted, status, search, offset, table, fromDate, toDate, paymentStatus, paymentMethod });
    const filters = { status, search, offset, table, fromDate, toDate, paymentStatus, paymentMethod } satisfies Filters;

    useEffect(() => {
        const timer = window.setTimeout(() => {
            try {
                setMuted(window.localStorage.getItem(NOTIFICATION_PREFERENCE_KEY) !== "unmuted");
            } catch {
                setActionMessage("Notification preference storage is unavailable. Your choice may not persist after reload.");
            }
        }, 0);
        return () => window.clearTimeout(timer);
    }, []);

    function updateNotificationPreference(nextMuted: boolean) {
        setMuted(nextMuted);
        try {
            window.localStorage.setItem(NOTIFICATION_PREFERENCE_KEY, nextMuted ? "muted" : "unmuted");
        } catch {
            setActionMessage("Notification preference could not be saved. Your choice may not persist after reload.");
        }
    }

    useEffect(() => {
        refreshState.current = { busy, muted, status, search, offset, table, fromDate, toDate, paymentStatus, paymentMethod };
    }, [busy, muted, offset, search, status, table, fromDate, toDate, paymentStatus, paymentMethod]);

    useEffect(() => {
        const firstTick = window.setTimeout(() => setClockNow(Date.now()), 0);
        const interval = window.setInterval(() => setClockNow(Date.now()), 30000);
        return () => {
            window.clearTimeout(firstTick);
            window.clearInterval(interval);
        };
    }, []);

    useEffect(() => {
        if (!successToast) return;
        const timeout = window.setTimeout(() => setSuccessToast(""), 3500);
        return () => window.clearTimeout(timeout);
    }, [successToast]);

    const modalOpen = Boolean(openOrderId || filtersOpen || pendingTransition);
    const { setOrderModalOpen } = useAdminTableVisitNotifications();
    useEffect(() => {
        setOrderModalOpen(modalOpen);
        return () => setOrderModalOpen(false);
    }, [modalOpen, setOrderModalOpen]);

    useEffect(() => {
        if (!modalOpen) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") {
                const activeDialog = document.activeElement instanceof HTMLElement
                    ? document.activeElement.closest<HTMLElement>('[role="dialog"][aria-modal="true"]')
                    : null;
                const label = activeDialog?.getAttribute("aria-labelledby");
                if (label === "order-confirm-title") setPendingTransition(null);
                else if (label === "order-filters-title") {
                    setFiltersOpen(false);
                    filterTriggerButton.current?.focus();
                } else {
                    setOpenOrderId(null);
                    detailTrigger.current?.focus();
                }
                return;
            }
            if (event.key !== "Tab") return;
            const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'));
            const topDialog = dialogs.reduce<HTMLElement | null>((top, current) => {
                if (!top) return current;
                const currentLayer = Number.parseInt(window.getComputedStyle(current.parentElement ?? current).zIndex, 10) || 0;
                const topLayer = Number.parseInt(window.getComputedStyle(top.parentElement ?? top).zIndex, 10) || 0;
                return currentLayer > topLayer ? current : top;
            }, null);
            if (!topDialog) return;
            const focusable = Array.from(topDialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'))
                .filter((element) => element.offsetParent !== null);
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && (document.activeElement === first || !topDialog.contains(document.activeElement))) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (document.activeElement === last || !topDialog.contains(document.activeElement))) {
                event.preventDefault();
                first.focus();
            }
        }
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [modalOpen]);

    useEffect(() => {
        if (openOrderId) detailCloseButton.current?.focus();
    }, [openOrderId]);
    useEffect(() => {
        if (filtersOpen) filterCloseButton.current?.focus();
    }, [filtersOpen]);
    useEffect(() => {
        if (pendingTransition) confirmCancelButton.current?.focus();
    }, [pendingTransition]);

    useEffect(() => () => {
        if (searchDebounce.current !== null) window.clearTimeout(searchDebounce.current);
    }, []);

    const fetchDashboard = useCallback(async (nextFilters: Filters, quiet = false) => {
        const currentRequest = ++requestId.current;
        if (!quiet) setLoading(true);
        const filtersWithLimit = { ...nextFilters, limit: pageSize };
        const result = role === "order_management"
            ? await loadOrderManagementDashboardAction(filtersWithLimit)
            : await loadAdminDashboardAction(filtersWithLimit);
        if (currentRequest !== requestId.current) return;
        if (isDashboardResult(result)) {
            setDashboard(result.data);
            setRequestError("");
        } else {
            setRequestError("reason" in result && result.reason === "unauthorized"
                ? "Admin authorization is no longer available. Refresh the page and sign in again."
                : "reason" in result && result.reason === "unconfigured"
                    ? "Admin database access is not configured. Set NEXT_PUBLIC_SUPABASE_URL and the server-only SUPABASE_SERVICE_ROLE_KEY."
                    : "Order data could not be loaded. Check the database setup and retry.");
        }
        if (!quiet) setLoading(false);
    }, [pageSize, role]);

    useEffect(() => {
        let active = true;
        let refreshing = false;
        let fallbackTimer: number | null = null;
        if (role === "order_management") {
            const refreshOperationalOrders = async () => {
                if (!active || refreshing || refreshState.current.busy) return;
                refreshing = true;
                try {
                    const pendingResult = await loadOrderManagementDashboardAction({ status: "pending", search: "", offset: 0 });
                    if (!active || !isDashboardResult(pendingResult)) return;
                    const freshOrders = pendingResult.data.orders.filter((order) => !seenOrderIds.current.has(order.id));
                    for (const order of pendingResult.data.orders) seenOrderIds.current.add(order.id);
                    if (freshOrders.length > 0) {
                        setNewOrderNotice(`${freshOrders.length} new pending ${freshOrders.length === 1 ? "order" : "orders"}: ${freshOrders.map((order) => order.order_number).join(", ")}`);
                        if (!refreshState.current.muted) playNotificationSound("newOrder");
                    }
                    await fetchDashboard(refreshState.current, true);
                } catch {
                    if (active) setRequestError("Order data could not be refreshed. Your last loaded orders are still shown.");
                } finally {
                    refreshing = false;
                }
            };
            void refreshOperationalOrders();
            const interval = window.setInterval(refreshOperationalOrders, 10000);
            window.addEventListener("online", refreshOperationalOrders);
            document.addEventListener("visibilitychange", refreshOperationalOrders);
            return () => {
                active = false;
                window.clearInterval(interval);
                window.removeEventListener("online", refreshOperationalOrders);
                document.removeEventListener("visibilitychange", refreshOperationalOrders);
            };
        }
        const supabase = createClient();

        const reconcile = async () => {
            if (!active || refreshing || refreshState.current.busy) return;
            refreshing = true;
            const pollRequest = ++requestId.current;
            try {
                const pendingResult = await loadAdminDashboardAction({ status: "pending", search: "", offset: 0 });
                if (!active || pollRequest !== requestId.current || !isDashboardResult(pendingResult)) return;

                const freshOrders = pendingResult.data.orders.filter((order) => !seenOrderIds.current.has(order.id));
                for (const order of pendingResult.data.orders) seenOrderIds.current.add(order.id);
                if (freshOrders.length > 0) {
                    setNewOrderNotice(`${freshOrders.length} new pending ${freshOrders.length === 1 ? "order" : "orders"}: ${freshOrders.map((order) => order.order_number).join(", ")}`);
                    if (!refreshState.current.muted) playNotificationSound("newOrder");
                }

                const currentState = refreshState.current;
                setDashboard((current) => current ? {
                    ...current,
                    summary: pendingResult.data.summary,
                    status_counts: pendingResult.data.status_counts,
                    payment_overview: pendingResult.data.payment_overview,
                    ...(currentState.status === "pending" && currentState.search === "" && currentState.offset === 0 ? {
                        orders: pendingResult.data.orders,
                        total: pendingResult.data.total,
                    } : {}),
                } : current);

                if (currentState.status !== "pending" || currentState.search !== "" || currentState.offset !== 0 || currentState.table !== "" || currentState.fromDate !== "" || currentState.toDate !== "" || currentState.paymentStatus !== "all" || currentState.paymentMethod !== "all") {
                    const currentResult = await loadAdminDashboardAction(currentState);
                    if (!active || pollRequest !== requestId.current) return;
                    if (isDashboardResult(currentResult)) {
                        setDashboard((current) => current ? { ...current, orders: currentResult.data.orders, total: currentResult.data.total, summary: currentResult.data.summary, payment_overview: currentResult.data.payment_overview } : current);
                    }
                }
            } finally {
                refreshing = false;
            }
        };

        const startFallback = () => {
            if (fallbackTimer === null) fallbackTimer = window.setInterval(() => void reconcile(), 30000);
        };

        const channel = supabase
            .channel("admin-order-updates")
            .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void reconcile())
            .subscribe((status) => {
                if (!active) return;
                if (status === "SUBSCRIBED") {
                    void supabase.rpc("admin_order_realtime_enabled").then(({ data, error }) => {
                        if (!active) return;
                        if (error || data !== true) {
                            setRealtimeStatus("fallback");
                            startFallback();
                            return;
                        }
                        setRealtimeStatus("connected");
                        if (fallbackTimer !== null) window.clearInterval(fallbackTimer);
                        fallbackTimer = null;
                        void reconcile();
                    });
                } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
                    setRealtimeStatus("fallback");
                    startFallback();
                }
            });

        const onOnline = () => void reconcile();
        const onVisibilityChange = () => {
            if (document.visibilityState === "visible") void reconcile();
        };
        window.addEventListener("online", onOnline);
        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => {
            active = false;
            window.removeEventListener("online", onOnline);
            document.removeEventListener("visibilitychange", onVisibilityChange);
            if (fallbackTimer !== null) window.clearInterval(fallbackTimer);
            void supabase.removeChannel(channel);
        };
    }, [fetchDashboard, role]);

    async function selectStatus(nextStatus: OrderStatus | "all") {
        setStatus(nextStatus);
        setOffset(0);
        setActionMessage("");
        await fetchDashboard({ status: nextStatus, search, offset: 0, table, fromDate, toDate, paymentStatus, paymentMethod });
    }

    async function submitSearch(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (searchDebounce.current !== null) window.clearTimeout(searchDebounce.current);
        const nextSearch = searchInput.trim();
        setSearch(nextSearch);
        setOffset(0);
        await fetchDashboard({ status, search: nextSearch, offset: 0, table, fromDate, toDate, paymentStatus, paymentMethod });
    }

    function updateSearchInput(value: string) {
        setSearchInput(value);
        if (searchDebounce.current !== null) window.clearTimeout(searchDebounce.current);
        searchDebounce.current = window.setTimeout(() => {
            const nextSearch = value.trim();
            const current = refreshState.current;
            setSearch(nextSearch);
            setOffset(0);
            void fetchDashboard({ status: current.status, search: nextSearch, offset: 0, table: current.table, fromDate: current.fromDate, toDate: current.toDate, paymentStatus: current.paymentStatus, paymentMethod: current.paymentMethod });
        }, 350);
    }

    async function applyAdditionalFilters(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (fromDateInput && toDateInput && fromDateInput > toDateInput) {
            setActionMessage("The start date must be on or before the end date.");
            return;
        }
        setTable(tableInput.trim());
        setFromDate(fromDateInput);
        setToDate(toDateInput);
        setPaymentStatus(paymentInput);
        setPaymentMethod(paymentMethodInput);
        setOffset(0);
        setActionMessage("");
        await fetchDashboard({ status, search, offset: 0, table: tableInput.trim(), fromDate: fromDateInput, toDate: toDateInput, paymentStatus: paymentInput, paymentMethod: paymentMethodInput });
    }

    async function changePage(nextOffset: number) {
        const safeOffset = Math.max(0, Math.min(nextOffset, Math.max(0, (dashboard?.total ?? 0) - 1)));
        setOffset(safeOffset);
        await fetchDashboard({ status, search, offset: safeOffset, table, fromDate, toDate, paymentStatus, paymentMethod });
    }

    async function transition(order: AdminOrder, nextStatus: OrderStatus, confirmed = false) {
        if (busy) return;
        if (!confirmed && (nextStatus === "rejected" || nextStatus === "confirmed" || nextStatus === "completed")) {
            setPendingTransition({ order, nextStatus });
            setRejectionReason("");
            return;
        }

        setBusy(true);
        setActionMessage("");
        const result = await transitionAdminOrderAction({
            orderId: order.id,
            expectedStatus: order.status,
            nextStatus,
            rejectionReason: nextStatus === "rejected" ? rejectionReason.trim() : undefined,
        });
        if (result.ok) {
            setDashboard((current) => current ? {
                ...current,
                orders: current.orders.map((currentOrder) => currentOrder.id === result.order.id
                    ? { ...currentOrder, status: result.order.status, updated_at: result.order.updated_at, rejection_reason: result.order.rejection_reason, estimated_preparation_minutes: result.order.estimated_preparation_minutes, preparation_started_at: result.order.preparation_started_at, estimated_ready_at: result.order.estimated_ready_at }
                    : currentOrder),
            } : current);
            setActionMessage("");
            setSuccessToast(`${result.order.order_number} status updated to ${ORDER_STATUS_LABELS[result.order.status]}`);
            await fetchDashboard(filters, true);
        } else {
            setActionMessage(statusMessage(result.reason, result.currentStatus));
            setSuccessToast("");
            if (result.reason === "stale" || result.reason === "invalid_transition") await fetchDashboard(filters, true);
        }
        setBusy(false);
    }

    async function saveEstimate(order: AdminOrder, minutes: number) {
        if (busy) return;
        setBusy(true);
        setActionMessage("");
        const result = await setAdminPreparationEstimateAction({ orderId: order.id, expectedStatus: order.status, minutes });
        if (result.ok) {
            setDashboard((current) => current ? {
                ...current,
                orders: current.orders.map((currentOrder) => currentOrder.id === result.order.id
                    ? { ...currentOrder, updated_at: result.order.updated_at, estimated_preparation_minutes: result.order.estimated_preparation_minutes, preparation_started_at: result.order.preparation_started_at, estimated_ready_at: result.order.estimated_ready_at }
                    : currentOrder),
            } : current);
            setActionMessage("");
            setSuccessToast(`Preparation estimate for ${result.order.order_number} saved`);
            await fetchDashboard(filters, true);
        } else {
            setActionMessage(result.reason === "invalid" ? `Enter an estimate from ${estimateRange.min} to ${estimateRange.max} minutes.` : statusMessage(result.reason, result.currentStatus));
            if (result.reason === "stale" || result.reason === "invalid_transition") await fetchDashboard(filters, true);
        }
        setBusy(false);
    }

    async function recordPayment(order: AdminOrder, amount: number, method: PaymentMethod, notes: string, idempotencyKey: string): Promise<RecordOrderPaymentResult> {
        const result = await recordOrderPaymentAction({ orderId: order.id, amount, paymentMethod: method, notes, idempotencyKey });
        if (!result.ok) return result;
        setSuccessToast(`Payment recorded for order #${order.order_number}.`);
        setOpenOrderId(null);
        await fetchDashboard(filters);
        return result;
    }

    async function toggleSound() {
        if (!muted) {
            updateNotificationPreference(true);
            return;
        }
        try {
            await activateNotificationAudio();
            updateNotificationPreference(false);
        } catch {
            setActionMessage("This browser could not enable notification audio. Visual order notifications remain on.");
        }
    }

    const summary = dashboard?.summary;
    const recordedRevenue = summary
        ? Object.entries(summary.today_recorded_revenue_by_currency)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([currency, amount]) => formatPrice(amount, currency))
            .join(" / ") || "—"
        : "—";
    const collectedInPeriod = dashboard
        ? Object.entries(dashboard.payment_overview.collected_by_currency)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([currency, amount]) => formatPrice(amount, currency))
            .join(" / ") || "—"
        : "—";
    const pageStart = dashboard && dashboard.total > 0 ? offset + 1 : 0;
    const pageEnd = Math.min(offset + pageSize, dashboard?.total ?? 0);
    const selectedOrder = dashboard?.orders.find((order) => order.id === openOrderId) ?? null;
    const outstandingByCurrency = summary
        ? Object.entries(dashboard?.payment_overview.outstanding_by_currency ?? {})
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([currency, amount]) => formatPrice(amount, currency))
            .join(" / ") || "—"
        : "—";
    const collectionMethodTotals = dashboard
        ? (["card", "bkash", "cash"] as const)
            .map((method) => `${PAYMENT_METHOD_LABELS[method]} ${Object.entries(dashboard.payment_overview.collected_by_method[method] ?? {}).sort(([left], [right]) => left.localeCompare(right)).map(([currency, amount]) => formatPrice(amount, currency)).join(" / ") || "—"}`)
            .join(" · ")
        : "—";

    if (variant === "overview") {
        const kpis = [
            { label: "Pending Orders", value: summary?.pending ?? "—", detail: "Needs attention", icon: Clock3, accent: "bg-[#f2a83b]" },
            { label: "Confirmed", value: summary?.confirmed ?? "—", detail: "Ready for preparation", icon: BadgeCheck, accent: "bg-[#0cbf9b]" },
            { label: "Preparing", value: summary?.preparing ?? "—", detail: "In kitchen", icon: ChefHat, accent: "bg-[#238df0]" },
            { label: "Ready", value: summary?.ready ?? "—", detail: "Ready for pickup", icon: PackageCheck, accent: "bg-[#13bf9c]" },
            { label: "Completed", value: summary?.completed ?? "—", detail: "Today's completed", icon: CheckCircle2, accent: "bg-[#13bf9c]" },
            { label: "Customers", value: customerCount ?? "—", detail: customerCount === null ? "Customer count unavailable" : "With order history", icon: Users, accent: "bg-[#238df0]" },
        ];
        const maximumBucket = Math.max(1, ...buckets.map((bucket) => bucket.order_count));
        const recentOrders = dashboard?.orders.slice(0, 5) ?? [];

        return (
            <div className="space-y-4">
                {requestError ? <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-[#743b47] bg-[#331f35] px-3 py-2 text-xs text-[#ffd9df]"><p>{requestError}</p><button type="button" onClick={() => void fetchDashboard(filters)} className="rounded border border-[#70475a] px-3 py-1.5 font-semibold">Retry</button></div> : null}
                {realtimeStatus === "fallback" ? <p role="status" className="border border-[#7d6935] bg-[#3a321c] px-3 py-2 text-[10px] text-[#f3e4b4]">Live order updates are unavailable. Authorized server refresh will retry every 30 seconds.</p> : null}
                <section aria-label="Order summary" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                    {kpis.map((kpi) => <OverviewKpi key={kpi.label} {...kpi} />)}
                </section>
                <section aria-label="Recorded payment overview" className="rounded-md border border-[#16466d] bg-[#0b2e50] p-3.5 sm:p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div><h2 className="text-[13px] font-semibold text-[#f5f9ff]">Recorded payment overview</h2><p className="mt-1 text-[10px] text-[#91a9c2]">Staff-recorded manual collections · dashboard date range, defaulting to today</p></div>
                        <p className="text-right text-[9px] text-[#91a9c2]">Not independently reconciled with bank, card-terminal, or bKash statements</p>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <PaymentMetric label="Collected in period" value={collectedInPeriod} detail={collectionMethodTotals} />
                        <PaymentMetric label="Outstanding" value={outstandingByCurrency} detail="Current open balances" />
                        <PaymentMetric label="Unpaid orders" value={dashboard?.payment_overview.unpaid_orders ?? "—"} detail="No recorded collections" />
                        <PaymentMetric label="Partial / paid" value={`${dashboard?.payment_overview.partially_paid_orders ?? "—"} / ${dashboard?.payment_overview.paid_orders ?? "—"}`} detail="Partially paid / paid orders" />
                    </div>
                </section>
                {newOrderNotice ? <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#156b86] bg-[#0b3853] px-3 py-2 text-xs text-[#d2f5ff]"><p className="font-semibold">New order · {newOrderNotice}</p><button type="button" onClick={() => setNewOrderNotice("")} className="font-semibold underline underline-offset-2">Dismiss</button></div> : null}
                {actionMessage ? <p role="status" className="rounded-md border border-[#176c5d] bg-[#123e4c] px-3 py-2 text-xs text-[#c9f3e7]">{actionMessage}</p> : null}
                <div className="grid gap-3 xl:grid-cols-[1.4fr_1fr]">
                    <section className="rounded-md border border-[#16466d] bg-[#0b2e50] p-3.5 sm:p-4">
                        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#194b70] pb-3">
                            <div><h2 className="text-[13px] font-semibold text-[#f5f9ff]">Today&apos;s Orders</h2><p className="mt-1 text-[9px] text-[#91a9c2]">Order volume by time · UTC</p></div>
                            <div className="flex gap-5"><div><p className="text-[8px] text-[#91a9c2]">Total Orders</p><p className="mt-0.5 text-sm font-bold tabular-nums text-white">{summary?.today_count ?? "—"}</p></div><div><p className="text-[8px] text-[#91a9c2]">Recorded Revenue</p><p className="mt-0.5 text-sm font-bold tabular-nums text-white">{recordedRevenue}</p><p className="text-[8px] text-[#91a9c2]">Order value, not collected payments</p></div></div>
                        </header>
                        <div className="mt-3 flex h-32 items-end gap-1 border-b border-l border-[#244d6d] px-2 pt-2 sm:h-36" role="img" aria-label={`Today's orders by two-hour UTC interval. ${buckets.map((bucket) => `${bucket.bucket_label}: ${bucket.order_count}`).join(", ")}`}>
                            {buckets.length ? buckets.map((bucket) => {
                                const height = bucket.order_count ? Math.max(7, (bucket.order_count / maximumBucket) * 100) : 3;
                                return <div key={bucket.bucket_label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${bucket.bucket_label}: ${bucket.order_count} orders`}><span className="text-[8px] tabular-nums text-[#b9cde0]">{bucket.order_count || ""}</span><span className="w-full max-w-5 rounded-t-[2px] bg-[#0795f5] transition-[height]" style={{ height: `${height}%` }} /></div>;
                            }) : <p className="mb-3 w-full text-center text-[10px] text-[#91a9c2]">Apply the dashboard bucket migration to load the chart.</p>}
                        </div>
                        <div className="mt-1 flex justify-between px-1 text-[7px] text-[#91a9c2] sm:text-[8px]">{buckets.map((bucket) => <span key={bucket.bucket_label}>{bucket.bucket_label}</span>)}</div>
                    </section>

                    <section className="overflow-hidden rounded-md border border-[#16466d] bg-[#0b2e50]">
                        <header className="flex items-center justify-between border-b border-[#194b70] px-3.5 py-3"><div><h2 className="text-[13px] font-semibold text-[#f5f9ff]">Recent Orders</h2><p className="mt-0.5 text-[9px] text-[#91a9c2]">Latest submissions</p></div><Link href="/admin/orders" className="inline-flex items-center gap-1 text-[9px] font-semibold text-[#48b7ff] hover:text-white">View All <ArrowUpRight className="h-3 w-3" aria-hidden="true" /></Link></header>
                        {recentOrders.length ? <ul className="divide-y divide-[#16466d]">{recentOrders.map((order) => <li key={order.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 px-3.5 py-2"><span className="min-w-0"><span className="block truncate text-[10px] font-semibold text-white">{order.order_number}</span><span className="block truncate text-[8px] text-[#91a9c2]">Table {order.table_number_snapshot}</span></span><span className={`${STATUS_BADGE_STYLES} px-1.5 py-0.5 text-[8px] font-extrabold ${STATUS_STYLES[order.status]}`}>{ORDER_STATUS_LABELS[order.status]}</span><span className="w-12 text-right text-[8px] text-[#91a9c2]">{relativeTime(order.created_at)}</span></li>)}</ul> : <div className="px-4 py-8 text-center text-[10px] text-[#91a9c2]">No recent orders yet.</div>}
                    </section>
                </div>
                <div className="flex justify-end"><button type="button" onClick={() => void toggleSound()} aria-pressed={!muted} className="inline-flex items-center gap-1.5 rounded border border-[#16466d] px-2.5 py-1.5 text-[9px] font-semibold text-[#91a9c2] hover:bg-[#0b2e50] hover:text-white">{muted ? <BellOff className="h-3 w-3" aria-hidden="true" /> : <Bell className="h-3 w-3" aria-hidden="true" />}{muted ? "Notifications muted" : "Notifications on"}</button></div>
            </div>
        );
    }

    const statusCounts: Record<OrderStatus | "all", number | undefined> = {
        all: dashboard?.total,
        pending: dashboard?.status_counts.pending,
        confirmed: dashboard?.status_counts.confirmed,
        preparing: dashboard?.status_counts.preparing,
        ready: dashboard?.status_counts.ready,
        completed: dashboard?.status_counts.completed,
        rejected: dashboard?.status_counts.rejected,
        cancelled: dashboard?.status_counts.cancelled,
    };

    return (
        <div className="space-y-3">
            {realtimeStatus === "fallback" ? <p role="status" className="border border-[#7d6935] bg-[#3a321c] px-3 py-2 text-[10px] text-[#f3e4b4]">Live order updates are unavailable. Authorized server refresh will retry every 30 seconds.</p> : null}
            {newOrderNotice ? <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#156b86] bg-[#0b3853] px-3 py-2 text-xs text-[#d2f5ff]"><p className="font-semibold">New order · {newOrderNotice}</p><button type="button" onClick={() => setNewOrderNotice("")} className="font-semibold underline underline-offset-2">Dismiss</button></div> : null}
            {actionMessage ? <p role="alert" className="rounded-md border border-[#743b47] bg-[#331f35] px-3 py-2 text-xs text-[#ffd9df]">{actionMessage}</p> : null}
            {requestError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#743b47] bg-[#331f35] px-3 py-2 text-xs text-[#ffd9df]"><p>{requestError}</p><button type="button" onClick={() => void fetchDashboard(filters)} className="rounded border border-[#70475a] px-3 py-1.5 font-semibold">Retry</button></div> : null}
            {successToast ? <div role="status" className="fixed bottom-5 right-4 z-[70] flex max-w-[min(24rem,calc(100vw-2rem))] items-center gap-2 rounded-lg border border-[#147b69] bg-[#063c3c] px-4 py-3 text-xs font-semibold text-[#e4fff7] shadow-xl sm:bottom-6 sm:right-6"><CheckCircle2 className="h-5 w-5 shrink-0 text-[#25d1a2]" aria-hidden="true" /><span>{successToast}</span><button type="button" aria-label="Dismiss notification" onClick={() => setSuccessToast("")} className="ml-2 rounded p-1 text-[#b9e8dc] hover:bg-white/10"><X className="h-4 w-4" aria-hidden="true" /></button></div> : null}

            {pendingTransition ? (
                <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#03172b]/70 p-0 sm:items-center sm:p-4" onClick={(event) => { if (event.target === event.currentTarget) setPendingTransition(null); }}>
                    <section role="dialog" aria-modal="true" aria-labelledby="order-confirm-title" className="w-full max-w-md rounded-t-xl border border-[#d7e2ec] bg-white p-5 text-[#09294d] shadow-xl sm:rounded-md">
                        <h2 id="order-confirm-title" className="text-base font-bold">{pendingTransition.nextStatus === "rejected" ? "Reject this order?" : pendingTransition.nextStatus === "confirmed" ? "Accept this order?" : "Complete this order?"}</h2>
                        <p className="mt-2 text-sm text-[#617991]">Confirm the status change for <strong>{pendingTransition.order.order_number}</strong>.</p>
                        {pendingTransition.nextStatus === "rejected" ? <label className="mt-4 block text-xs font-semibold text-[#425b70]">Optional reason<textarea maxLength={300} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} rows={3} className="mt-1 w-full rounded border border-[#ccd8e4] p-2 text-sm font-normal outline-none focus:border-[#087bc1]" /></label> : null}
                        <div className="mt-5 flex justify-end gap-2">
                            <button ref={confirmCancelButton} type="button" onClick={() => setPendingTransition(null)} disabled={busy} className="min-h-10 rounded border border-[#b9d0e1] px-4 text-sm font-semibold text-[#37566f]">Cancel</button>
                            <button type="button" disabled={busy} onClick={() => { const transitionTarget = pendingTransition; setPendingTransition(null); void transition(transitionTarget.order, transitionTarget.nextStatus, true); }} className={`min-h-10 rounded px-4 text-sm font-bold text-white disabled:opacity-50 ${pendingTransition.nextStatus === "rejected" ? "bg-[#a74437]" : "bg-[#0759a8]"}`}>{busy ? "Saving…" : "Confirm"}</button>
                        </div>
                    </section>
                </div>
            ) : null}

            <section id="orders" className="scroll-mt-5 space-y-3">
                <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 items-center gap-2">
                        <form onSubmit={(event) => void submitSearch(event)} className="flex min-w-0 flex-1 xl:max-w-64">
                            <label htmlFor="order-search" className="sr-only">Search order number or customer name</label>
                            <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-[#234b6d] bg-[#092746] px-3 focus-within:border-[#0795f5]"><Search className="h-4 w-4 shrink-0 text-[#91a9c2]" aria-hidden="true" /><input id="order-search" disabled={busy} value={searchInput} onChange={(event) => updateSearchInput(event.target.value)} maxLength={80} placeholder="Search order or customer…" className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-[#8299ae] disabled:opacity-60" /></div>
                        </form>
                        <form onSubmit={(event) => void applyAdditionalFilters(event)} className="hidden items-center gap-2 md:flex">
                            <label className="sr-only" htmlFor="orders-table-filter">Filter by table</label><input id="orders-table-filter" value={tableInput} onChange={(event) => setTableInput(event.target.value)} maxLength={80} placeholder="All tables" className={`h-10 w-28 rounded-md border bg-[#092746] px-2.5 text-xs text-white outline-none focus:border-[#0795f5] ${table ? "border-[#0795f5]" : "border-[#234b6d]"}`} />
                            <label className="sr-only" htmlFor="orders-payment-filter">Filter by payment status</label><select id="orders-payment-filter" value={paymentInput} onChange={(event) => setPaymentInput(event.target.value as NonNullable<Filters["paymentStatus"]>)} className={`h-10 rounded-md border bg-[#092746] px-2.5 text-xs text-white outline-none focus:border-[#0795f5] ${paymentStatus !== "all" ? "border-[#0795f5]" : "border-[#234b6d]"}`}><option value="all">All payments</option><option value="unpaid">Unpaid</option><option value="partially_paid">Partially paid</option><option value="paid">Paid</option><option value="refunded">Refunded</option></select>
                            <label className="sr-only" htmlFor="orders-method-filter">Filter by preferred payment method</label><select id="orders-method-filter" value={paymentMethodInput} onChange={(event) => setPaymentMethodInput(event.target.value as NonNullable<Filters["paymentMethod"]>)} className={`h-10 rounded-md border bg-[#092746] px-2.5 text-xs text-white outline-none focus:border-[#0795f5] ${paymentMethod !== "all" ? "border-[#0795f5]" : "border-[#234b6d]"}`}><option value="all">All methods</option><option value="card">Card preference</option><option value="bkash">bKash preference</option><option value="cash">Cash preference</option></select>
                            <label className="sr-only" htmlFor="orders-from-date">Orders from date</label><input id="orders-from-date" type="date" value={fromDateInput} onChange={(event) => setFromDateInput(event.target.value)} aria-label="From date" className={`h-10 min-w-0 rounded-md border bg-[#092746] px-2 text-[10px] text-white outline-none focus:border-[#0795f5] ${fromDate ? "border-[#0795f5]" : "border-[#234b6d]"}`} /><span className="text-xs text-[#91a9c2]">–</span>
                            <label className="sr-only" htmlFor="orders-to-date">Orders to date</label><input id="orders-to-date" type="date" value={toDateInput} onChange={(event) => setToDateInput(event.target.value)} aria-label="To date" className={`h-10 min-w-0 rounded-md border bg-[#092746] px-2 text-[10px] text-white outline-none focus:border-[#0795f5] ${toDate ? "border-[#0795f5]" : "border-[#234b6d]"}`} />
                            <button type="submit" disabled={busy} aria-label="Apply filters" title="Apply filters" className="flex h-10 w-10 items-center justify-center rounded-md bg-[#078cf0] text-white hover:bg-[#167dcc] disabled:opacity-50"><Filter className="h-4 w-4" aria-hidden="true" /></button>
                        </form>
                        <button ref={filterTriggerButton} type="button" onClick={() => setFiltersOpen(true)} className="flex h-10 shrink-0 items-center gap-2 rounded-md border border-[#234b6d] bg-[#092746] px-3 text-xs font-semibold text-[#c2d3e2] md:hidden"><Filter className="h-4 w-4" aria-hidden="true" />Filters{table || fromDate || toDate || paymentStatus !== "all" || paymentMethod !== "all" ? <span className="h-2 w-2 rounded-full bg-[#24b6ff]" /> : null}</button>
                        <button type="button" aria-label="Refresh orders" title="Refresh orders" disabled={busy || loading} onClick={() => void fetchDashboard(filters)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#234b6d] bg-[#092746] text-[#c2d3e2] hover:text-white disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /></button>
                        <button type="button" aria-label={muted ? "Unmute order notifications" : "Mute order notifications"} title={muted ? "Unmute notifications" : "Mute notifications"} onClick={() => void toggleSound()} className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#234b6d] bg-[#092746] text-[#c2d3e2] hover:text-white xl:flex">{muted ? <BellOff className="h-4 w-4" aria-hidden="true" /> : <Bell className="h-4 w-4" aria-hidden="true" />}</button>
                    </div>
                </div>
                <section aria-label="Order summary" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                    {([
                        { status: "pending", label: "Pending Orders", value: summary?.pending, icon: Clock3, detail: "Needs attention" },
                        { status: "confirmed", label: "Confirmed Orders", value: summary?.confirmed, icon: BadgeCheck, detail: "Accepted" },
                        { status: "preparing", label: "Preparing", value: summary?.preparing, icon: ChefHat, detail: "In kitchen" },
                        { status: "ready", label: "Ready", value: summary?.ready, icon: PackageCheck, detail: "Ready to serve" },
                        { status: "completed", label: "Completed", value: summary?.completed, icon: CheckCircle2, detail: "Today's completed" },
                        { status: "all", label: "Today's Orders", value: summary?.today_count, icon: CalendarDays, detail: "Recorded today" },
                    ] as const).map(({ status: cardStatus, label, value, icon: Icon, detail }) => {
                        const cardContent = <><div className="flex items-center justify-between gap-2"><span className="truncate text-[10px] font-semibold text-[#c2d3e2]">{label}</span><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${cardStatus === "all" ? "bg-[#264b6b]" : STATUS_ACCENTS[cardStatus]}`}><Icon className="h-3.5 w-3.5 text-white" aria-hidden="true" /></span></div><span className="mt-1 block text-2xl font-bold leading-7 tabular-nums text-white">{value ?? "—"}</span><span className="mt-1 block truncate text-[9px] text-[#91a9c2]">{detail}</span></>;
                        const hiddenOnMobile = cardStatus === "pending" || cardStatus === "confirmed" || cardStatus === "preparing" || cardStatus === "ready";
                        return cardStatus === "all"
                            ? <article key={label} className="min-w-0 rounded-lg border border-[#16466d] bg-[#0b2e50] px-3 py-3 shadow-[0_6px_16px_rgba(0,0,0,0.12)]">{cardContent}</article>
                            : <button key={label} type="button" disabled={busy} onClick={() => void selectStatus(cardStatus)} aria-pressed={status === cardStatus} className={`${hiddenOnMobile ? "hidden md:block " : ""}min-w-0 rounded-lg border px-3 py-3 text-left shadow-[0_6px_16px_rgba(0,0,0,0.12)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff] ${status === cardStatus ? "border-[#078cf0] bg-[#0d3b5f]" : "border-[#16466d] bg-[#0b2e50] hover:border-[#2379ad]"} disabled:cursor-default disabled:opacity-60`}>{cardContent}</button>;
                    })}
                </section>
                <div role="group" aria-label="Filter orders by status" className="flex gap-1.5 overflow-x-auto pb-0.5">
                    {(["all", ...ORDER_STATUSES] as const).map((value) => <button key={value} type="button" disabled={busy} aria-pressed={status === value} onClick={() => void selectStatus(value)} className={`min-h-8 shrink-0 rounded-full px-3 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff] disabled:opacity-50 ${status === value ? "bg-[#0795f5] text-white shadow-[0_2px_8px_rgba(7,149,245,0.22)]" : "border border-[#16466d] bg-[#092746] text-[#b4c6d9] hover:bg-[#103858] hover:text-white"}`}>{value === "all" ? "All" : ORDER_STATUS_LABELS[value]}<span className="ml-1 opacity-75">{statusCounts[value] ?? 0}</span></button>)}
                </div>
                {(search || table || fromDate || toDate || (paymentStatus && paymentStatus !== "all") || (paymentMethod && paymentMethod !== "all")) ? <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#b4c6d9]"><span>Active filters:</span>{search ? <span className="rounded-full border border-[#245477] bg-[#092746] px-2.5 py-1">Search: {search}</span> : null}{table ? <span className="rounded-full border border-[#245477] bg-[#092746] px-2.5 py-1">Table: {table}</span> : null}{paymentStatus && paymentStatus !== "all" ? <span className="rounded-full border border-[#245477] bg-[#092746] px-2.5 py-1">Payment: {PAYMENT_STATUS_LABELS[paymentStatus]}</span> : null}{paymentMethod && paymentMethod !== "all" ? <span className="rounded-full border border-[#245477] bg-[#092746] px-2.5 py-1">Preferred method: {PAYMENT_METHOD_LABELS[paymentMethod]}</span> : null}{fromDate || toDate ? <span className="rounded-full border border-[#245477] bg-[#092746] px-2.5 py-1">Dates: {fromDate || "Any"} – {toDate || "Any"}</span> : null}<button type="button" onClick={() => { setSearchInput(""); setSearch(""); setTableInput(""); setTable(""); setFromDateInput(""); setFromDate(""); setToDateInput(""); setToDate(""); setPaymentInput("all"); setPaymentStatus("all"); setPaymentMethodInput("all"); setPaymentMethod("all"); setStatus("all"); setOffset(0); void fetchDashboard({ status: "all", search: "", offset: 0, table: "", fromDate: "", toDate: "", paymentStatus: "all", paymentMethod: "all" }); }} className="font-semibold text-[#48b7ff] underline underline-offset-2">Reset</button></div> : null}

                {filtersOpen ? <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#020d19]/70 sm:items-center md:hidden" onClick={(event) => { if (event.target === event.currentTarget) setFiltersOpen(false); }}>
                    <section role="dialog" aria-modal="true" aria-labelledby="order-filters-title" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-[#1a4465] bg-[#06223d] p-4 text-white shadow-2xl sm:max-w-lg sm:rounded-xl">
                        <header className="flex items-center justify-between border-b border-[#1a4465] pb-3"><div><h2 id="order-filters-title" className="text-base font-semibold">Filter Orders</h2><p className="mt-0.5 text-xs text-[#91a9c2]">Narrow the list by status, table, date, or payment.</p></div><button ref={filterCloseButton} type="button" aria-label="Close filters" onClick={() => setFiltersOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-md text-[#b4c6d9] hover:bg-[#0b3558]"><X className="h-5 w-5" aria-hidden="true" /></button></header>
                        <form onSubmit={(event) => { event.preventDefault(); if (fromDateInput && toDateInput && fromDateInput > toDateInput) { setActionMessage("The start date must be on or before the end date."); return; } setFiltersOpen(false); void applyAdditionalFilters(event); }} className="space-y-4 py-4">
                            <fieldset><legend className="mb-2 text-xs font-semibold text-[#c2d3e2]">Status</legend><div className="grid grid-cols-3 gap-2">{(["all", ...ORDER_STATUSES] as const).map((value) => <button key={value} type="button" disabled={busy} aria-pressed={status === value} onClick={() => void selectStatus(value)} className={`min-h-10 rounded-full border px-2 text-[11px] font-semibold ${status === value ? "border-[#0795f5] bg-[#0795f5] text-white" : "border-[#245477] bg-[#092746] text-[#b4c6d9]"}`}>{value === "all" ? "All" : ORDER_STATUS_LABELS[value]}</button>)}</div></fieldset>
                            <label className="block text-xs font-semibold text-[#c2d3e2]">Table<input value={tableInput} onChange={(event) => setTableInput(event.target.value)} maxLength={80} placeholder="All tables" className="mt-1.5 h-11 w-full rounded-md border border-[#245477] bg-[#041a30] px-3 text-sm text-white outline-none focus:border-[#0795f5]" /></label>
                            <label className="block text-xs font-semibold text-[#c2d3e2]">Date range<div className="mt-1.5 grid grid-cols-2 gap-2"><input aria-label="Start date" type="date" value={fromDateInput} onChange={(event) => setFromDateInput(event.target.value)} className="h-11 min-w-0 rounded-md border border-[#245477] bg-[#041a30] px-2 text-xs text-white" /><input aria-label="End date" type="date" value={toDateInput} onChange={(event) => setToDateInput(event.target.value)} className="h-11 min-w-0 rounded-md border border-[#245477] bg-[#041a30] px-2 text-xs text-white" /></div></label>
                            <label className="block text-xs font-semibold text-[#c2d3e2]">Payment status<select value={paymentInput} onChange={(event) => setPaymentInput(event.target.value as NonNullable<Filters["paymentStatus"]>)} className="mt-1.5 h-11 w-full rounded-md border border-[#245477] bg-[#041a30] px-3 text-sm text-white"><option value="all">All payments</option><option value="unpaid">Unpaid</option><option value="partially_paid">Partially paid</option><option value="paid">Paid</option><option value="refunded">Refunded</option></select></label>
                            <label className="block text-xs font-semibold text-[#c2d3e2]">Preferred method<select value={paymentMethodInput} onChange={(event) => setPaymentMethodInput(event.target.value as NonNullable<Filters["paymentMethod"]>)} className="mt-1.5 h-11 w-full rounded-md border border-[#245477] bg-[#041a30] px-3 text-sm text-white"><option value="all">All methods</option><option value="card">Card</option><option value="bkash">bKash</option><option value="cash">Cash</option></select></label>
                            <div className="flex gap-2 border-t border-[#1a4465] pt-4"><button type="button" onClick={() => { setTableInput(""); setFromDateInput(""); setToDateInput(""); setPaymentInput("all"); setPaymentMethodInput("all"); setTable(""); setFromDate(""); setToDate(""); setPaymentStatus("all"); setPaymentMethod("all"); setStatus("all"); setOffset(0); setFiltersOpen(false); void fetchDashboard({ status: "all", search, offset: 0, table: "", fromDate: "", toDate: "", paymentStatus: "all", paymentMethod: "all" }); }} className="min-h-11 flex-1 rounded-md border border-[#245477] text-sm font-semibold text-[#b4c6d9]">Reset</button><button type="submit" disabled={busy} className="min-h-11 flex-1 rounded-md bg-[#0795f5] text-sm font-bold text-white disabled:opacity-50">Apply filters</button></div>
                        </form>
                    </section>
                </div> : null}

                {selectedOrder ? <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#020d19]/75 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={(event) => { if (event.target === event.currentTarget) { setOpenOrderId(null); detailTrigger.current?.focus(); } }}>
                    <section role="dialog" aria-modal="true" aria-labelledby="order-details-title" className="flex max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-none border border-[#1a4465] bg-[#06223d] text-white shadow-2xl sm:max-h-[92dvh] sm:rounded-xl">
                        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[#1a4465] px-4 py-3 sm:px-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 id="order-details-title" className="text-base font-bold sm:text-lg">Order #{selectedOrder.order_number}</h2><span className={`${STATUS_BADGE_STYLES} px-2.5 py-1 text-[10px] ${STATUS_STYLES[selectedOrder.status]}`}>{ORDER_STATUS_LABELS[selectedOrder.status]}</span></div><p className="mt-1 text-[11px] text-[#91a9c2]">Placed <time dateTime={selectedOrder.created_at}>{timestamp(selectedOrder.created_at)}</time></p></div><button ref={detailCloseButton} type="button" aria-label="Close order details" onClick={() => { setOpenOrderId(null); detailTrigger.current?.focus(); }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#b4c6d9] hover:bg-[#0b3558] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff]"><X className="h-5 w-5" aria-hidden="true" /></button></header>
                        <div className="min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-5"><OrderCard order={selectedOrder} busy={busy} estimateRange={estimateRange} clockNow={clockNow} detailsOpen onTransition={(target, next) => void transition(target, next)} onEstimate={(target, minutes) => void saveEstimate(target, minutes)} onCollect={recordPayment} /></div>
                    </section>
                </div> : null}

                <div aria-live="polite" aria-busy={loading} className="overflow-hidden rounded-lg border border-[#d7e2ec] bg-[#f7faff] shadow-[0_8px_24px_rgba(0,0,0,0.15)]">
                    {loading && !dashboard ? <p className="px-4 py-10 text-center text-sm text-[#5c7187]">Loading orders…</p> : null}
                    {!loading && dashboard && dashboard.orders.length === 0 ? <div className="px-4 py-14 text-center"><h3 className="text-sm font-semibold text-[#143450]">No matching orders</h3><p className="mt-1 text-xs text-[#6f8193]">Try another status or clear the active filters.</p></div> : null}
                    {dashboard && dashboard.orders.length ? <>
                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full min-w-[920px] border-collapse text-left text-[11px] xl:min-w-0">
                                <thead className="bg-[#f1f6fa] text-[9px] font-bold uppercase tracking-wide text-[#516a80]"><tr>{["Order ID", "Customer", "Table", "Items", "Total", "Status", "Payment", "Time", "Actions"].map((heading) => <th key={heading} scope="col" className="whitespace-nowrap px-3 py-3">{heading}</th>)}</tr></thead>
                                <tbody>
                                    {dashboard.orders.map((order) => <tr key={order.id} className={`border-t transition-colors duration-200 ${ORDER_ROW_STYLES[order.status]} hover:brightness-[0.985]`}>
                                        <td className="whitespace-nowrap px-3 py-3 font-bold text-[#0876c7]">{order.order_number}</td>
                                        <td className="max-w-40 px-3 py-3"><span className="block truncate font-semibold text-[#173650]">{order.customer_name}</span>{order.customer_email ? <span className="block truncate text-[9px] text-[#708498]">{order.customer_email}</span> : null}</td>
                                        <td className="whitespace-nowrap px-3 py-3 text-[#435d73]">{order.table_name_snapshot ? `${order.table_name_snapshot} · ${order.table_number_snapshot}` : `Table ${order.table_number_snapshot}`}</td>
                                        <td className="whitespace-nowrap px-3 py-3 text-[#435d73]">{order.items.length} {order.items.length === 1 ? "item" : "items"}</td>
                                        <td className="whitespace-nowrap px-3 py-3 font-bold tabular-nums text-[#173650]">{formatPrice(order.total, order.currency)}</td>
                                        <td className="px-3 py-3"><span className={`${STATUS_BADGE_STYLES} whitespace-nowrap px-2.5 py-1 text-[10px] ${STATUS_STYLES[order.status]}`}>{ORDER_STATUS_LABELS[order.status]}</span></td>
                                        <td className="whitespace-nowrap px-3 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-bold ${PAYMENT_STATUS_STYLES[order.payment_status]}`}>{PAYMENT_STATUS_LABELS[order.payment_status]}</span><span className="mt-1 block text-[9px] text-[#435d73]">{order.preferred_payment_method ? PAYMENT_METHOD_LABELS[order.preferred_payment_method] : "Preference not set"}</span><span className="block text-[9px] text-[#708498]">Paid {formatPrice(order.amount_paid, order.currency)} · Due {formatPrice(Math.max(0, order.total - order.amount_paid), order.currency)}</span></td>
                                        <td className="whitespace-nowrap px-3 py-3 text-[#526a80]" title={timestamp(order.created_at)}>{relativeTime(order.created_at)}</td>
                                        <td className="px-3 py-3"><button type="button" onClick={(event) => { detailTrigger.current = event.currentTarget; setOpenOrderId(order.id); }} className="min-h-8 rounded-md bg-[#078cf0] px-3 text-[10px] font-bold text-white hover:bg-[#167dcc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#036cbb]">View</button></td>
                                    </tr>)}
                                </tbody>
                            </table>
                        </div>
                        <ul className="space-y-2 p-2 md:hidden">{dashboard.orders.map((order) => <li key={order.id} className={`rounded-lg border p-3.5 shadow-sm transition-colors duration-200 ${ORDER_ROW_STYLES[order.status]}`}>
                            <button type="button" onClick={(event) => { detailTrigger.current = event.currentTarget; setOpenOrderId(order.id); }} className="block w-full rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087bc1]">
                                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><span className="block truncate text-sm font-bold text-[#0876c7]">#{order.order_number}</span><span className="mt-0.5 block truncate text-xs font-semibold text-[#173650]">{order.customer_name}</span></div><span className={`${STATUS_BADGE_STYLES} shrink-0 px-2.5 py-1 text-[10px] ${STATUS_STYLES[order.status]}`}>{ORDER_STATUS_LABELS[order.status]}</span></div>
                                <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-2 border-t border-[#244b68]/15 pt-2.5"><div className="min-w-0 text-[10px] text-[#526a80]"><span className="block truncate">{order.table_name_snapshot ? `${order.table_name_snapshot} · ` : ""}Table {order.table_number_snapshot}</span><span className="mt-1 block">{order.preferred_payment_method ? PAYMENT_METHOD_LABELS[order.preferred_payment_method] : "Payment preference not set"} · Due {formatPrice(Math.max(0, order.total - order.amount_paid), order.currency)}</span><time className="mt-1 block" dateTime={order.created_at}>{relativeTime(order.created_at)}</time></div><div className="text-right"><span className="text-sm font-bold tabular-nums text-[#173650]">{formatPrice(order.total, order.currency)}</span><span className={`mt-1 block rounded-full border px-2 py-1 text-[9px] font-bold ${PAYMENT_STATUS_STYLES[order.payment_status]}`}>{PAYMENT_STATUS_LABELS[order.payment_status]}</span></div></div>
                            </button>
                        </li>)}</ul>
                    </> : null}
                </div>
                {dashboard && dashboard.total > pageSize ? <div className="flex flex-wrap items-center justify-between gap-3 text-[10px] text-[#b4c6d9]"><p>Showing {pageStart}–{pageEnd} of {dashboard.total}</p><div className="flex gap-1.5"><button type="button" disabled={offset === 0 || loading || busy} onClick={() => void changePage(offset - pageSize)} aria-label="Previous page" className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[#16466d] bg-[#092746] px-3 text-[#c2d3e2] disabled:opacity-40"><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous</button><button type="button" disabled={offset + pageSize >= dashboard.total || loading || busy} onClick={() => void changePage(offset + pageSize)} aria-label="Next page" className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[#16466d] bg-[#092746] px-3 text-[#c2d3e2] disabled:opacity-40">Next <ChevronRight className="h-4 w-4" aria-hidden="true" /></button></div></div> : null}
            </section>
        </div>
    );
}