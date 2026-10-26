"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    AlertCircle,
    ArrowRight,
    Bell,
    Check,
    CheckCircle2,
    ChefHat,
    CircleCheck,
    Clock3,
    CookingPot,
    MapPin,
    PackageCheck,
    RefreshCw,
    ShoppingBag,
    Utensils,
    X,
} from "lucide-react";

import { CancelOrderButton } from "@/components/cancel-order-button";
import { CustomerReviewPrompt } from "@/components/customer-review-prompt";
import { formatPrice } from "@/lib/format-price";
import { playNotificationSound } from "@/lib/notification-sound";
import { createClient } from "@/lib/supabase/client";
import { ORDER_STATUS_LABELS, isOrderStatus, type OrderStatus } from "@/lib/order-status";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, isPaymentMethod } from "@/lib/payment";
import type { CustomerOrder, CustomerOrderItem } from "@/lib/order-data";

type LiveOrder = Pick<
    CustomerOrder,
    | "status"
    | "rejection_reason"
    | "estimated_preparation_minutes"
    | "preparation_started_at"
    | "estimated_ready_at"
    | "payment_status"
    | "amount_paid"
    | "preferred_payment_method"
    | "updated_at"
>;

const TRACKER_STAGES = [
    { status: "pending", label: "Received", icon: ShoppingBag },
    { status: "confirmed", label: "Confirmed", icon: CircleCheck },
    { status: "preparing", label: "Preparing", icon: ChefHat },
    { status: "ready", label: "Ready", icon: PackageCheck },
    { status: "completed", label: "Completed", icon: CheckCircle2 },
] as const satisfies readonly { status: OrderStatus; label: string; icon: typeof ShoppingBag }[];

const STATUS_STYLE: Record<OrderStatus, {
    accent: string;
    border: string;
    dot: string;
    title: string;
    description: string;
}> = {
    pending: {
        accent: "text-[#00e5ff]",
        border: "border-[#00e5ff]/40",
        dot: "bg-[#00e5ff]",
        title: "Order Placed!",
        description: "Your order has been received. The restaurant is reviewing it now.",
    },
    confirmed: {
        accent: "text-[#00e5ff]",
        border: "border-[#00e5ff]/40",
        dot: "bg-[#00e5ff]",
        title: "Order Confirmed",
        description: "The restaurant accepted your order. The kitchen will begin preparation shortly.",
    },
    preparing: {
        accent: "text-[#00e5ff]",
        border: "border-[#00e5ff]/45",
        dot: "bg-[#00e5ff]",
        title: "Preparing Your Food",
        description: "The kitchen is preparing your food with care.",
    },
    ready: {
        accent: "text-[#00dfa5]",
        border: "border-[#00dfa5]/45",
        dot: "bg-[#00dfa5]",
        title: "Your Order Is Ready!",
        description: "Your food is ready. Please collect it from the restaurant staff.",
    },
    completed: {
        accent: "text-[#00dfa5]",
        border: "border-[#00dfa5]/45",
        dot: "bg-[#00dfa5]",
        title: "Order Completed!",
        description: "Thank you for dining with us. We hope you enjoyed your meal.",
    },
    rejected: {
        accent: "text-[#ff9292]",
        border: "border-[#ff7070]/40",
        dot: "bg-[#ff7070]",
        title: "Order Not Accepted",
        description: "The restaurant could not accept this order. Please contact the team if you need more information.",
    },
    cancelled: {
        accent: "text-[#a8bed2]",
        border: "border-[#7890a5]/40",
        dot: "bg-[#7890a5]",
        title: "Order Cancelled",
        description: "This order was cancelled. You can return to the menu whenever you are ready.",
    },
};

function parseLiveOrder(value: Record<string, unknown>): LiveOrder | null {
    if (
        !isOrderStatus(value.status)
        || (value.rejection_reason !== null && typeof value.rejection_reason !== "string")
        || (value.estimated_preparation_minutes !== null && typeof value.estimated_preparation_minutes !== "number")
        || (value.preparation_started_at !== null && typeof value.preparation_started_at !== "string")
        || (value.estimated_ready_at !== null && typeof value.estimated_ready_at !== "string")
        || (value.payment_status !== "unpaid" && value.payment_status !== "partially_paid" && value.payment_status !== "paid" && value.payment_status !== "refunded")
        || typeof value.amount_paid !== "number"
        || (value.preferred_payment_method !== null && !isPaymentMethod(value.preferred_payment_method))
        || typeof value.updated_at !== "string"
    ) return null;

    return {
        status: value.status,
        rejection_reason: value.rejection_reason,
        estimated_preparation_minutes: value.estimated_preparation_minutes,
        preparation_started_at: value.preparation_started_at,
        estimated_ready_at: value.estimated_ready_at,
        payment_status: value.payment_status,
        amount_paid: value.amount_paid,
        preferred_payment_method: value.preferred_payment_method,
        updated_at: value.updated_at,
    };
}

function formatDate(value: string, timeZone: string) {
    return new Date(value).toLocaleString("en", { dateStyle: "medium", timeStyle: "short", timeZone });
}

function formatClockTime(value: string, timeZone: string) {
    return new Date(value).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", timeZone });
}

function formatCountdown(seconds: number) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
        : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function statusNotice(status: OrderStatus) {
    const messages: Record<OrderStatus, string> = {
        pending: "Your order has been received.",
        confirmed: "Your order has been confirmed!",
        preparing: "The kitchen has started preparing your food.",
        ready: "Your order is ready for collection!",
        completed: "Your order is complete. Thank you for dining with us!",
        rejected: "The restaurant could not accept your order.",
        cancelled: "Your order has been cancelled.",
    };
    return messages[status];
}

function statusTimestamp(stage: OrderStatus, order: CustomerOrder, liveOrder: LiveOrder) {
    if (stage === "pending") return order.created_at;
    if (stage === "preparing") return liveOrder.preparation_started_at;
    if (stage === "ready" && liveOrder.status === "ready") return liveOrder.updated_at;
    if (stage === "completed" && liveOrder.status === "completed") return liveOrder.updated_at;
    return null;
}

function ProgressTimeline({ order, liveOrder, timeZone }: { order: CustomerOrder; liveOrder: LiveOrder; timeZone: string }) {
    const terminal = liveOrder.status === "rejected" || liveOrder.status === "cancelled";
    const stages = terminal
        ? [
            TRACKER_STAGES[0],
            {
                status: liveOrder.status,
                label: liveOrder.status === "rejected" ? "Rejected" : "Cancelled",
                icon: AlertCircle,
            },
        ]
        : TRACKER_STAGES;
    const currentStage = stages.findIndex((stage) => stage.status === liveOrder.status);
    const progress = currentStage <= 0 ? 0 : (currentStage / (stages.length - 1)) * 100;
    const progressColor = liveOrder.status === "rejected"
        ? "#ff7070"
        : liveOrder.status === "cancelled"
            ? "#7890a5"
            : "#00dfa5";
    const currentIndicator = liveOrder.status === "rejected"
        ? "border-[#ff7070] bg-[#29191e] text-[#ff9292] shadow-[0_0_0_4px_rgba(255,112,112,0.1),0_0_22px_rgba(255,112,112,0.2)]"
        : liveOrder.status === "cancelled"
            ? "border-[#7890a5] bg-[#172330] text-[#a8bed2] shadow-[0_0_0_4px_rgba(120,144,165,0.1)]"
            : liveOrder.status === "ready" || liveOrder.status === "completed"
                ? "border-[#00dfa5] bg-[#062b27] text-[#00dfa5] shadow-[0_0_0_4px_rgba(0,223,165,0.1),0_0_22px_rgba(0,223,165,0.2)]"
                : "border-[#00e5ff] bg-[#06283a] text-[#00e5ff] shadow-[0_0_0_4px_rgba(0,229,255,0.1),0_0_22px_rgba(0,229,255,0.25)]";

    return (
        <ol aria-label="Order progress" className="relative grid grid-cols-5 gap-0 px-2 py-5 sm:px-7 sm:py-7">
            <span aria-hidden="true" className="absolute left-[10%] right-[10%] top-[2.25rem] h-px bg-[#17435a] sm:top-[2.875rem]">
                <span className="block h-full w-full origin-left transition-transform duration-500 motion-reduce:transition-none" style={{ transform: `scaleX(${progress / 100})`, backgroundColor: progressColor }} />
            </span>
            {stages.map((stage, index) => {
                const Icon = stage.icon;
                const reached = index < currentStage;
                const current = index === currentStage;
                const time = stage.status === "rejected" || stage.status === "cancelled"
                    ? liveOrder.updated_at
                    : statusTimestamp(stage.status, order, liveOrder);
                return (
                    <li key={stage.status} className="relative flex min-w-0 flex-col items-center gap-2 text-center">
                        <span
                            className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all duration-300 motion-reduce:transition-none sm:h-9 sm:w-9 ${
                                current
                                    ? currentIndicator
                                    : reached
                                        ? "border-[#00dfa5] bg-[#00dfa5] text-[#031a20]"
                                        : "border-[#315066] bg-[#0a1c2b] text-[#718ba0]"
                            }`}
                        >
                            {reached ? <Check className="h-4 w-4" aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
                        </span>
                        <span className="min-w-0 w-full px-0.5 sm:pt-1">
                            <span className={`block break-words text-[9px] leading-3 sm:text-xs sm:leading-4 ${current ? "font-bold text-[#00e5ff]" : reached ? "font-semibold text-[#dcf5f4]" : "text-[#718ba0]"}`}>{stage.label}</span>
                            <span className="mt-1 block break-words text-[8px] leading-3 text-[#829caf] sm:text-[10px] sm:leading-4">
                                {time ? formatClockTime(time, timeZone) : current ? "In progress" : reached ? "Complete" : "Waiting"}
                            </span>
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}

function PreparationCountdown({
    readyAt,
    estimatedMinutes,
    now,
    timeZone,
}: {
    readyAt: string | null;
    estimatedMinutes: number | null;
    now: number;
    timeZone: string;
}) {
    const deadline = readyAt ? Date.parse(readyAt) : Number.NaN;
    const start = readyAt && estimatedMinutes && estimatedMinutes > 0
        ? Date.parse(readyAt) - estimatedMinutes * 60_000
        : Number.NaN;
    const hasEstimate = Number.isFinite(deadline) && Number.isFinite(start) && deadline > start;
    const remainingSeconds = hasEstimate ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
    const totalSeconds = hasEstimate ? Math.max(1, Math.ceil((deadline - start) / 1000)) : 1;
    const remainingRatio = remainingSeconds === null ? 0 : Math.min(1, remainingSeconds / totalSeconds);
    const circumference = 2 * Math.PI * 76;
    const late = remainingSeconds === 0;

    return (
        <section aria-label="Preparation estimate" className="flex flex-col items-center px-4 py-7 text-center sm:px-6">
            <div className="relative flex h-52 w-52 items-center justify-center sm:h-56 sm:w-56">
                <div aria-hidden="true" className="order-tracking-timer-halo absolute inset-4 rounded-full border border-[#00e5ff]/15" />
                <svg viewBox="0 0 180 180" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
                    <circle cx="90" cy="90" r="76" fill="none" stroke="#12364a" strokeWidth="4" />
                    <circle
                        cx="90"
                        cy="90"
                        r="76"
                        fill="none"
                        stroke="url(#order-preparation-gradient)"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={circumference * (1 - remainingRatio)}
                        className="transition-[stroke-dashoffset] duration-700 ease-linear motion-reduce:transition-none"
                    />
                    <defs>
                        <linearGradient id="order-preparation-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#00f5c8" />
                            <stop offset="100%" stopColor="#00bde8" />
                        </linearGradient>
                    </defs>
                </svg>
                <div className="relative flex flex-col items-center">
                    <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-full border border-[#00e5ff]/25 bg-[#082436] text-[#00e5ff]"><CookingPot className="h-5 w-5" aria-hidden="true" /></span>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#91adbf]">Time remaining</p>
                    <p className="mt-1 font-mono text-3xl font-bold tabular-nums tracking-tight text-[#f5faff]" role="timer" aria-label={remainingSeconds === null ? "Preparation estimate unavailable" : `${formatCountdown(remainingSeconds)} remaining`}>
                        {remainingSeconds === null ? "--:--" : formatCountdown(remainingSeconds)}
                    </p>
                    <p className="text-xs text-[#91adbf]">{remainingSeconds === null ? "No estimate available" : "estimated"}</p>
                </div>
            </div>
            {hasEstimate ? (
                <div className="mt-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#91adbf]">Estimated ready time</p>
                    <p className="mt-0.5 text-sm font-bold text-[#00e5ff]">{formatClockTime(readyAt!, timeZone)}</p>
                </div>
            ) : null}
            <p role={late ? "status" : undefined} className={`mt-4 max-w-sm text-sm leading-6 ${late ? "font-semibold text-[#ffd08a]" : "text-[#b4c6d9]"}`}>
                {late ? "Preparation is taking a little longer than expected. The restaurant will update your order when it is ready." : "Our kitchen is preparing your order with care."}
            </p>
            <p className="mt-1 text-xs text-[#829caf]">The estimate never changes your order status automatically.</p>
        </section>
    );
}

export function CustomerOrderTracking({
    initialOrder,
    items,
    customerId,
    restaurantName,
    restaurantTimeZone,
    allowCustomerCancellation,
    serverNow,
}: {
    initialOrder: CustomerOrder;
    items: CustomerOrderItem[];
    customerId: string;
    restaurantName: string;
    restaurantTimeZone: string;
    allowCustomerCancellation: boolean;
    serverNow: string;
}) {
    const router = useRouter();
    const [liveOrder, setLiveOrder] = useState<LiveOrder>(() => ({
        status: initialOrder.status,
        rejection_reason: initialOrder.rejection_reason,
        estimated_preparation_minutes: initialOrder.estimated_preparation_minutes,
        preparation_started_at: initialOrder.preparation_started_at,
        estimated_ready_at: initialOrder.estimated_ready_at,
        payment_status: initialOrder.payment_status,
        amount_paid: initialOrder.amount_paid,
        preferred_payment_method: initialOrder.preferred_payment_method,
        updated_at: initialOrder.updated_at,
    }));
    const [realtimeAvailable, setRealtimeAvailable] = useState(false);
    const [refreshMessage, setRefreshMessage] = useState("");
    const [statusToast, setStatusToast] = useState("");
    const [statusToastStatus, setStatusToastStatus] = useState<OrderStatus>("pending");
    const [now, setNow] = useState(() => Date.parse(serverNow));
    const refreshSequence = useRef(0);
    const latestUpdate = useRef(Date.parse(initialOrder.updated_at));
    const lastAnnouncedStatus = useRef(initialOrder.status);

    const applyLiveOrder = useCallback((parsed: LiveOrder) => {
        const updateTime = Date.parse(parsed.updated_at);
        if (!Number.isFinite(updateTime) || updateTime < latestUpdate.current) return;
        latestUpdate.current = updateTime;
        setLiveOrder(parsed);
        setRefreshMessage("");
        if (parsed.status !== lastAnnouncedStatus.current) {
            const previousStatus = lastAnnouncedStatus.current;
            lastAnnouncedStatus.current = parsed.status;
            setStatusToast(statusNotice(parsed.status));
            setStatusToastStatus(parsed.status);
            if (previousStatus === "pending" && parsed.status === "confirmed") {
                playNotificationSound("orderAccepted");
            }
        }
    }, []);

    useEffect(() => {
        applyLiveOrder({
            status: initialOrder.status,
            rejection_reason: initialOrder.rejection_reason,
            estimated_preparation_minutes: initialOrder.estimated_preparation_minutes,
            preparation_started_at: initialOrder.preparation_started_at,
            estimated_ready_at: initialOrder.estimated_ready_at,
            payment_status: initialOrder.payment_status,
            amount_paid: initialOrder.amount_paid,
            preferred_payment_method: initialOrder.preferred_payment_method,
            updated_at: initialOrder.updated_at,
        });
    }, [applyLiveOrder, initialOrder]);

    useEffect(() => {
        if (liveOrder.status !== "preparing") return;
        const clockOffset = Date.parse(serverNow) - Date.now();
        const interval = window.setInterval(() => setNow(Date.now() + clockOffset), 1000);
        return () => window.clearInterval(interval);
    }, [liveOrder.status, serverNow]);

    useEffect(() => {
        if (!statusToast) return;
        const timeout = window.setTimeout(() => setStatusToast(""), 5000);
        return () => window.clearTimeout(timeout);
    }, [statusToast]);

    useEffect(() => {
        let mounted = true;
        const supabase = createClient();
        const refresh = async () => {
            const sequence = ++refreshSequence.current;
            const { data, error } = await supabase
                .from("orders")
                .select("status, rejection_reason, estimated_preparation_minutes, preparation_started_at, estimated_ready_at, payment_status, amount_paid, preferred_payment_method, updated_at")
                .eq("id", initialOrder.id)
                .eq("customer_id", customerId)
                .maybeSingle();
            if (!mounted || sequence !== refreshSequence.current) return;
            if (error || !data) {
                setRefreshMessage("We couldn’t refresh the order status. We’ll retry when your connection is available.");
                return;
            }
            const parsed = parseLiveOrder(data as unknown as Record<string, unknown>);
            if (parsed) applyLiveOrder(parsed);
            else setRefreshMessage("The latest order update could not be read. We’ll try again shortly.");
        };

        const channel = supabase
            .channel(`customer-order-${initialOrder.id}`)
            .on("postgres_changes", {
                event: "UPDATE",
                schema: "public",
                table: "orders",
                filter: `id=eq.${initialOrder.id}`,
            }, () => void refresh())
            .subscribe((status) => {
                if (!mounted) return;
                const connected = status === "SUBSCRIBED";
                setRealtimeAvailable(connected);
                if (connected) void refresh();
                else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
                    setRefreshMessage("Live updates are temporarily unavailable. We’ll check again periodically.");
                }
            });

        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user.id !== customerId) {
                const next = encodeURIComponent(`/orders/${initialOrder.id}`);
                router.replace(`/login?next=${next}`);
            }
        });
        const onOnline = () => void refresh();
        const onVisible = () => {
            if (document.visibilityState === "visible") void refresh();
        };
        window.addEventListener("online", onOnline);
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            mounted = false;
            window.removeEventListener("online", onOnline);
            document.removeEventListener("visibilitychange", onVisible);
            authListener.subscription.unsubscribe();
            void supabase.removeChannel(channel);
        };
    }, [applyLiveOrder, customerId, initialOrder.id, router]);

    useEffect(() => {
        if (realtimeAvailable) return;
        const refreshFallback = async () => {
            if (document.visibilityState !== "visible") return;
            const supabase = createClient();
            const sequence = ++refreshSequence.current;
            const { data, error } = await supabase
                .from("orders")
                .select("status, rejection_reason, estimated_preparation_minutes, preparation_started_at, estimated_ready_at, payment_status, amount_paid, preferred_payment_method, updated_at")
                .eq("id", initialOrder.id)
                .eq("customer_id", customerId)
                .maybeSingle();
            if (error || !data || sequence !== refreshSequence.current) return;
            const parsed = parseLiveOrder(data as unknown as Record<string, unknown>);
            if (parsed) applyLiveOrder(parsed);
        };
        const interval = window.setInterval(() => void refreshFallback(), 30000);
        const onOnline = () => void refreshFallback();
        window.addEventListener("online", onOnline);
        return () => {
            window.clearInterval(interval);
            window.removeEventListener("online", onOnline);
        };
    }, [applyLiveOrder, customerId, initialOrder.id, realtimeAvailable]);

    const terminal = liveOrder.status === "rejected" || liveOrder.status === "cancelled";
    const statusStyle = STATUS_STYLE[liveOrder.status];
    const isReady = liveOrder.status === "ready";
    const isCompleted = liveOrder.status === "completed";
    const isPreparing = liveOrder.status === "preparing";
    const tableLabel = initialOrder.table_name_snapshot || `Table ${initialOrder.table_number_snapshot}`;

    return (
        <div className="mx-auto w-full max-w-5xl space-y-4 sm:space-y-6">
            <section className={`order-tracking-hero relative overflow-hidden rounded-3xl border ${statusStyle.border} bg-[radial-gradient(ellipse_at_50%_8%,rgba(0,105,139,0.2),transparent_56%),#041421] px-4 py-4 text-white shadow-[0_20px_60px_rgba(0,0,0,0.24)] sm:px-7 sm:py-5`}>
                {isCompleted ? <div aria-hidden="true" className="order-tracking-confetti"><span /><span /><span /><span /><span /><span /></div> : null}
                <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full border-[34px] border-[#00e5ff]/[0.035]" />
                <div className="relative mx-auto flex max-w-xl flex-col items-center text-center">
                    <span key={liveOrder.status} className={`order-tracking-status-art relative mb-3 flex h-20 w-20 items-center justify-center rounded-full border ${statusStyle.border} bg-[#061c2b] text-[#00e5ff] shadow-[0_0_34px_rgba(0,229,255,0.12)] sm:h-24 sm:w-24 ${
                        isReady || isCompleted ? "border-[#00dfa5]/45 bg-[#05251f] text-[#00dfa5] shadow-[0_0_34px_rgba(0,223,165,0.17)]"
                            : terminal ? `bg-[#201920] ${statusStyle.accent} shadow-none` : ""
                    }`}>
                        <span aria-hidden="true" className="order-tracking-status-ring absolute inset-2 rounded-full border border-current opacity-30" />
                        <span className={`order-tracking-status-glyph relative flex h-12 w-12 items-center justify-center rounded-full ${isPreparing ? "order-tracking-chef-bob" : ""} ${isReady || isCompleted ? "bg-[#073b32] text-[#00dfa5] shadow-[0_0_25px_rgba(0,223,165,0.15)]" : terminal ? "bg-[#30232a] text-current" : "bg-[#0a2b3d] text-[#00e5ff] shadow-[0_0_25px_rgba(0,229,255,0.15)]"}`}>
                            {terminal ? liveOrder.status === "rejected" ? <X className="h-9 w-9" aria-hidden="true" /> : <AlertCircle className="h-9 w-9" aria-hidden="true" />
                                : isReady ? <CookingPot className="h-10 w-10" aria-hidden="true" />
                                    : isCompleted || liveOrder.status === "pending" ? <Check className="h-10 w-10" strokeWidth={3} aria-hidden="true" />
                                    : isPreparing ? <ChefHat className="h-10 w-10" aria-hidden="true" />
                                        : <Utensils className="h-9 w-9" aria-hidden="true" />}
                        </span>
                    </span>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#00d9ee]">{restaurantName} <span className="text-[#55778c]">/</span> Dine-in order</p>
                    <h1 className="mt-1 text-2xl font-bold leading-tight text-[#f5faff] sm:text-3xl">{statusStyle.title}</h1>
                    <p className="mt-1 max-w-md text-sm leading-5 text-[#afc4d5]">{statusStyle.description}</p>
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-[#b4c6d9]">
                        <span className="font-bold text-white">Order #{initialOrder.order_number}</span>
                        <span className="h-1 w-1 rounded-full bg-[#00e5ff]" aria-hidden="true" />
                        <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-[#00e5ff]" aria-hidden="true" />{tableLabel}</span>
                        <span className="h-1 w-1 rounded-full bg-[#31566a]" aria-hidden="true" />
                        <time dateTime={initialOrder.created_at}>{formatClockTime(initialOrder.created_at, restaurantTimeZone)}</time>
                    </div>
                    <div className="mt-3 grid w-full max-w-md grid-cols-2 gap-2">
                        <a href="#live-tracking" className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-full bg-gradient-to-r from-[#00e7ba] to-[#00c9ee] px-2 text-[11px] font-bold text-[#031821] shadow-[0_0_25px_rgba(0,229,255,0.2)] transition-[transform,box-shadow,filter] duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_32px_rgba(0,229,255,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8bffff] active:translate-y-0 motion-reduce:transition-none sm:gap-2 sm:px-5 sm:text-sm">
                            {isCompleted ? "View Order" : "Track Order"} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </a>
                        <a href="#order-details" className="inline-flex min-h-11 min-w-0 items-center justify-center rounded-full border border-[#17435a] bg-[#061a29] px-2 text-[10px] font-semibold text-[#d6e7f0] transition-[border-color,color,background-color] duration-200 hover:border-[#00e5ff]/60 hover:bg-[#082234] hover:text-[#00e5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5ff] motion-reduce:transition-none sm:px-5 sm:text-sm">View Order Details</a>
                    </div>
                </div>
            </section>

            {statusToast ? (
                <div role="status" aria-live="polite" className={`order-status-toast fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 right-4 z-40 mx-auto flex max-w-md items-center gap-3 rounded-xl border ${STATUS_STYLE[statusToastStatus].border} bg-[#0b2033] px-4 py-3 text-sm font-semibold text-[#e9f5fb] shadow-xl sm:bottom-6 sm:left-auto sm:right-6`}>
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#102e40] ${STATUS_STYLE[statusToastStatus].accent}`}><Bell className="h-4 w-4" aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1">{statusToast}</span>
                    <button type="button" aria-label="Dismiss order update" onClick={() => setStatusToast("")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#a8bed2] transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5ff]"><X className="h-4 w-4" aria-hidden="true" /></button>
                </div>
            ) : null}

            <section id="live-tracking" aria-label="Live order tracking" className="scroll-mt-5 overflow-hidden rounded-3xl border border-[#17435a] bg-[#071827] shadow-[0_16px_45px_rgba(0,0,0,0.18)]">
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#14384d] px-5 py-5 sm:px-7">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#00d9ee]">Live order tracking</p>
                        <h2 className="mt-1 text-lg font-bold text-[#f5faff]">Track Your Order</h2>
                        <p className="mt-1 text-xs text-[#91a8ba]">Real-time updates on your food and service.</p>
                    </div>
                    <span className={`inline-flex min-h-8 items-center gap-2 rounded-full border ${statusStyle.border} bg-[#0a2031] px-3 text-xs font-bold ${statusStyle.accent}`}>
                        <span className={`h-2 w-2 rounded-full ${statusStyle.dot}`} />{ORDER_STATUS_LABELS[liveOrder.status]}
                    </span>
                </header>

                <ProgressTimeline order={initialOrder} liveOrder={liveOrder} timeZone={restaurantTimeZone} />

                {terminal ? (
                    <div className={`order-ready-panel mx-4 mb-5 flex items-start gap-3 rounded-2xl border ${statusStyle.border} bg-[#0a1d2b] p-5 sm:mx-7 sm:mb-7 sm:p-6`}>
                        <AlertCircle className={`mt-0.5 h-5 w-5 shrink-0 ${statusStyle.accent}`} aria-hidden="true" />
                        <div className="min-w-0">
                            <h3 className={`text-base font-bold ${statusStyle.accent}`}>{statusStyle.title}</h3>
                            <p className="mt-1 text-sm leading-6 text-[#bdcbd6]">{statusStyle.description}</p>
                            {liveOrder.status === "rejected" && liveOrder.rejection_reason ? <p className="mt-2 rounded-xl border border-[#49313a] bg-[#1c1921] px-3 py-2 text-sm leading-5 text-[#ffd2d2]">{liveOrder.rejection_reason}</p> : null}
                            <Link href="/menu" className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#00d8df] px-5 text-sm font-bold text-[#031821] transition-colors hover:bg-[#5cf4ee] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a1d2b]">Back to menu <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                        </div>
                    </div>
                ) : isPreparing ? (
                    <div className="border-t border-[#14384d]">
                        <div className="mx-5 mt-5 flex items-center gap-3 rounded-2xl border border-[#17435a] bg-[#0a2031] p-4 sm:mx-7">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#00e5ff]/20 bg-[#062638] text-[#00e5ff]"><ChefHat className="h-6 w-6" aria-hidden="true" /></span>
                            <div>
                                <h3 className="text-sm font-bold text-[#f5faff]">In the kitchen</h3>
                                <p className="mt-1 text-xs leading-5 text-[#a8bed2]">Our chefs are preparing your order fresh. We’ll let you know as soon as it’s ready.</p>
                            </div>
                        </div>
                        <PreparationCountdown
                            readyAt={liveOrder.estimated_ready_at}
                            estimatedMinutes={liveOrder.estimated_preparation_minutes}
                            now={now}
                            timeZone={restaurantTimeZone}
                        />
                    </div>
                ) : isReady || isCompleted ? (
                    <div className={`order-ready-panel mx-4 mb-5 flex flex-col items-center rounded-2xl border ${isCompleted ? "border-[#00dfa5]/30 bg-[#06251f]" : "border-[#00dfa5]/40 bg-[#062823]"} px-5 py-7 text-center sm:mx-7 sm:mb-7 sm:py-9`}>
                        <span className="flex h-16 w-16 items-center justify-center rounded-full border border-[#00dfa5]/45 bg-[#073b32] text-[#00f0b4] shadow-[0_0_30px_rgba(0,223,165,0.2)]"><CheckCircle2 className="h-9 w-9" aria-hidden="true" /></span>
                        <h3 className="mt-4 text-xl font-bold text-[#eafff8]">{isCompleted ? "Order Completed!" : "Your Order Is Ready!"}</h3>
                        <p className="mt-2 max-w-md text-sm leading-6 text-[#b3d8ce]">{isCompleted ? "Thank you for dining with us. We hope you had a great experience!" : "Your food is ready to be served. Please collect it from the restaurant staff."}</p>
                        {isCompleted ? <Link href="/menu" className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#00dfa5]/45 px-5 text-sm font-bold text-[#8ff5d6] transition-colors hover:bg-[#00dfa5]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00dfa5]">Return to menu <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link> : null}
                    </div>
                ) : (
                    <div className="mx-4 mb-5 flex items-start gap-3 rounded-2xl border border-[#17435a] bg-[#0a2031] p-4 sm:mx-7 sm:mb-7 sm:p-5">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#00e5ff]/25 bg-[#062638] text-[#00e5ff]">{liveOrder.status === "pending" ? <ShoppingBag className="h-5 w-5" aria-hidden="true" /> : <CircleCheck className="h-5 w-5" aria-hidden="true" />}</span>
                        <div>
                            <h3 className={`text-sm font-bold ${statusStyle.accent}`}>{statusStyle.title}</h3>
                            <p className="mt-1 text-sm leading-6 text-[#b4c6d9]">{liveOrder.status === "confirmed" && liveOrder.estimated_preparation_minutes
                                ? `Estimated preparation is about ${liveOrder.estimated_preparation_minutes} minutes. The estimate begins when the kitchen starts preparing your order.`
                                : statusStyle.description}</p>
                        </div>
                    </div>
                )}

                {refreshMessage ? <p role="status" className="flex items-start gap-2 border-t border-[#14384d] bg-[#0a2031] px-5 py-3 text-xs leading-5 text-[#b8c9d6] sm:px-7"><RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-[#00e5ff]" aria-hidden="true" />{refreshMessage}</p> : null}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#14384d] bg-[#061521] px-5 py-3 text-xs text-[#9fb4c4] sm:px-7">
                    <span className="inline-flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${realtimeAvailable ? "bg-[#00dfa5]" : "bg-[#e5b45f]"}`} />{realtimeAvailable ? "Live updates enabled" : refreshMessage ? "Connection interrupted · retrying" : "Connecting to live updates"}</span>
                    <span>Payment is handled by restaurant staff</span>
                </div>
            </section>

            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(19rem,0.8fr)]">
                <section id="order-details" aria-label="Order details" className="scroll-mt-24 overflow-hidden rounded-3xl border border-[#17435a] bg-[#071827] shadow-[0_16px_45px_rgba(0,0,0,0.18)]">
                    <header className="border-b border-[#14384d] px-5 py-5 sm:px-6">
                        <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#00d9ee]">Your selection</p>
                        <h2 className="mt-1 text-lg font-bold text-[#f5faff]">Order details</h2>
                        <p className="mt-1 text-xs text-[#91a8ba]">{items.length} {items.length === 1 ? "item" : "items"} · {tableLabel}</p>
                    </header>
                    <div className="divide-y divide-[#14384d] px-5 sm:px-6">
                        {items.map((item) => (
                            <article key={item.id} className="flex items-start justify-between gap-3 py-4">
                                <div className="flex min-w-0 items-start gap-3">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#17435a] bg-[#0a2434] text-[#00d9ee]"><Utensils className="h-4 w-4" aria-hidden="true" /></span>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold leading-5 text-[#ecf5fa]">{item.item_name}</p>
                                        <p className="mt-1 text-xs text-[#91a8ba]">{item.quantity} × {formatPrice(item.unit_price, initialOrder.currency)}</p>
                                        {item.special_instructions ? <p className="mt-1 text-xs leading-5 text-[#a8bed2]">{item.special_instructions}</p> : null}
                                    </div>
                                </div>
                                <p className="shrink-0 pt-0.5 text-sm font-bold tabular-nums text-[#e7f1f8]">{formatPrice(item.line_total, initialOrder.currency)}</p>
                            </article>
                        ))}
                    </div>
                    {initialOrder.customer_note ? <p className="mx-5 mt-2 rounded-xl border border-[#594a31] bg-[#241e12] px-3 py-2 text-xs leading-5 text-[#e6ca93] sm:mx-6"><strong>Note for restaurant:</strong> {initialOrder.customer_note}</p> : null}
                    <dl className="mt-3 space-y-3 border-t border-[#14384d] bg-[#061521] px-5 py-5 text-sm sm:px-6">
                        <div className="flex justify-between gap-4 text-[#a8bed2]"><dt>Subtotal</dt><dd className="tabular-nums">{formatPrice(initialOrder.subtotal, initialOrder.currency)}</dd></div>
                        <div className="flex justify-between gap-4 text-[#a8bed2]"><dt>Discount</dt><dd className="tabular-nums">−{formatPrice(initialOrder.discount_total, initialOrder.currency)}</dd></div>
                        <div className="flex justify-between gap-4 border-t border-[#17435a] pt-3 text-base font-bold text-[#f5faff]"><dt>Total</dt><dd className="tabular-nums">{formatPrice(initialOrder.total, initialOrder.currency)}</dd></div>
                        <div className="flex justify-between gap-4 border-t border-[#14384d] pt-3 text-xs text-[#a8bed2]">
                            <dt>Payment</dt>
                            <dd className="text-right font-semibold text-[#d4e1e9]">
                                {liveOrder.preferred_payment_method ? `${PAYMENT_METHOD_LABELS[liveOrder.preferred_payment_method]} preference` : "No preference recorded"} · {PAYMENT_STATUS_LABELS[liveOrder.payment_status]}
                                <span className="mt-1 block font-normal text-[#91a8ba]">Paid {formatPrice(liveOrder.amount_paid, initialOrder.currency)} · Due {formatPrice(Math.max(0, initialOrder.total - liveOrder.amount_paid), initialOrder.currency)}</span>
                            </dd>
                        </div>
                    </dl>
                    <p className="border-t border-[#14384d] px-5 py-3 text-xs leading-5 text-[#91a8ba] sm:px-6">Your selected payment method is a preference. Restaurant staff will collect and verify payment; no payment is charged online.</p>
                </section>

                <aside className="space-y-4">
                    <section className="rounded-3xl border border-[#17435a] bg-[#071827] p-5 sm:p-6">
                        <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#00d9ee]">Order summary</p>
                        <h2 className="mt-1 text-lg font-bold text-[#f5faff]">#{initialOrder.order_number}</h2>
                        <dl className="mt-4 space-y-3 border-t border-[#14384d] pt-4 text-sm">
                            <div className="flex items-center justify-between gap-3 text-[#a8bed2]"><dt className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-[#00d9ee]" aria-hidden="true" />Table</dt><dd className="text-right font-semibold text-[#e5eff5]">{tableLabel}</dd></div>
                            <div className="flex items-center justify-between gap-3 text-[#a8bed2]"><dt className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-[#00d9ee]" aria-hidden="true" />Order time</dt><dd className="text-right font-semibold text-[#e5eff5]"><time dateTime={initialOrder.created_at}>{formatDate(initialOrder.created_at, restaurantTimeZone)}</time></dd></div>
                        </dl>
                    </section>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                        {liveOrder.status === "pending" && allowCustomerCancellation ? <CancelOrderButton orderId={initialOrder.id} /> : null}
                        <Link href="/contact" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#315066] bg-[#081e2e] px-4 text-sm font-bold text-[#d3e2eb] transition-colors hover:border-[#00e5ff]/55 hover:text-[#00e5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5ff]">Contact restaurant <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                        <Link href="/menu" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#00d8df] px-4 text-sm font-bold text-[#031821] transition-colors hover:bg-[#55f0ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5ff]">Browse menu <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                    </div>
                    <CustomerReviewPrompt orderId={initialOrder.id} orderNumber={initialOrder.order_number} completed={isCompleted} />
                </aside>
            </div>
        </div>
    );
}
