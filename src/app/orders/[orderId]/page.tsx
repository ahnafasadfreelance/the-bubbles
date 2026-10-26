import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Clock3, ShieldCheck, Zap } from "lucide-react";

import { CustomerOrderTracking } from "@/components/customer-order-tracking";
import { OrderingSessionProvider } from "@/components/ordering-session";
import { RestaurantImage } from "@/components/restaurant-image";
import { getCustomerOrder } from "@/lib/order-data";
import { getCurrentOrderingSession } from "@/lib/ordering-session";
import { getRestaurantSettings } from "@/lib/restaurant-data";
import { getCurrentCustomer } from "@/lib/supabase/auth-server";
import { getCurrentTableContext } from "@/lib/table-context";

type OrderPageProps = { params: Promise<{ orderId: string }> };

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: "Order details",
        robots: { index: false, follow: false },
    };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function OrderDetailsPage({ params }: OrderPageProps) {
    const [{ orderId }, settings, customer] = await Promise.all([
        params,
        getRestaurantSettings(),
        getCurrentCustomer(),
    ]);
    if (!customer) redirect(`/login?next=${encodeURIComponent(`/orders/${orderId}`)}`);
    if (!UUID_PATTERN.test(orderId)) notFound();

    const [result, tableContext] = await Promise.all([
        getCustomerOrder(orderId, customer.id),
        getCurrentTableContext(),
    ]);
    if (!result.error && !result.data) notFound();
    const orderData = result.data;
    const orderingSession = tableContext
        ? await getCurrentOrderingSession(tableContext.tableId)
        : null;

    return (
        <OrderingSessionProvider key={orderingSession?.createdAt ?? "no-session"} session={orderingSession}>
        <div className="order-tracking-page min-h-screen bg-[#020b16] text-[#f5faff]">
            <header className="border-b border-[#00e5ff]/15 bg-[#030f1c]/95">
                <div className="mx-auto flex min-h-[76px] max-w-7xl items-center justify-between gap-3 px-4 sm:px-7">
                    <Link href="/" className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5ff]">
                        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#00e5ff]/35 bg-[#07263a] text-[#00e5ff]">
                            {settings.restaurant.logoUrl
                                ? <RestaurantImage src={settings.restaurant.logoUrl} alt={`${settings.restaurant.name} logo`} fill sizes="40px" className="bg-[#07263a] object-contain p-1" />
                                : <span aria-hidden="true" className="text-[22px] font-bold">{settings.restaurant.name.slice(0, 1).toUpperCase()}</span>}
                        </span>
                        <span className="min-w-0">
                            <span className="block max-w-[34vw] truncate text-base font-extrabold tracking-wide text-white sm:max-w-none sm:text-xl">{settings.restaurant.name}</span>
                            <span className="block text-[9px] font-medium uppercase tracking-[0.12em] text-[#91a8ba]">Live Restaurant Orders</span>
                        </span>
                    </Link>
                    <div className="hidden min-w-0 items-center gap-5 border-l border-[#17435a] pl-5 sm:flex">
                        <div className="min-w-0">
                            <p className="text-2xl font-medium leading-7 text-white">Order <span className="font-bold text-[#00e5ff]">Tracking</span></p>
                            <p className="text-xs text-[#a8bed2]">Real-time updates. No more waiting.</p>
                        </div>
                    </div>
                    <div className="hidden shrink-0 items-center gap-4 lg:flex">
                        <span className="flex items-center gap-2 border-r border-[#17435a] pr-4 text-[10px] text-[#a8bed2]"><Zap className="h-5 w-5 text-[#00e5ff]" aria-hidden="true" /><span><strong className="block text-[#00e5ff]">Live Updates</strong>Know what’s happening</span></span>
                        <span className="flex items-center gap-2 border-r border-[#17435a] pr-4 text-[10px] text-[#a8bed2]"><ShieldCheck className="h-5 w-5 text-[#00e5ff]" aria-hidden="true" /><span><strong className="block text-[#00e5ff]">Accurate &amp; Reliable</strong>In sync with the restaurant</span></span>
                        <span className="flex items-center gap-2 text-[10px] text-[#a8bed2]"><Clock3 className="h-5 w-5 text-[#00e5ff]" aria-hidden="true" /><span><strong className="block text-[#00e5ff]">Better Experience</strong>Relax while we handle the rest</span></span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 sm:gap-4 lg:hidden">
                        <Link href="/my-orders" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-[#17435a] px-3 text-[11px] font-semibold text-[#d5e6ef] transition-colors hover:border-[#00e5ff]/55 hover:text-[#00e5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5ff] sm:px-4 sm:text-xs"><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> My orders</Link>
                    </div>
                    <Link href="/my-orders" className="hidden min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-[#17435a] px-4 text-xs font-semibold text-[#d5e6ef] transition-colors hover:border-[#00e5ff]/55 hover:text-[#00e5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5ff] lg:inline-flex"><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> My orders</Link>
                </div>
            </header>
            <main className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-7">
                {result.error || !orderData ? (
                    <section role="alert" className="mx-auto max-w-2xl rounded-2xl border border-[#17435a] bg-[#071827] p-6 text-sm text-[#d7e6ef] shadow-sm">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[#00e5ff]/25 bg-[#082436] text-[#00e5ff]"><span aria-hidden="true">!</span></span>
                        <h1 className="mt-4 text-lg font-bold text-[#f5faff]">Order details are temporarily unavailable</h1>
                        <p className="mt-1 leading-6 text-[#a8bed2]">We couldn’t load this order right now. A temporary network issue won’t affect your order. Try again or check My Orders shortly.</p>
                        <div className="mt-5 flex flex-wrap gap-3">
                            <a href={`/orders/${orderId}`} className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#00d8df] px-5 text-sm font-bold text-[#031821] transition-colors hover:bg-[#55f0ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5ff]">Try again</a>
                            <a href="/my-orders" className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#315066] px-5 text-sm font-bold text-[#d7e6ef] transition-colors hover:border-[#00e5ff]/55 hover:text-[#00e5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5ff]">My orders</a>
                        </div>
                    </section>
                ) : (
                    <CustomerOrderTracking
                        initialOrder={orderData.order}
                        items={orderData.items}
                        customerId={customer.id}
                        restaurantName={settings.restaurant.name}
                        restaurantTimeZone={settings.restaurant.timeZone}
                        allowCustomerCancellation={settings.restaurant.allowCustomerCancellation}
                        serverNow={new Date().toISOString()}
                    />
                )}
            </main>
            <footer className="border-t border-[#123247] px-4 py-5 text-center text-[10px] text-[#718ba0]">
                {settings.restaurant.name} · Live order tracking
            </footer>
        </div>
        </OrderingSessionProvider>
    );
}