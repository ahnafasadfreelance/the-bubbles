import { AdminCategoriesPanel } from "@/components/admin-categories-panel";
import { getAdminCategories } from "@/lib/admin-management-data";
import { requireAdminRole } from "@/lib/admin-auth";

export default async function AdminCategoriesPage() {
    await requireAdminRole("owner", "full_admin");
    const result = await getAdminCategories();

    return (
        <main className="mx-auto max-w-325 space-y-4 px-3 py-4 sm:px-5 sm:py-5 lg:px-8">
            <header className="border-b border-[#163b5a] pb-4">
                <h1 className="text-xl font-semibold leading-6 text-[#f5f9ff]">Categories</h1>
                <p className="mt-1 text-xs text-[#91a9c2]">Organize your menu with categories.</p>
            </header>
            {!result.ok ? (
                <div role="alert" className="border-l-4 border-[#b84c4c] bg-[#fff2f2] px-4 py-3 text-sm text-[#7a2929]">{result.reason === "unauthorized" ? "Administrator access is required." : "Categories could not be loaded. Check the database setup and retry."}</div>
            ) : <AdminCategoriesPanel initialResult={result} />}
        </main>
    );
}