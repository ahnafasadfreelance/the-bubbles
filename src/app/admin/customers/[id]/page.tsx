import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Mail, ShoppingBag } from "lucide-react";

import { getAdminCustomerDetails } from "@/lib/admin-customer-data";
import { requireAdminRole } from "@/lib/admin-auth";
import { formatPrice } from "@/lib/format-price";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";

function dateTime(value: string) {
    return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function AdminCustomerDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    await requireAdminRole("owner", "full_admin");
    const { id } = await params;
    const result = await getAdminCustomerDetails(id);
    if (!result.ok && result.reason === "not_found") notFound();

    return (
        <main className="mx-auto max-w-350 space-y-4 px-3 py-4 sm:px-5 lg:px-7">
            <Link href="/admin/customers" className="inline-flex min-h-9 items-center gap-2 text-sm font-semibold text-[#48b7ff] hover:text-white"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Customers</Link>
            {!result.ok ? <p role="alert" className="rounded-md border border-[#743b47] bg-[#331f35] px-4 py-3 text-sm text-[#ffd9df]">{result.reason === "unauthorized" ? "Administrator access is required." : "Customer details could not be loaded. Please retry."}</p> : <>
                <section className="rounded-md border border-[#d7e2ec] bg-white p-4 sm:p-6">
                    <div className="flex flex-wrap items-center gap-4">
                        {result.customer.avatar_url ? <Image src={result.customer.avatar_url} alt="" width={64} height={64} unoptimized className="h-16 w-16 rounded-full object-cover" /> : <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e8f4fc] text-2xl font-bold text-[#0871ad]">{result.customer.name.slice(0, 1).toUpperCase()}</span>}
                        <div className="min-w-0"><h1 className="text-xl font-bold text-[#09294d]">{result.customer.name}</h1><p className="mt-1 flex items-center gap-1.5 text-sm text-[#617991]"><Mail className="h-3.5 w-3.5" aria-hidden="true" />{result.customer.email ?? "No email on file"}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-[#7890a3]"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />Joined {dateTime(result.customer.created_at)}</p></div>
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[#e4ecf2] pt-4 sm:grid-cols-4">
                        <p className="text-xs text-[#7890a3]">Total orders<strong className="mt-1 block text-lg text-[#09294d]">{result.customer.total_orders}</strong></p>
                        <p className="text-xs text-[#7890a3]">Total spending<strong className="mt-1 block text-lg text-[#09294d]">{Object.entries(result.customer.total_spending_by_currency).map(([currency, amount]) => formatPrice(amount, currency)).join(" · ") || "—"}</strong></p>
                        <p className="text-xs text-[#7890a3]">Average order<strong className="mt-1 block text-lg text-[#09294d]">{Object.entries(result.customer.total_spending_by_currency).map(([currency, amount]) => formatPrice(amount / Math.max(1, result.customer.spending_orders_by_currency[currency] ?? 0), currency)).join(" · ") || "—"}</strong></p>
                        <p className="text-xs text-[#7890a3]">Last order<strong className="mt-1 block text-sm text-[#09294d]">{result.customer.last_order_at ? dateTime(result.customer.last_order_at) : "—"}</strong></p>
                    </div>
                </section>

                <section className="space-y-3">
                    <header><h2 className="flex items-center gap-2 text-base font-semibold text-white"><ShoppingBag className="h-4 w-4 text-[#48b7ff]" aria-hidden="true" />Order history</h2><p className="mt-1 text-xs text-[#91a9c2]">Previous orders and their recorded payment status.</p></header>
                    {result.orders.length ? <ul className="space-y-2">{result.orders.map((order) => (
                        <li key={order.id} className="overflow-hidden rounded-md border border-[#d7e2ec] bg-white">
                            <details>
                                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-[#f7fafc]">
                                    <span className="min-w-0"><span className="block font-semibold text-[#09294d]">{order.order_number}</span><span className="mt-0.5 block text-xs text-[#617991]">Table {order.table_number_snapshot} · {dateTime(order.created_at)}</span></span>
                                    <span className="ml-auto flex items-center gap-3"><span className="rounded border border-[#dce5ee] bg-[#f3f7fa] px-2 py-1 text-xs font-semibold text-[#234861]">{ORDER_STATUS_LABELS[order.status]}</span><strong className="text-sm tabular-nums text-[#09294d]">{formatPrice(order.total, order.currency)}</strong></span>
                                </summary>
                                <div className="grid gap-4 border-t border-[#e4ecf2] bg-[#fbfdfe] p-4 md:grid-cols-[1fr_240px]">
                                    <div className="space-y-2">{order.items.map((item) => <div key={item.id} className="flex justify-between gap-3 text-sm text-[#234861]"><span>{item.quantity} × {item.item_name}{item.special_instructions ? <small className="block text-xs text-[#7890a3]">{item.special_instructions}</small> : null}</span><span className="shrink-0 tabular-nums">{formatPrice(item.line_total, order.currency)}</span></div>)}</div>
                                    <dl className="space-y-1 border-t border-[#e4ecf2] pt-3 text-xs text-[#617991] md:border-l md:border-t-0 md:pl-4 md:pt-0">
                                        <div className="flex justify-between gap-2"><dt>Order ID</dt><dd className="truncate font-mono">{order.order_number}</dd></div>
                                        <div className="flex justify-between gap-2"><dt>Payment</dt><dd className="font-semibold capitalize">{order.payment_status} · Pay at Counter</dd></div>
                                        <div className="flex justify-between gap-2"><dt>Items</dt><dd>{order.items.length}</dd></div>
                                        <div className="flex justify-between gap-2"><dt>Total</dt><dd className="font-bold text-[#09294d]">{formatPrice(order.total, order.currency)}</dd></div>
                                        {order.customer_note ? <div className="border-t border-[#e4ecf2] pt-2"><dt>Instructions</dt><dd className="mt-1 text-[#234861]">{order.customer_note}</dd></div> : null}
                                    </dl>
                                </div>
                            </details>
                        </li>
                    ))}</ul> : <p className="rounded-md border border-[#16466d] bg-[#0b2e50] px-4 py-8 text-center text-sm text-[#b4c6d9]">No order history yet.</p>}
                </section>
            </>}
        </main>
    );
}
