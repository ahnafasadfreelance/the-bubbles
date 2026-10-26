import { AdminSettingsPanel } from "@/components/admin-settings-panel";
import { getPreparationEstimateRange } from "@/lib/admin-data";
import { getAdminRestaurantSettings } from "@/lib/admin-management-data";
import { requireAdminRole } from "@/lib/admin-auth";

export default async function AdminSettingsPage() {
    await requireAdminRole("owner", "full_admin");
    const [result, estimateRange] = await Promise.all([
        getAdminRestaurantSettings(),
        getPreparationEstimateRange(),
    ]);

    return (
        <main className="mx-auto max-w-300 space-y-4 px-3 py-4 sm:px-5 sm:py-5 lg:px-8">
            <header className="border-b border-[#163b5a] pb-4">
                <h1 className="text-xl font-semibold leading-6 text-[#f5f9ff]">Restaurant Settings</h1>
                <p className="mt-1 text-xs text-[#91a9c2]">Update your restaurant information and branding.</p>
            </header>
            {!result.ok ? (
                <div role="alert" className="border-l-4 border-[#b84c4c] bg-[#fff2f2] px-4 py-3 text-sm text-[#7a2929]">{result.reason === "unauthorized" ? "Administrator access is required." : "Restaurant settings could not be loaded. Check the database setup and retry."}</div>
            ) : <AdminSettingsPanel initialResult={result} estimateRange={estimateRange} />}
        </main>
    );
}