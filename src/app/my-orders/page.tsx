import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getCurrentCustomer } from "@/lib/supabase/auth-server";
import { getCustomerOrders } from "@/lib/order-data";
import { getRestaurantSettings } from "@/lib/restaurant-data";
import { formatPrice } from "@/lib/format-price";
import { PAYMENT_STATUS_LABELS } from "@/lib/payment";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/order-status";
import { getCurrentOrderingSession } from "@/lib/ordering-session";
import { getCurrentTableContext } from "@/lib/table-context";
import { OrderingSessionProvider } from "@/components/ordering-session";

export const metadata: Metadata = {
    title: "My Orders",
    robots: { index: false, follow: false },
};

const statusTone: Record<OrderStatus, string> = {
    pending: "border-[#00e5ff]/35 bg-[#062638] text-[#00e5ff]",
    confirmed: "border-[#00e5ff]/35 bg-[#062638] text-[#00e5ff]",
    preparing: "border-[#00e5ff]/35 bg-[#062638] text-[#00e5ff]",
    ready: "border-[#00dfa5]/35 bg-[#062b27] text-[#00dfa5]",
    completed: "border-[#00dfa5]/35 bg-[#062b27] text-[#00dfa5]",
    rejected: "border-[#ff7070]/35 bg-[#29191e] text-[#ff9292]",
    cancelled: "border-[#7890a5]/35 bg-[#172330] text-[#a8bed2]",
};

export default async function MyOrdersPage() {
    const customer = await getCurrentCustomer();
    if (!customer) redirect("/login?next=%2Fmy-orders");

    const [settings, result] = await Promise.all([
        getRestaurantSettings(),
        getCustomerOrders(customer.id),
    ]);
    const tableContext = await getCurrentTableContext();
    const orderingSession = tableContext
        ? await getCurrentOrderingSession(tableContext.tableId)
        : null;

    return (
        <OrderingSessionProvider key={orderingSession?.createdAt ?? "no-session"} session={orderingSession}>
        <div className="public-mobile-shell min-h-screen bg-[#020b16] text-[#f5faff]">
            <SiteHeader restaurant={settings.restaurant} />
            <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:space-y-7 sm:px-8 sm:py-10 lg:px-10">
                <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#17435a] pb-5">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#00d9ee]">Your account</p>
                        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">My Orders</h1>
                    </div>
                    <Link href="/menu" className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#00d8df] px-5 text-sm font-bold text-[#031821] transition-colors hover:bg-[#55f0ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5ff]">Browse menu</Link>
                </header>

                {result.error ? (
                    <p role="alert" className="rounded-2xl border border-[#ff7070]/35 bg-[#21181d] p-4 text-sm text-[#ffd2d2]">We couldn’t load your orders. Please try again shortly.</p>
                ) : result.data.length === 0 ? (
                    <section className="rounded-3xl border border-[#17435a] bg-[#071827] px-6 py-12 text-center">
                        <h2 className="text-2xl font-bold">No orders yet.</h2>
                        <p className="mt-2 text-sm text-[#a8bed2]">Your dine-in orders will appear here.</p>
                        <Link href="/menu" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-[#00d8df] px-5 text-sm font-bold text-[#031821] transition-colors hover:bg-[#55f0ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5ff]">Browse the menu</Link>
                    </section>
                ) : (
                    <>
                    <div className="space-y-2 md:hidden">
                        {result.data.map((order) => (
                            <Link key={order.id} href={`/orders/${order.id}`} className="block rounded-2xl border border-[#17435a] bg-[#071827] p-4 transition-colors hover:border-[#00e5ff]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5ff]">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm font-bold text-white">#{order.order_number}</span>
                                    <span className={`rounded-full border px-3 py-1 text-[10px] font-bold ${statusTone[order.status]}`}>{ORDER_STATUS_LABELS[order.status]}</span>
                                </div>
                                <p className="mt-2 text-xs text-[#a8bed2]">{order.table_name_snapshot || `Table ${order.table_number_snapshot}`} · <time dateTime={order.created_at}>{new Date(order.created_at).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}</time></p>
                                <div className="mt-3 flex items-center justify-between border-t border-[#14384d] pt-3 text-xs">
                                    <span className="text-[#a8bed2]">{order.payment_status === "unpaid" ? "Payment due at restaurant" : PAYMENT_STATUS_LABELS[order.payment_status]}</span>
                                    <span className="font-bold tabular-nums text-white">{formatPrice(order.total, order.currency)}</span>
                                </div>
                            </Link>
                        ))}
                    </div>
                    <div className="hidden overflow-x-auto rounded-2xl border border-[#17435a] bg-[#071827] md:block">
                        <table className="w-full min-w-175 border-collapse text-left text-sm">
                            <thead className="bg-[#0a2031] text-[10px] uppercase tracking-[0.12em] text-[#a8bed2]">
                                <tr>
                                    <th scope="col" className="px-4 py-3 font-bold">Order</th>
                                    <th scope="col" className="px-4 py-3 font-bold">Date</th>
                                    <th scope="col" className="px-4 py-3 font-bold">Table</th>
                                    <th scope="col" className="px-4 py-3 font-bold">Total</th>
                                    <th scope="col" className="px-4 py-3 font-bold">Payment</th>
                                    <th scope="col" className="px-4 py-3 font-bold">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#14384d]">
                                {result.data.map((order) => (
                                    <tr key={order.id} className="transition-colors hover:bg-[#0a2031]">
                                        <td className="px-4 py-4 font-semibold"><Link href={`/orders/${order.id}`} className="text-[#00e5ff] underline decoration-transparent hover:decoration-current">#{order.order_number}</Link></td>
                                        <td className="px-4 py-4 text-[#a8bed2]"><time dateTime={order.created_at}>{new Date(order.created_at).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}</time></td>
                                        <td className="px-4 py-4 text-[#d4e1e9]">{order.table_name_snapshot || `Table ${order.table_number_snapshot}`}</td>
                                        <td className="px-4 py-4 font-semibold tabular-nums text-[#f5faff]">{formatPrice(order.total, order.currency)}</td>
                                        <td className="px-4 py-4 text-[#a8bed2]">{order.payment_status === "unpaid" ? "Due at restaurant" : PAYMENT_STATUS_LABELS[order.payment_status]}</td>
                                        <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone[order.status]}`}>{ORDER_STATUS_LABELS[order.status]}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    </>
                )}
            </main>
            <SiteFooter restaurant={settings.restaurant} />
        </div>
        </OrderingSessionProvider>
    );
}