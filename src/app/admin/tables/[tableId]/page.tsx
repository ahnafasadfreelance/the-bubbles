import Link from "next/link";
import { redirect } from "next/navigation";

import { TableQrPreview } from "@/components/table-qr-preview";
import { getAdminRestaurantTable } from "@/lib/admin-management-data";
import { requireAdminRole } from "@/lib/admin-auth";
import { getTableQrUrl } from "@/lib/table-qr";

export default async function AdminTableQrPage({ params }: { params: Promise<{ tableId: string }> }) {
    await requireAdminRole("owner", "full_admin");
    const { tableId } = await params;
    const result = await getAdminRestaurantTable(tableId);
    if (!result.ok && result.reason === "unauthorized") redirect("/");
    if (!result.ok && result.reason === "invalid") {
        return <main className="mx-auto max-w-3xl px-4 py-10 sm:px-7 lg:px-9"><div role="alert" className="border-l-4 border-[#b84c4c] bg-white p-5 text-sm text-[#7a2929]">This table could not be found.</div></main>;
    }

    if (!result.ok) {
        return <main className="mx-auto max-w-3xl px-4 py-10 sm:px-7 lg:px-9"><div role="alert" className="border-l-4 border-[#b84c4c] bg-white p-5 text-sm text-[#7a2929]">The QR preview could not be loaded. Check the database and try again.</div></main>;
    }

    try {
        getTableQrUrl(result.data.qr_token);
    } catch {
        return (
            <main className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-7 lg:px-9">
                <Link href="/admin/tables" className="text-xs font-bold text-[#0759a8] underline underline-offset-2">Back to tables</Link>
                <p role="alert" className="border-l-4 border-[#d6a545] bg-white p-5 text-sm text-[#72551d]">Set the server environment variable <code>NEXT_PUBLIC_APP_URL</code> to this site&apos;s public origin to generate printable QR codes.</p>
            </main>
        );
    }

    const table = result.data;
    return (
        <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-7 sm:py-8 lg:px-9">
            <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#d9e5ef] pb-5">
                <div><Link href="/admin/tables" className="text-xs font-bold text-[#0759a8] underline underline-offset-2">Back to tables</Link><p className="mt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#0879be]">Permanent dine-in QR</p><h1 className="display-heading mt-1 text-3xl font-bold">{table.table_name || `Table ${table.table_number}`}</h1></div>
                <span className={`border px-2.5 py-1 text-[11px] font-bold ${table.is_active ? "border-[#b7dfd4] bg-[#eaf8f3] text-[#236c58]" : "border-[#d4dce2] bg-[#f3f5f6] text-[#5e6b74]"}`}>{table.is_active ? "Active" : "Inactive"}</span>
            </header>
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:justify-center sm:gap-8">
                <TableQrPreview table={table} />
                <aside className="max-w-sm border-l-4 border-[#14a6d1] bg-white p-4 text-sm leading-6 text-[#47657a]">
                    <h2 className="font-bold text-[#09294d]">QR code stays the same</h2>
                    <p className="mt-1">Changing the table number or display name does not invalidate this printed code. Deactivating this table stops the QR route from opening new dine-in sessions; existing orders remain available to their customers.</p>
                </aside>
            </div>
        </main>
    );
}
