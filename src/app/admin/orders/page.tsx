import { AdminDashboardPanel } from "@/components/admin-dashboard-panel";
import { getAdminAccess } from "@/lib/admin-auth";
import { getAdminDashboard, getOrderManagementDashboard, getPreparationEstimateRange } from "@/lib/admin-data";

export default async function AdminOrdersPage() {
    const access = await getAdminAccess();
    if (access.kind !== "authorized") return <main className="p-6 text-white" role="alert">Your staff access could not be verified.</main>;
    const [result, estimateRange] = await Promise.all([
        access.role === "order_management"
            ? getOrderManagementDashboard({ status: "all", search: "", offset: 0, limit: 20 })
            : getAdminDashboard({ status: "all", search: "", offset: 0, limit: 20 }),
        getPreparationEstimateRange(),
    ]);

    return (
        <main className="mx-auto max-w-375 space-y-4 px-3 py-4 sm:px-5 sm:py-5 lg:px-8">
            <header className="border-b border-[#163b5a] pb-4">
                <h1 className="text-xl font-semibold leading-6 text-[#f5f9ff]">Orders</h1>
                <p className="mt-1 text-xs text-[#91a9c2]">Manage incoming orders and update their status.</p>
            </header>
            <AdminDashboardPanel initialResult={result} initialStatus="all" variant="orders" estimateRange={estimateRange} role={access.role} />
        </main>
    );
}