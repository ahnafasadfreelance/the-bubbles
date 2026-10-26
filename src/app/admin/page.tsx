import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminDashboardClock } from "@/components/admin-dashboard-clock";
import { AdminDashboardPanel } from "@/components/admin-dashboard-panel";
import { getAdminCustomerCount } from "@/lib/admin-customer-data";
import { getAdminDashboard, getAdminOrderBuckets } from "@/lib/admin-data";
import { getAdminAccess } from "@/lib/admin-auth";

export const metadata: Metadata = { title: "Admin Dashboard" };

export default async function AdminPage() {
    const access = await getAdminAccess();
    if (access.kind === "authorized" && access.role === "order_management") redirect("/admin/orders");
    if (access.kind !== "authorized") redirect("/");
    const [result, buckets, customerCount] = await Promise.all([
        getAdminDashboard({ status: "all", search: "", offset: 0 }),
        getAdminOrderBuckets(),
        getAdminCustomerCount(),
    ]);

    return (
        <main className="mx-auto max-w-375 space-y-4 px-3 py-4 sm:px-5 sm:py-5 lg:px-8">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#163b5a] pb-4">
                <div>
                    <h1 className="text-xl font-semibold leading-6 text-[#f5f9ff]">Dashboard</h1>
                    <p className="mt-1 text-xs text-[#91a9c2]">Welcome back! Here&apos;s what&apos;s happening at your restaurant today.</p>
                </div>
                <AdminDashboardClock />
            </header>
            <AdminDashboardPanel initialResult={result} variant="overview" buckets={buckets} customerCount={customerCount} />
        </main>
    );
}