import Image from "next/image";
import Link from "next/link";
import { Search, Users } from "lucide-react";

import { getAdminCustomers } from "@/lib/admin-customer-data";
import { requireAdminRole } from "@/lib/admin-auth";
import type { CustomerSort } from "@/lib/admin-customer-data";
import { formatPrice } from "@/lib/format-price";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/order-status";

const SORT_OPTIONS: { value: CustomerSort; label: string }[] = [
    { value: "newest", label: "Newest" },
    { value: "oldest", label: "Oldest" },
    { value: "most_orders", label: "Most orders" },
    { value: "highest_spending", label: "Highest spending" },
    { value: "recent_activity", label: "Recent activity" },
];

function date(value: string | null) {
    return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value)) : "—";
}

function spending(values: Record<string, number>) {
    return Object.entries(values)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([currency, amount]) => formatPrice(amount, currency))
        .join(" · ") || "—";
}

function statusSummary(summary: Partial<Record<OrderStatus, number>> | undefined) {
    return ORDER_STATUSES
        .filter((status) => (summary?.[status] ?? 0) > 0)
        .map((status) => `${summary?.[status]} ${ORDER_STATUS_LABELS[status]}`)
        .join(" · ") || "No orders";
}

export default async function AdminCustomersPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}) {
    await requireAdminRole("owner", "full_admin");
    const params = await searchParams;
    const search = typeof params.q === "string" ? params.q.slice(0, 80) : "";
    const sort = SORT_OPTIONS.some((item) => item.value === params.sort) ? params.sort as CustomerSort : "newest";
    const page = Math.max(0, Math.min(4000, Number.parseInt(params.page ?? "0", 10) || 0));
    const result = await getAdminCustomers(search, sort, page * 25);

    return (
        <main className="mx-auto max-w-350 space-y-4 px-3 py-4 sm:px-5 lg:px-8">
            <header className="flex items-center gap-3 border-b border-[#163b5a] pb-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#0b2e50] text-[#48b7ff]"><Users className="h-4 w-4" aria-hidden="true" /></span>
                <div><h1 className="text-xl font-semibold leading-6 text-[#f5f9ff]">Customers</h1><p className="mt-1 text-xs text-[#91a9c2]">Customers who have placed an order.</p></div>
            </header>
            {!result.ok ? (
                <p role="alert" className="rounded-md border border-[#743b47] bg-[#331f35] px-4 py-3 text-sm text-[#ffd9df]">{result.reason === "unauthorized" ? "Administrator access is required." : "Customer data could not be loaded. Please retry."}</p>
            ) : (
                <>
                    <form method="get" className="grid gap-2 rounded-md border border-[#16466d] bg-[#0b2e50] p-3 sm:grid-cols-[minmax(0,1fr)_190px_auto]">
                        <label className="flex h-10 min-w-0 items-center gap-2 rounded border border-[#234b6d] bg-[#092746] px-3 focus-within:border-[#0795f5]">
                            <Search className="h-4 w-4 shrink-0 text-[#91a9c2]" aria-hidden="true" />
                            <input name="q" defaultValue={search} maxLength={80} placeholder="Search name or email" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#7089a0]" />
                        </label>
                        <label className="sr-only" htmlFor="customer-sort">Sort customers</label>
                        <select id="customer-sort" name="sort" defaultValue={sort} className="h-10 rounded border border-[#234b6d] bg-[#092746] px-3 text-sm text-white">
                            {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                        <button className="h-10 rounded bg-[#0795f5] px-5 text-sm font-semibold text-white hover:bg-[#1685d2]">Apply filters</button>
                    </form>
                    {result.customers.length ? (
                        <>
                            <div className="hidden overflow-hidden rounded-md border border-[#d7e2ec] bg-white md:block">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-[#f3f7fa] text-xs uppercase tracking-wide text-[#61768b]"><tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Orders</th><th className="px-4 py-3">Order value</th><th className="px-4 py-3">Last order</th><th className="px-4 py-3">Joined</th></tr></thead>
                                    <tbody className="divide-y divide-[#e4ecf2]">{result.customers.map((customer) => (
                                        <tr key={customer.id} className="text-[#234861] hover:bg-[#f8fbfd]">
                                            <td className="px-4 py-3"><Link href={`/admin/customers/${customer.id}`} className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087bc1]">
                                                {customer.avatar_url ? <Image src={customer.avatar_url} alt="" width={36} height={36} unoptimized className="h-9 w-9 rounded-full object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e8f4fc] text-sm font-bold text-[#0871ad]">{customer.name.slice(0, 1).toUpperCase()}</span>}
                                                <span className="min-w-0"><span className="block font-semibold text-[#09294d]">{customer.name}</span><span className="block truncate text-xs text-[#617991]">{customer.email ?? "No email on file"}</span></span>
                                            </Link></td>
                                            <td className="px-4 py-3 tabular-nums">{customer.total_orders}<span className="mt-1 block text-[10px] text-[#7890a3]">{statusSummary(customer.status_summary)}</span></td><td className="px-4 py-3 font-semibold tabular-nums">{spending(customer.total_spending_by_currency)}</td><td className="px-4 py-3">{date(customer.last_order_at)}</td><td className="px-4 py-3">{date(customer.created_at)}</td>
                                        </tr>
                                    ))}</tbody>
                                </table>
                            </div>
                            <ul className="space-y-2 md:hidden">{result.customers.map((customer) => (
                                <li key={customer.id} className="rounded-md border border-[#d7e2ec] bg-white p-4 text-[#234861]">
                                    <Link href={`/admin/customers/${customer.id}`} className="flex items-center gap-3">
                                        {customer.avatar_url ? <Image src={customer.avatar_url} alt="" width={42} height={42} unoptimized className="h-10 w-10 rounded-full object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e8f4fc] text-sm font-bold text-[#0871ad]">{customer.name.slice(0, 1).toUpperCase()}</span>}
                                        <span className="min-w-0"><span className="block truncate font-semibold text-[#09294d]">{customer.name}</span><span className="block truncate text-xs">{customer.email ?? "No email on file"}</span></span>
                                    </Link>
                                    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#e4ecf2] pt-3 text-xs"><p><span className="block text-[#7890a3]">Orders</span><strong>{customer.total_orders}</strong><small className="mt-1 block text-[#7890a3]">{statusSummary(customer.status_summary)}</small></p><p><span className="block text-[#7890a3]">Total spending</span><strong>{spending(customer.total_spending_by_currency)}</strong></p><p><span className="block text-[#7890a3]">Last order</span><strong>{date(customer.last_order_at)}</strong></p><p><span className="block text-[#7890a3]">Joined</span><strong>{date(customer.created_at)}</strong></p></div>
                                </li>
                            ))}</ul>
                            <nav aria-label="Customer pages" className="flex items-center justify-between text-sm text-[#b4c6d9]">
                                <span>{result.total} customers · showing {page * 25 + 1}–{Math.min((page + 1) * 25, result.total)}</span>
                                <span className="flex gap-2">
                                    <Link aria-disabled={page === 0} className={`rounded border border-[#234b6d] px-3 py-2 ${page === 0 ? "pointer-events-none opacity-40" : "hover:bg-[#0b2e50]"}`} href={`?q=${encodeURIComponent(search)}&sort=${sort}&page=${Math.max(0, page - 1)}`}>Previous</Link>
                                    <Link aria-disabled={(page + 1) * 25 >= result.total} className={`rounded border border-[#234b6d] px-3 py-2 ${(page + 1) * 25 >= result.total ? "pointer-events-none opacity-40" : "hover:bg-[#0b2e50]"}`} href={`?q=${encodeURIComponent(search)}&sort=${sort}&page=${page + 1}`}>Next</Link>
                                </span>
                            </nav>
                        </>
                    ) : <p className="rounded-md border border-[#16466d] bg-[#0b2e50] px-4 py-10 text-center text-sm text-[#b4c6d9]">{search ? "No customers found for that search." : "No customers have placed an order yet."}</p>}
                </>
            )}
        </main>
    );
}
