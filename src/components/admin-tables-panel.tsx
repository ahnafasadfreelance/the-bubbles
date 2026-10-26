"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Pencil, Plus, QrCode } from "lucide-react";

import {
    loadAdminRestaurantTablesAction,
    saveAdminTableAction,
    setAdminTableActiveAction,
} from "@/app/admin/management-actions";
import { AdminConfirmDialog } from "@/components/admin-confirm-dialog";
import type { AdminPageData, AdminRestaurantTableSummary } from "@/lib/admin-management-data";

type TableForm = { id: string | null; tableNumber: string; tableName: string };

export function AdminTablesPanel({ initialResult, selectedTableId }: { initialResult: AdminPageData<AdminRestaurantTableSummary[]>; selectedTableId: string | null }) {
    const [result, setResult] = useState(initialResult);
    const [form, setForm] = useState<TableForm | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [pendingDeactivate, setPendingDeactivate] = useState<AdminRestaurantTableSummary | null>(null);
    const tables = result.ok ? result.data : [];

    async function refresh() {
        try {
            const response = await loadAdminRestaurantTablesAction();
            setResult(response);
            if (!response.ok) setError("Tables could not be refreshed. Try again.");
        } catch {
            setError("Tables could not be refreshed. Check your connection and try again.");
        }
    }

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!form) return;
        setBusy(true);
        setError("");
        try {
            const response = await saveAdminTableAction(form);
            if (!response.ok) {
                setError(response.reason);
                return;
            }
            setMessage(form.id ? "Table updated. Its QR code is unchanged." : "Table created with a permanent QR code.");
            setForm(null);
            await refresh();
        } catch {
            setError("The table could not be saved. Check your connection and try again.");
        } finally {
            setBusy(false);
        }
    }

    async function toggle(table: AdminRestaurantTableSummary) {
        const nextActive = !table.is_active;
        if (!nextActive) {
            setPendingDeactivate(table);
            return;
        }
        await setTableActive(table, nextActive);
    }

    async function setTableActive(table: AdminRestaurantTableSummary, isActive: boolean) {
        setBusy(true);
        setError("");
        try {
            const response = await setAdminTableActiveAction({ id: table.id, isActive });
            if (!response.ok) setError(response.reason);
            else {
                setMessage(isActive ? "Table reactivated; its existing QR code works again." : "Table deactivated. Existing orders are unchanged.");
                await refresh();
            }
        } catch {
            setError("The table status could not be changed. Check your connection and try again.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-2.5">
            <AdminConfirmDialog open={pendingDeactivate !== null} title="Deactivate this table?" description={pendingDeactivate ? `${pendingDeactivate.table_name || `Table ${pendingDeactivate.table_number}`} will stop accepting new dine-in sessions. Existing orders remain viewable.` : ""} confirmLabel="Deactivate table" busy={busy} onCancel={() => setPendingDeactivate(null)} onConfirm={() => { const table = pendingDeactivate; if (table) { setPendingDeactivate(null); void setTableActive(table, false); } }} />
            {message ? <p role="status" className="rounded border border-[#176c5d] bg-[#123e4c] px-3 py-2 text-[9px] text-[#c9f3e7]">{message}</p> : null}
            {error ? <p role="alert" className="rounded border border-[#743b47] bg-[#331f35] px-3 py-2 text-[9px] text-[#ffd9df]">{error}</p> : null}
            <div className="flex justify-end"><button type="button" disabled={busy} onClick={() => { setError(""); setMessage(""); setForm({ id: null, tableNumber: "", tableName: "" }); }} className="inline-flex h-8 items-center gap-1.5 rounded bg-[#0795f5] px-3 text-[9px] font-semibold text-white hover:bg-[#1685d2] disabled:opacity-50"><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add Table</button></div>

            {form ? <form onSubmit={(event) => void save(event)} className="grid gap-4 border border-[#b9d0e1] bg-white p-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end sm:p-5">
                <div className="sm:col-span-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#0879be]">Table details</p><h2 className="mt-1 text-base font-semibold text-[#183a55]">{form.id ? "Edit table" : "Create table"}</h2><p className="mt-1 text-xs text-[#617991]">{form.id ? "Changing the display number or name will not change its QR token." : "A secure random QR token will be generated when saved."}</p></div>
                <label className="text-xs font-bold text-[#234861]">Table number<input required maxLength={64} value={form.tableNumber} onChange={(event) => setForm((current) => current ? { ...current, tableNumber: event.target.value } : current)} className="mt-1.5 h-10 w-full border border-[#cbdbe7] px-3 font-normal outline-none focus:border-[#087bc1] focus:ring-2 focus:ring-[#087bc1]/20" /></label>
                <label className="text-xs font-bold text-[#234861]">Display name (optional)<input maxLength={120} value={form.tableName} onChange={(event) => setForm((current) => current ? { ...current, tableName: event.target.value } : current)} className="mt-1.5 h-10 w-full border border-[#cbdbe7] px-3 font-normal outline-none focus:border-[#087bc1] focus:ring-2 focus:ring-[#087bc1]/20" /></label>
                <button type="button" disabled={busy} onClick={() => setForm(null)} className="min-h-10 border border-[#cbdbe7] px-4 text-xs font-bold text-[#47657a] disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={busy} className="min-h-10 bg-[#0759a8] px-4 text-xs font-bold text-white hover:bg-[#064987] disabled:opacity-50">{busy ? "Saving…" : "Save table"}</button>
            </form> : null}

            {tables.length === 0 && !form ? <div className="rounded border border-dashed border-[#245477] bg-[#092746] px-5 py-10 text-center"><h2 className="text-sm font-semibold text-white">No tables yet</h2><p className="mt-1 text-[9px] text-[#91a9c2]">Create your first table and print its QR sign.</p></div> : null}

            {!form && tables.length ? <>
                <ul className="space-y-2 lg:hidden">
                    {tables.map((table) => <li key={table.id} className={`rounded-lg border bg-white p-3 shadow-sm ${selectedTableId === table.id ? "border-[#0795f5] ring-1 ring-[#0795f5]/20" : "border-[#d7e2ec]"}`}>
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0"><p className="text-sm font-semibold text-[#173650]">{table.table_name || `Table ${table.table_number}`}</p><p className="mt-0.5 text-[11px] text-[#71879a]">Table {table.table_number}</p></div>
                            <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${table.is_active ? "bg-[#e1f7ed] text-[#167553]" : "bg-[#edf1f4] text-[#647789]"}`}>{table.is_active ? "Active" : "Inactive"}</span>
                        </div>
                        <div className="mt-3 flex items-center gap-2 border-t border-[#e4ecf2] pt-3">
                            <Link href={`/admin/tables?selected=${encodeURIComponent(table.id)}`} aria-current={selectedTableId === table.id ? "true" : undefined} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md bg-[#e8f4fc] px-3 text-xs font-semibold text-[#0876c7]"><QrCode className="h-4 w-4" aria-hidden="true" /> Preview QR</Link>
                            <button type="button" aria-label={`Edit table ${table.table_number}`} disabled={busy} onClick={() => { setError(""); setMessage(""); setForm({ id: table.id, tableNumber: table.table_number, tableName: table.table_name ?? "" }); }} className="flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-[#d7e2ec] px-3 text-xs font-semibold text-[#28506c] disabled:opacity-50"><Pencil className="h-4 w-4" aria-hidden="true" /> Edit</button>
                            <button type="button" disabled={busy} onClick={() => void toggle(table)} className="min-h-10 rounded-md border border-[#d7e2ec] px-3 text-xs font-semibold text-[#526a80] disabled:opacity-50">{table.is_active ? "Off" : "On"}</button>
                        </div>
                    </li>)}
                </ul>
                <div className="hidden overflow-hidden rounded-md border border-[#d7e2ec] bg-[#f7faff] shadow-[0_8px_24px_rgba(0,0,0,0.15)] lg:block"><div className="overflow-x-auto"><table className="w-full min-w-[520px] border-collapse text-left text-[9px]">
                <thead className="bg-[#eaf1f8] text-[8px] font-bold uppercase text-[#597087]"><tr>{["Table", "Name", "Status", "QR Code", "Actions"].map((heading) => <th key={heading} scope="col" className="px-2 py-2.5">{heading}</th>)}</tr></thead>
                <tbody className="divide-y divide-[#e2e9f0]">{tables.map((table) => <tr key={table.id} className={selectedTableId === table.id ? "bg-[#e8f4ff]" : "hover:bg-white"}>
                    <td className="px-2 py-2 font-semibold text-[#173650]">{table.table_number}</td>
                    <td className="max-w-24 truncate px-2 py-2 text-[#526a80]">{table.table_name || "—"}</td>
                    <td className="px-2 py-2"><span className={`inline-flex rounded px-1.5 py-0.5 text-[8px] font-semibold ${table.is_active ? "bg-[#d9f5e9] text-[#167553]" : "bg-[#e8edf2] text-[#647789]"}`}>{table.is_active ? "Active" : "Inactive"}</span></td>
                    <td className="px-2 py-2"><Link href={`/admin/tables?selected=${encodeURIComponent(table.id)}`} aria-current={selectedTableId === table.id ? "true" : undefined} className="inline-flex items-center gap-1 text-[8px] font-semibold text-[#0876c7] hover:underline"><QrCode className="h-3 w-3" aria-hidden="true" /> Preview</Link></td>
                    <td className="px-2 py-2"><div className="flex gap-0.5"><button type="button" aria-label={`Edit table ${table.table_number}`} disabled={busy} onClick={() => { setError(""); setMessage(""); setForm({ id: table.id, tableNumber: table.table_number, tableName: table.table_name ?? "" }); }} className="rounded px-1.5 py-1 text-[#0876c7] hover:bg-[#dcefff] disabled:opacity-50"><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></button><button type="button" disabled={busy} onClick={() => void toggle(table)} className="rounded px-1.5 py-1 text-[8px] font-semibold text-[#526a80] hover:bg-[#e8eef4] disabled:opacity-50">{table.is_active ? "Off" : "On"}</button></div></td>
                </tr>)}</tbody>
            </table></div></div>
            </> : null}
        </div>
    );
}