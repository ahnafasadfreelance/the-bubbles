import type { Metadata } from "next";

import { AdminTableVisitsPanel } from "@/components/admin-table-visits-panel";
import { getAdminTableVisits } from "@/lib/table-visit-admin";
import { getAdminAccess } from "@/lib/admin-auth";

export const metadata: Metadata = { title: "Table Visits & Support" };

export default async function AdminTableVisitsPage() {
    const [result, access] = await Promise.all([getAdminTableVisits(), getAdminAccess()]);
    return (
        <main className="mx-auto max-w-375 space-y-4 px-3 py-4 sm:px-5 sm:py-5 lg:px-8">
            <header className="border-b border-[#163b5a] pb-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#48b7ff]">Dine-in service</p>
                <h1 className="mt-1 text-xl font-semibold leading-6 text-[#f5f9ff]">Table Visits &amp; Support</h1>
                <p className="mt-1 text-xs text-[#91a9c2]">Monitor customer requests, reply to table messages, and close visits when tables are clear.</p>
            </header>
            <AdminTableVisitsPanel initialResult={result} canCloseVisit={access.kind === "authorized"} />
        </main>
    );
}
