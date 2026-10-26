import { AdminTablesPanel } from "@/components/admin-tables-panel";
import { TableQrPreview } from "@/components/table-qr-preview";
import { getAdminRestaurantTable, getAdminRestaurantTables } from "@/lib/admin-management-data";
import { getTableQrUrl } from "@/lib/table-qr";
import { requireAdminRole } from "@/lib/admin-auth";

export default async function AdminTablesPage({ searchParams }: { searchParams: Promise<{ selected?: string }> }) {
    await requireAdminRole("owner", "full_admin");
    const result = await getAdminRestaurantTables();
    const params = await searchParams;
    const tables = result.ok ? result.data : [];
    const selectedId = typeof params.selected === "string" ? params.selected : tables[0]?.id;
    const selectedResult = selectedId ? await getAdminRestaurantTable(selectedId) : null;
    const selectedTable = selectedResult?.ok ? selectedResult.data : null;
    let qrConfigured = false;
    if (selectedTable) {
        try {
            getTableQrUrl(selectedTable.qr_token);
            qrConfigured = true;
        } catch {
            qrConfigured = false;
        }
    }

    return (
        <main className="mx-auto max-w-350 space-y-4 px-3 py-4 sm:px-5 sm:py-5 lg:px-8">
            <header className="pb-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#48b7ff]">Dine-in service</p>
                <h1 className="mt-1 text-xl font-semibold leading-6 text-[#f5f9ff]">Tables &amp; QR Codes</h1>
                <p className="mt-1 text-xs text-[#91a9c2]">Manage tables and generate permanent QR codes.</p>
            </header>
            {!result.ok ? (
                <div role="alert" className="rounded border border-[#743b47] bg-[#331f35] px-3 py-2 text-[10px] text-[#ffd9df]">{result.reason === "unauthorized" ? "Administrator access is required." : "Tables could not be loaded. Check the database setup and retry."}</div>
            ) : <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(270px,0.8fr)]">
                <AdminTablesPanel initialResult={result} selectedTableId={selectedTable?.id ?? null} />
                {selectedTable ? qrConfigured ? <TableQrPreview table={selectedTable} heading="QR Code Preview" /> : <aside className="rounded-md border border-[#16466d] bg-[#0b2e50] p-4 text-[10px] leading-5 text-[#ffdfa7]">Set <code>NEXT_PUBLIC_APP_URL</code> to this site&apos;s public origin to generate the QR URL.</aside> : <aside className="rounded-md border border-[#16466d] bg-[#0b2e50] p-4 text-[10px] text-[#91a9c2]">Select a table to preview its QR code.</aside>}
            </div>}
        </main>
    );
}
