import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Clock3, MapPin, ShieldCheck, Sparkles } from "lucide-react";

export const metadata: Metadata = {
    title: "Rooftop Football Turf",
    description: "Book The Bubbles rooftop football turf in Dhaka.",
};

export default function TurfPage() {
    return (
        <main className="min-h-screen overflow-hidden bg-[#061c2b] text-white">
            <header className="border-b border-white/10 bg-[#041521]/80">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
                    <Link href="/turf" className="text-lg font-black tracking-tight">
                        <span className="mr-2 text-emerald-400">●</span>The Bubbles <span className="font-medium text-white/55">Turf</span>
                    </Link>
                    <Link href="/" className="text-sm text-white/70 transition hover:text-white">Restaurant</Link>
                </div>
            </header>

            <section className="relative isolate border-b border-white/10">
                <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_72%_38%,rgba(15,174,105,0.25),transparent_42%),linear-gradient(135deg,#061c2b_15%,#0b2f37_100%)]" />
                <div className="mx-auto grid min-h-[32rem] max-w-6xl items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:py-24">
                    <div>
                        <p className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-emerald-200">
                            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Rooftop football, Dhaka
                        </p>
                        <h1 className="mt-6 max-w-2xl text-5xl font-black leading-[1.03] tracking-tight sm:text-6xl">
                            Your game.<br /><span className="text-emerald-300">Your rooftop.</span>
                        </h1>
                        <p className="mt-5 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
                            Get your crew together and book the rooftop pitch at The Bubbles. Check live availability, choose your time, and send a request for staff approval.
                        </p>
                        <div className="mt-8 flex flex-wrap gap-3">
                            <Link href="/turf/book" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-emerald-400 px-5 font-bold text-[#052619] transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                                Check availability <ArrowRight className="h-4 w-4" aria-hidden="true" />
                            </Link>
                            <a href="#details" className="inline-flex min-h-12 items-center rounded-xl border border-white/20 px-5 font-semibold text-white/85 transition hover:border-white/50">
                                Explore the turf
                            </a>
                        </div>
                        <p className="mt-5 text-xs text-slate-400">Bookings are confirmed only after staff approval and verified advance payment.</p>
                    </div>

                    <div className="relative mx-auto w-full max-w-md">
                        <div className="absolute -inset-5 rounded-[2rem] bg-emerald-400/10 blur-2xl" />
                        <div className="relative overflow-hidden rounded-[1.75rem] border border-white/15 bg-[#0b332e] p-5 shadow-2xl">
                            <div className="relative aspect-[1.05] overflow-hidden rounded-2xl border border-emerald-100/25 bg-[linear-gradient(180deg,#326c69_0%,#164c44_38%,#127242_39%,#07502d_100%)]">
                                <div aria-hidden="true" className="absolute inset-x-0 top-[39%] h-px bg-white/60" />
                                <div aria-hidden="true" className="absolute left-1/2 top-[39%] h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/55" />
                                <div aria-hidden="true" className="absolute inset-x-[12%] top-[10%] h-[80%] border border-white/40" />
                                <div aria-hidden="true" className="absolute inset-x-[27%] top-[10%] h-[19%] border border-white/45" />
                                <div aria-hidden="true" className="absolute inset-x-[27%] bottom-[10%] h-[19%] border border-white/45" />
                                <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-[#05251d]/95 to-transparent px-5 pb-5 pt-20">
                                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">Play under the Dhaka sky</p>
                                    <p className="mt-1 text-2xl font-extrabold">Rooftop Turf</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 pt-4">
                                <div className="rounded-xl bg-white/[0.06] p-3">
                                    <Clock3 className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                                    <p className="mt-2 text-sm font-bold">Hourly or fixed slots</p>
                                    <p className="text-xs text-slate-400">Pick a time that works</p>
                                </div>
                                <div className="rounded-xl bg-white/[0.06] p-3">
                                    <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                                    <p className="mt-2 text-sm font-bold">Secure requests</p>
                                    <p className="text-xs text-slate-400">Google sign-in required</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section id="details" className="mx-auto grid max-w-6xl gap-5 px-5 py-12 sm:grid-cols-3 sm:px-8 sm:py-16">
                <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                    <Clock3 className="h-5 w-5 text-emerald-300" aria-hidden="true" />
                    <h2 className="mt-4 font-bold">Pick your play time</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">Browse the daily schedule and choose an available hourly time or published fixed slot.</p>
                </article>
                <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                    <ShieldCheck className="h-5 w-5 text-emerald-300" aria-hidden="true" />
                    <h2 className="mt-4 font-bold">Request, then confirm</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">Staff review every request. Your booking is confirmed after approval and advance verification.</p>
                </article>
                <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
                    <MapPin className="h-5 w-5 text-emerald-300" aria-hidden="true" />
                    <h2 className="mt-4 font-bold">The Bubbles rooftop</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">A private pitch for your group, with schedule and policy details available before you book.</p>
                </article>
            </section>

            <footer className="border-t border-white/10 px-5 py-5 text-center text-xs text-slate-500">
                The Bubbles · Rooftop Football Turf · BDT · Asia/Dhaka
            </footer>
        </main>
    );
}
