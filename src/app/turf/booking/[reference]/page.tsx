import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock3 } from "lucide-react";

import { TurfPaymentForm } from "@/components/turf-payment-form";
import { TurfChangeRequestForm } from "@/components/turf-change-request-form";
import { getCurrentUser } from "@/lib/supabase/auth-server";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Turf Booking Tracking",
    robots: { index: false, follow: false },
};

type TrackingPayment = {
    amount: number;
    method: string;
    status: string;
    submitted_at: string;
    reviewed_at: string | null;
    review_reason: string | null;
};

type TrackingEvent = {
    action: string;
    reason: string | null;
    created_at: string;
};

type TrackingPaymentMethod = {
    method: string;
    display_name: string;
    account_details: string;
    account_type: string;
    instructions: string;
};

type CustomerChangeRequest = {
    request_type: string;
    status: string;
    reason: string;
    review_reason: string | null;
    created_at: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonArray<T>(value: unknown, parse: (item: unknown) => T | null): T[] {
    return Array.isArray(value) ? value.flatMap((item) => {
        const parsed = parse(item);
        return parsed ? [parsed] : [];
    }) : [];
}

function parsePayment(value: unknown): TrackingPayment | null {
    if (!isRecord(value)
        || typeof value.amount !== "number"
        || typeof value.method !== "string"
        || typeof value.status !== "string"
        || typeof value.submitted_at !== "string") return null;
    return {
        amount: value.amount,
        method: value.method,
        status: value.status,
        submitted_at: value.submitted_at,
        reviewed_at: typeof value.reviewed_at === "string" ? value.reviewed_at : null,
        review_reason: typeof value.review_reason === "string" ? value.review_reason : null,
    };
}

function parseEvent(value: unknown): TrackingEvent | null {
    if (!isRecord(value) || typeof value.action !== "string" || typeof value.created_at !== "string") return null;
    return {
        action: value.action,
        reason: typeof value.reason === "string" ? value.reason : null,
        created_at: value.created_at,
    };
}

function parsePaymentMethod(value: unknown): TrackingPaymentMethod | null {
    if (!isRecord(value)
        || typeof value.method !== "string"
        || typeof value.display_name !== "string"
        || typeof value.account_details !== "string"
        || typeof value.account_type !== "string"
        || typeof value.instructions !== "string") return null;
    return {
        method: value.method,
        display_name: value.display_name,
        account_details: value.account_details,
        account_type: value.account_type,
        instructions: value.instructions,
    };
}

function parseChangeRequest(value: unknown): CustomerChangeRequest | null {
    if (!isRecord(value)
        || typeof value.request_type !== "string"
        || typeof value.status !== "string"
        || typeof value.reason !== "string"
        || typeof value.created_at !== "string") return null;
    return {
        request_type: value.request_type,
        status: value.status,
        reason: value.reason,
        review_reason: typeof value.review_reason === "string" ? value.review_reason : null,
        created_at: value.created_at,
    };
}

function formatDate(value: string) {
    return new Intl.DateTimeFormat("en-BD", {
        timeZone: "Asia/Dhaka",
        dateStyle: "full",
        timeStyle: "short",
    }).format(new Date(value));
}

function formatPrice(value: number) {
    return new Intl.NumberFormat("en-BD", {
        style: "currency",
        currency: "BDT",
        maximumFractionDigits: 0,
    }).format(value);
}

function statusLabel(status: string) {
    return status.replaceAll("_", " ");
}

export default async function TurfBookingTrackingPage({
    params,
    searchParams,
}: {
    params: Promise<{ reference: string }>;
    searchParams: Promise<{ token?: string }>;
}) {
    const [{ reference }, { token }] = await Promise.all([params, searchParams]);
    if (!/^BB-TURF-\d{1,15}$/.test(reference) || (token && token.length > 100)) notFound();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("turf_get_booking_tracking", {
        p_reference: reference,
        p_tracking_token: token ?? null,
    });
    if (error) {
        console.error("Turf booking tracking query failed.", { code: error.code });
        notFound();
    }

    const booking: Json = data;
    if (!isRecord(booking)
        || typeof booking.id !== "string"
        || typeof booking.reference !== "string"
        || typeof booking.starts_at !== "string"
        || typeof booking.ends_at !== "string"
        || typeof booking.booking_mode !== "string"
        || typeof booking.status !== "string"
        || typeof booking.price !== "number"
        || typeof booking.required_advance !== "number"
        || typeof booking.currency !== "string") notFound();

    const payments = parseJsonArray(booking.payments, parsePayment);
    const timeline = parseJsonArray(booking.timeline, parseEvent);
    const paymentMethods = parseJsonArray(booking.payment_methods, parsePaymentMethod);
    const user = await getCurrentUser();
    let changeRequests: CustomerChangeRequest[] = [];
    let changeRequestsAvailable = false;
    let changeRequestLoadError = false;
    if (user) {
        const { data: changesData, error: changesError } = await supabase.rpc("turf_customer_booking_change_requests", {
            p_booking_id: booking.id,
        });
        if (changesError) {
            if (changesError.code !== "P0002") {
                console.error("Turf booking change requests could not be loaded.", { code: changesError.code });
                changeRequestLoadError = true;
            }
        } else if (isRecord(changesData) && Array.isArray(changesData.requests)) {
            changeRequests = changesData.requests.map(parseChangeRequest).filter((item): item is CustomerChangeRequest => item !== null);
            changeRequestsAvailable = true;
        }
    }
    const verifiedAdvance = payments
        .filter((payment) => payment.status === "verified")
        .reduce((total, payment) => total + payment.amount, 0);
    const remaining = Math.max(0, booking.price - verifiedAdvance);
    const outstandingAdvance = Math.max(0, booking.required_advance - verifiedAdvance);

    return (
        <main className="min-h-screen bg-[#f4f8f6] text-[#102b22]">
            <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
                <Link href="/turf" className="inline-flex items-center gap-2 text-sm font-semibold text-[#426354] hover:text-[#087a4a]">
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Turf home
                </Link>
                <section className="mt-6 rounded-3xl border border-[#dce8e0] bg-white p-5 shadow-sm sm:p-8">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#138153]">Booking reference</p>
                            <h1 className="mt-1 font-mono text-2xl font-black">{booking.reference}</h1>
                        </div>
                        <span className="rounded-full bg-[#e8f4ec] px-3 py-1.5 text-sm font-bold capitalize text-[#087a4a]">
                            {statusLabel(booking.status)}
                        </span>
                    </div>
                    <div className="mt-6 rounded-2xl bg-[#f4f8f6] p-4">
                        <p className="flex items-center gap-2 text-sm font-bold"><Clock3 className="h-4 w-4 text-[#087a4a]" aria-hidden="true" /> {formatDate(booking.starts_at)} – {new Intl.DateTimeFormat("en-BD", { timeZone: "Asia/Dhaka", timeStyle: "short" }).format(new Date(booking.ends_at))}</p>
                        <p className="mt-2 text-sm text-[#597267]">{booking.booking_mode === "fixed" ? "Fixed slot" : "Hourly booking"}</p>
                    </div>
                    <div className="mt-6 grid gap-4 sm:grid-cols-3">
                        <div className="rounded-xl border border-[#e4ece7] p-4"><p className="text-xs text-[#6a8176]">Agreed price</p><p className="mt-1 font-bold">{formatPrice(booking.price)}</p></div>
                        <div className="rounded-xl border border-[#e4ece7] p-4"><p className="text-xs text-[#6a8176]">Required advance</p><p className="mt-1 font-bold">{formatPrice(booking.required_advance)}</p></div>
                        <div className="rounded-xl border border-[#e4ece7] p-4"><p className="text-xs text-[#6a8176]">Remaining balance</p><p className="mt-1 font-bold">{formatPrice(remaining)}</p></div>
                    </div>
                    {booking.payment_deadline && typeof booking.payment_deadline === "string" ? (
                        <p className="mt-4 text-sm text-[#597267]">Advance payment deadline: <strong>{formatDate(booking.payment_deadline)}</strong></p>
                    ) : null}
                    <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                        {booking.status === "pending"
                            ? "Your request is awaiting staff review. Do not make a payment until staff approves it and provides official payment instructions."
                            : booking.status === "approved_awaiting_payment"
                                ? "Your request has been approved. Follow the payment instructions provided by staff. The booking is not confirmed until the advance is verified."
                                : booking.status === "confirmed"
                                    ? "Your booking is confirmed. Please arrive on time and review the accepted policy below."
                                    : `Current status: ${statusLabel(booking.status)}. Contact The Bubbles if you need help.`}
                    </div>

                    <section className="mt-8">
                        <h2 className="text-lg font-extrabold">Payment submissions</h2>
                        {payments.length ? (
                            <ul className="mt-3 divide-y divide-[#e8efea] rounded-xl border border-[#e4ece7]">
                                {payments.map((payment, index) => (
                                    <li key={`${payment.submitted_at}-${index}`} className="flex flex-wrap justify-between gap-2 p-4 text-sm">
                                        <span>{payment.method} · {formatPrice(payment.amount)}</span>
                                        <span className="capitalize text-[#597267]">{statusLabel(payment.status)}</span>
                                        {payment.review_reason ? <p className="w-full text-xs text-[#6a8176]">Staff note: {payment.review_reason}</p> : null}
                                    </li>
                                ))}
                            </ul>
                        ) : <p className="mt-2 text-sm text-[#6a8176]">No payment has been submitted.</p>}
                    </section>

                    {booking.status === "approved_awaiting_payment" && outstandingAdvance > 0 ? (
                        <section className="mt-8 border-t border-[#e8efea] pt-6">
                            <h2 className="text-lg font-extrabold">Submit advance payment</h2>
                            <p className="mt-1 text-sm text-[#597267]">Outstanding advance: {formatPrice(outstandingAdvance)}. Your booking remains unconfirmed until staff verify receipt.</p>
                            <TurfPaymentForm
                                bookingId={booking.id}
                                methods={paymentMethods}
                                outstandingAdvance={outstandingAdvance}
                            />
                        </section>
                    ) : null}

                    {changeRequestsAvailable ? (
                        <TurfChangeRequestForm
                            bookingId={booking.id}
                            status={booking.status}
                            startsAt={booking.starts_at}
                            endsAt={booking.ends_at}
                            requests={changeRequests}
                        />
                    ) : null}
                    {changeRequestLoadError ? (
                        <p role="alert" className="mt-8 border-t border-[#e8efea] pt-6 text-sm text-red-800">
                            Change requests are temporarily unavailable. Please retry before contacting staff.
                        </p>
                    ) : null}
                    {!user && ["pending", "approved_awaiting_payment", "payment_under_review", "confirmed"].includes(booking.status) ? (
                        <p className="mt-8 border-t border-[#e8efea] pt-6 text-sm text-[#597267]">
                            <Link href="/login?next=%2Faccount%2Fturf-bookings" className="font-bold text-[#087a4a] hover:underline">Sign in</Link> to request a cancellation or reschedule.
                        </p>
                    ) : null}

                    <section className="mt-8">
                        <h2 className="text-lg font-extrabold">Request timeline</h2>
                        {timeline.length ? (
                            <ol className="mt-3 space-y-3 border-l border-[#cbd9d0] pl-4">
                                {timeline.map((event, index) => (
                                    <li key={`${event.created_at}-${index}`} className="relative text-sm">
                                        <span className="absolute -left-[1.32rem] top-1 h-2 w-2 rounded-full bg-emerald-600" />
                                        <p className="font-semibold capitalize">{statusLabel(event.action)}</p>
                                        <p className="text-xs text-[#6a8176]">{formatDate(event.created_at)}</p>
                                        {event.reason ? <p className="mt-1 text-[#597267]">{event.reason}</p> : null}
                                    </li>
                                ))}
                            </ol>
                        ) : <p className="mt-2 text-sm text-[#6a8176]">No updates yet.</p>}
                    </section>
                    <Link href="/account/turf-bookings" className="mt-8 inline-block text-sm font-bold text-[#087a4a] hover:underline">
                        View all my turf bookings →
                    </Link>
                </section>
            </div>
        </main>
    );
}
