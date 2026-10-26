import { AdminMenuItemsPanel } from "@/components/admin-menu-items-panel";
import {
    getAdminMenuItems,
    getAdminRestaurantSettings,
    getMenuPreparationMinutesLimit,
} from "@/lib/admin-management-data";
import { requireAdminRole } from "@/lib/admin-auth";

export default async function AdminMenuItemsPage() {
    await requireAdminRole("owner", "full_admin");
    const [itemsResult, settingsResult] = await Promise.all([
        getAdminMenuItems("", 0),
        getAdminRestaurantSettings(),
    ]);
    const currency = settingsResult.ok ? settingsResult.data?.currency ?? "BDT" : "BDT";

    return (
        <main className="mx-auto max-w-375 space-y-4 px-3 py-4 sm:px-5 sm:py-5 lg:px-8">
            <header className="border-b border-[#163b5a] pb-4">
                <h1 className="text-xl font-semibold leading-6 text-[#f5f9ff]">Menu Items</h1>
                <p className="mt-1 text-xs text-[#91a9c2]">Manage your restaurant&apos;s menu items.</p>
            </header>
            {!itemsResult.ok ? (
                <div role="alert" className="border-l-4 border-[#b84c4c] bg-[#fff2f2] px-4 py-3 text-sm text-[#7a2929]">{itemsResult.reason === "unauthorized" ? "Administrator access is required." : "Menu items could not be loaded. Check the database setup and retry."}</div>
            ) : (
                <AdminMenuItemsPanel initialResult={itemsResult} currency={currency} maxPreparationMinutes={getMenuPreparationMinutesLimit()} />
            )}
        </main>
    );
}