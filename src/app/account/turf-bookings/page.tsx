import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarDays } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth-server";
import type { Json } from "@/types/database";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
    title: "My Turf Bookings",
    robots: { index: false, follow: false },
};

type CustomerBooking = {
    reference: string;
    starts_at: string;
    ends_at: string;
    booking_mode: string;
    status: string;
    price: number;
    required_advance: number;
    is_past: boolean;
    created_at: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBooking(value: unknown): CustomerBooking | null {
    if (!isRecord(value)
        || typeof value.reference !== "string"
        || typeof value.starts_at !== "string"
        || typeof value.ends_at !== "string"
        || typeof value.booking_mode !== "string"
        || typeof value.status !== "string"
        || typeof value.price !== "number"
        || typeof value.required_advance !== "number"
        || typeof value.is_past !== "boolean"
        || typeof value.created_at !== "string") return null;
    return {
        reference: value.reference,
        starts_at: value.starts_at,
        ends_at: value.ends_at,
        booking_mode: value.booking_mode,
        status: value.status,
        price: value.price,
        required_advance: value.required_advance,
        is_past: value.is_past,
        created_at: value.created_at,
    };
}

function formattedDate(value: string) {
    return new Intl.DateTimeFormat("en-BD", {
        timeZone: "Asia/Dhaka",
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
}

function formattedPrice(value: number) {
    return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(value);
}

function BookingCard({ booking }: { booking: CustomerBooking }) {
    return (
        <article className="rounded-2xl border border-[#dce8e0] bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <Link href={`/turf/booking/${encodeURIComponent(booking.reference)}`}
                        className="font-mono text-sm font-bold text-[#087a4a] hover:underline">{booking.reference}</Link>
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                        <CalendarDays className="h-4 w-4 text-[#138153]" aria-hidden="true" />
                        {formattedDate(booking.starts_at)}
                    </p>
                    <p className="mt-1 text-xs text-[#6a8176]">{booking.booking_mode === "fixed" ? "Fixed slot" : "Hourly booking"} · until {new Intl.DateTimeFormat("en-BD", { timeZone: "Asia/Dhaka", timeStyle: "short" }).format(new Date(booking.ends_at))}</p>
                </div>
                <span className="rounded-full bg-[#e8f4ec] px-3 py-1.5 text-xs font-bold capitalize text-[#087a4a]">{booking.status.replaceAll("_", " ")}</span>
            </div>
            <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-[#e8efea] pt-3 text-sm">
                <span>Total {formattedPrice(booking.price)}</span>
                <span className="text-[#597267]">Advance due {formattedPrice(booking.required_advance)}</span>
            </div>
            <Link href={`/turf/booking/${encodeURIComponent(booking.reference)}`} className="mt-3 inline-block text-sm font-bold text-[#087a4a] hover:underline">View booking details →</Link>
        </article>
    );
}

function BookingSection({ title, bookings }: { title: string; bookings: CustomerBooking[] }) {
    return (
        <section className="mt-7">
            <h2 className="text-lg font-extrabold">{title} <span className="text-sm font-semibold text-[#6a8176]">({bookings.length})</span></h2>
            {bookings.length ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2">{bookings.map((booking) => <BookingCard key={booking.reference} booking={booking} />)}</div>
            ) : <p className="mt-3 rounded-xl border border-dashed border-[#cbd9d0] bg-white p-4 text-sm text-[#6a8176]">No bookings in this section.</p>}
        </section>
    );
}

export default async function CustomerTurfBookingsPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/login?next=%2Faccount%2Fturf-bookings");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("turf_customer_bookings");
    if (error) {
        console.error("Customer turf bookings could not be loaded.", {
            code: error.code,
            message: error.message,
        });
        return <main className="min-h-screen bg-[#f4f8f6] p-6"><p className="mx-auto max-w-3xl rounded-2xl bg-white p-6 text-sm text-red-800">Your bookings could not be loaded. Please try again.</p></main>;
    }

    const response: Json = data;
    const bookings = isRecord(response) && Array.isArray(response.bookings)
        ? response.bookings.map(parseBooking).filter((booking): booking is CustomerBooking => booking !== null)
        : [];
    const inProgress = bookings.filter((booking) => ["pending", "approved_awaiting_payment", "payment_under_review"].includes(booking.status));
    const upcoming = bookings.filter((booking) =>
        !inProgress.includes(booking)
        && !booking.is_past
        && ["confirmed"].includes(booking.status),
    );
    const past = bookings.filter((booking) => !inProgress.includes(booking) && !upcoming.includes(booking));

    return (
        <main className="min-h-screen bg-[#f4f8f6] text-[#102b22]">
            <header className="bg-[#082c22] text-white">
                <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
                    <Link href="/turf" className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-200 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> The Bubbles Turf</Link>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                        <h1 className="text-2xl font-black">My Turf Bookings</h1>
                        <Link href="/account/turf-notifications" className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20">Notifications</Link>
                    </div>
                </div>
            </header>
            <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
                <BookingSection title="Pending requests" bookings={inProgress} />
                <BookingSection title="Upcoming bookings" bookings={upcoming} />
                <BookingSection title="Past & resolved" bookings={past} />
                <Link href="/turf/book" className="mt-7 inline-flex min-h-11 items-center rounded-xl bg-[#087a4a] px-5 text-sm font-bold text-white hover:bg-[#06643d]">Request another booking</Link>
            </div>
        </main>
    );
}
