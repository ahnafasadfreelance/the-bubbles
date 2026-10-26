import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { TurfBookingForm } from "@/components/turf-booking-form";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { getCurrentCustomer } from "@/lib/supabase/auth-server";

export const metadata: Metadata = {
    title: "Book the Turf",
    description: "Check availability and request a rooftop turf booking.",
    robots: { index: false, follow: false },
};

function dhakaDate() {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Dhaka",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}`;
}

export default async function TurfBookPage() {
    const customer = await getCurrentCustomer();
    const today = dhakaDate();

    return (
        <main className="min-h-screen bg-[#f4f8f6] text-[#102b22]">
            <header className="border-b border-[#dce8e0] bg-white">
                <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
                    <Link href="/turf" className="inline-flex items-center gap-2 text-sm font-semibold text-[#426354] hover:text-[#087a4a]">
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> The Bubbles Turf
                    </Link>
                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#698276]">Dhaka · BDT</span>
                </div>
            </header>
            <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
                <div className="max-w-2xl">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#138153]">Make it a match day</p>
                    <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Choose your turf time</h1>
                    <p className="mt-3 text-sm leading-6 text-[#597267]">
                        Availability and pricing are checked again when you submit. Your request stays pending until staff review it.
                    </p>
                </div>
                {!customer ? (
                    <section className="mt-7 max-w-lg rounded-2xl border border-[#c8e4d5] bg-white p-5 shadow-sm">
                        <h2 className="font-bold">Sign in to request a booking</h2>
                        <p className="mb-4 mt-1 text-sm text-[#597267]">Use your Google account. You can browse availability before signing in.</p>
                        <GoogleSignInButton next="/turf/book" />
                    </section>
                ) : null}
                <TurfBookingForm
                    today={today}
                    customerName={customer?.displayName ?? ""}
                    signedIn={Boolean(customer)}
                />
            </div>
        </main>
    );
}
