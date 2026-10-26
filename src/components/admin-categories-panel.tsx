"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { Check, Pencil, Plus } from "lucide-react";

import {
    deleteAdminCategoryAction,
    loadAdminCategoriesAction,
    saveAdminCategoryAction,
    setAdminCategoryActiveAction,
} from "@/app/admin/management-actions";
import { AdminImageUpload } from "@/components/admin-image-upload";
import { AdminConfirmDialog } from "@/components/admin-confirm-dialog";
import type { AdminMenuCategory, AdminPageData } from "@/lib/admin-management-data";

type CategoryFormValue = {
    id: string | null;
    name: string;
    slug: string;
    description: string;
    imageUrl: string | null;
    displayOrder: string;
    isActive: boolean;
};

function categorySlug(value: string) {
    return value.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function blankCategory(): CategoryFormValue {
    return { id: null, name: "", slug: "", description: "", imageUrl: null, displayOrder: "0", isActive: true };
}

function categoryToForm(category: AdminMenuCategory): CategoryFormValue {
    return {
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description ?? "",
        imageUrl: category.image_url,
        displayOrder: String(category.display_order),
        isActive: category.is_active,
    };
}

function CategoryForm({
    initial,
    busy,
    onCancel,
    onSave,
}: {
    initial: CategoryFormValue;
    busy: boolean;
    onCancel: () => void;
    onSave: (value: CategoryFormValue) => void;
}) {
    const [form, setForm] = useState(initial);
    const [slugEdited, setSlugEdited] = useState(Boolean(initial.id));

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        onSave(form);
    }

    return (
        <form onSubmit={submit} className="space-y-5 border border-[#b9d0e1] bg-white p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3 border-b border-[#e1eaf1] pb-4">
                <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#0879be]">Menu category</p><h2 className="mt-1 text-base font-semibold text-[#183a55]">{form.id ? "Edit category" : "Create category"}</h2></div>
                <button type="button" onClick={onCancel} disabled={busy} className="min-h-9 px-3 text-xs font-bold text-[#617991] hover:bg-[#f4f8fb]">Cancel</button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-bold text-[#234861]">Name
                    <input required maxLength={120} value={form.name} onChange={(event) => {
                        const name = event.target.value;
                        setForm((current) => ({ ...current, name, ...(!slugEdited ? { slug: categorySlug(name) } : {}) }));
                    }} className="mt-1.5 h-10 w-full border border-[#cbdbe7] px-3 font-normal outline-none focus:border-[#087bc1] focus:ring-2 focus:ring-[#087bc1]/20" />
                </label>
                <label className="text-xs font-bold text-[#234861]">Slug
                    <input required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} value={form.slug} onChange={(event) => { setSlugEdited(true); setForm((current) => ({ ...current, slug: event.target.value })); }} className="mt-1.5 h-10 w-full border border-[#cbdbe7] px-3 font-mono text-xs font-normal outline-none focus:border-[#087bc1] focus:ring-2 focus:ring-[#087bc1]/20" />
                </label>
                <label className="text-xs font-bold text-[#234861]">Display order
                    <input required type="number" min={0} max={100000} step={1} value={form.displayOrder} onChange={(event) => setForm((current) => ({ ...current, displayOrder: event.target.value }))} className="mt-1.5 h-10 w-full border border-[#cbdbe7] px-3 font-normal outline-none focus:border-[#087bc1] focus:ring-2 focus:ring-[#087bc1]/20" />
                </label>
                <label className="flex min-h-10 items-center gap-2 self-end text-xs font-semibold text-[#37566f]"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} className="h-4 w-4 accent-[#087bc1]" /> Active on the public menu</label>
            </div>
            <label className="block text-xs font-bold text-[#234861]">Description
                <textarea rows={3} maxLength={1000} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="mt-1.5 w-full resize-y border border-[#cbdbe7] px-3 py-2 font-normal leading-5 outline-none focus:border-[#087bc1] focus:ring-2 focus:ring-[#087bc1]/20" />
            </label>
            <AdminImageUpload label="Category image" role="category" value={form.imageUrl} persistedValue={initial.imageUrl} onChange={(imageUrl) => setForm((current) => ({ ...current, imageUrl }))} />
            <section aria-label="Public category preview" className="max-w-sm border border-[#d8e3ed] bg-white">
                <p className="border-b border-[#e1eaf1] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#617991]">Category preview</p>
                <div className="relative aspect-[1.8] overflow-hidden bg-[#edf4f8]">
                    {form.imageUrl ? <Image src={form.imageUrl} alt="" fill unoptimized className="object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-[#71879a]">No image selected</div>}
                    <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-[#041d37]/90 to-transparent px-4 pb-3 pt-9 text-white"><p className="text-sm font-semibold">{form.name || "Category name"}</p><p className="mt-1 line-clamp-2 text-xs text-white/80">{form.description || "Category description"}</p></div>
                </div>
            </section>
            <div className="flex justify-end gap-2 border-t border-[#e1eaf1] pt-4">
                <button type="button" onClick={onCancel} disabled={busy} className="min-h-10 border border-[#cbdbe7] px-4 text-xs font-bold text-[#47657a]">Cancel</button>
                <button type="submit" disabled={busy} className="inline-flex min-h-10 items-center gap-2 bg-[#0759a8] px-4 text-xs font-bold text-white hover:bg-[#064987] disabled:opacity-50">{busy ? "Saving…" : <><Check className="h-4 w-4" aria-hidden="true" /> Save category</>}</button>
            </div>
        </form>
    );
}

export function AdminCategoriesPanel({ initialResult }: { initialResult: AdminPageData<AdminMenuCategory[]> }) {
    const [result, setResult] = useState(initialResult);
    const [form, setForm] = useState<CategoryFormValue | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [pendingAction, setPendingAction] = useState<{ kind: "deactivate" | "delete"; category: AdminMenuCategory } | null>(null);
    const categories = result.ok ? result.data : [];

    async function refresh() {
        try {
            const response = await loadAdminCategoriesAction();
            setResult(response);
            if (!response.ok) setError("Categories could not be refreshed. Try again.");
        } catch {
            setError("Categories could not be refreshed. Check your connection and try again.");
        }
    }

    async function save(value: CategoryFormValue) {
        setBusy(true);
        setMessage("");
        setError("");
        try {
            const response = await saveAdminCategoryAction({ ...value, displayOrder: Number(value.displayOrder) });
            if (!response.ok) {
                setError(response.reason);
                return;
            }
            setForm(null);
            setMessage(value.id ? "Category updated." : "Category created.");
            await refresh();
        } catch {
            setError("The category could not be saved. Check your connection and try again.");
        } finally {
            setBusy(false);
        }
    }

    async function toggle(category: AdminMenuCategory) {
        if (category.is_active) {
            setPendingAction({ kind: "deactivate", category });
            return;
        }
        await setCategoryActive(category, true);
    }

    async function setCategoryActive(category: AdminMenuCategory, isActive: boolean) {
        setBusy(true);
        try {
            const response = await setAdminCategoryActiveAction({ id: category.id, isActive });
            if (!response.ok) setError(response.reason);
            else {
                setMessage(isActive ? "Category activated on the public menu." : "Category deactivated; its dishes are no longer orderable.");
                await refresh();
            }
        } catch {
            setError("The category status could not be changed. Check your connection and try again.");
        } finally {
            setBusy(false);
        }
    }

    async function remove(category: AdminMenuCategory) {
        setPendingAction({ kind: "delete", category });
    }

    async function deleteCategory(category: AdminMenuCategory) {
        setBusy(true);
        try {
            const response = await deleteAdminCategoryAction(category.id);
            if (!response.ok) setError(response.reason);
            else {
                setMessage("Category deleted.");
                await refresh();
            }
        } catch {
            setError("The category could not be deleted. Check your connection and try again.");
        } finally {
            setBusy(false);
        }
    }

    function confirmPendingAction() {
        const action = pendingAction;
        setPendingAction(null);
        if (!action) return;
        if (action.kind === "deactivate") void setCategoryActive(action.category, false);
        else void deleteCategory(action.category);
    }

    return (
        <div className="space-y-5">
            <AdminConfirmDialog
                open={pendingAction !== null}
                title={pendingAction?.kind === "delete" ? "Delete this category?" : "Deactivate this category?"}
                description={pendingAction?.kind === "delete"
                    ? `Delete the empty category "${pendingAction.category.name}"? Categories with dishes cannot be deleted.`
                    : pendingAction ? `${pendingAction.category.name} and its dishes will no longer be available to order until reactivated.` : ""}
                confirmLabel={pendingAction?.kind === "delete" ? "Delete category" : "Deactivate category"}
                busy={busy}
                onCancel={() => setPendingAction(null)}
                onConfirm={confirmPendingAction}
            />
            {message ? <p role="status" className="rounded border border-[#176c5d] bg-[#123e4c] px-3 py-2 text-[10px] text-[#c9f3e7]">{message}</p> : null}
            {error ? <p role="alert" className="rounded border border-[#743b47] bg-[#331f35] px-3 py-2 text-[10px] text-[#ffd9df]">{error}</p> : null}
            <div className="flex justify-end"><button type="button" disabled={busy} onClick={() => { setError(""); setMessage(""); setForm(blankCategory()); }} className="inline-flex h-8 items-center gap-1.5 rounded bg-[#0795f5] px-3 text-[9px] font-semibold text-white hover:bg-[#1685d2] disabled:opacity-50"><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add Category</button></div>
            {form ? <CategoryForm key={form.id ?? "new"} initial={form} busy={busy} onCancel={() => setForm(null)} onSave={(value) => void save(value)} /> : null}
            {categories.length === 0 && !form ? <div className="rounded border border-dashed border-[#245477] bg-[#092746] px-5 py-10 text-center"><h2 className="text-sm font-semibold text-white">No categories yet</h2><p className="mt-1 text-[10px] text-[#91a9c2]">Create a category to organize menu items.</p></div> : null}
            {!form && categories.length ? <>
                <ul className="space-y-2 lg:hidden">
                    {categories.map((category) => <li key={category.id} className="flex items-center gap-3 rounded-lg border border-[#d7e2ec] bg-white p-3 shadow-sm">
                        {category.image_url ? <Image src={category.image_url} alt="" width={48} height={48} unoptimized className="h-12 w-12 shrink-0 rounded-md object-cover" /> : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[#eaf1f8] text-[9px] text-[#71879a]">No image</span>}
                        <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="truncate text-sm font-semibold text-[#173650]">{category.name}</h2><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${category.is_active ? "bg-[#e1f7ed] text-[#167553]" : "bg-[#edf1f4] text-[#647789]"}`}>{category.is_active ? "Active" : "Inactive"}</span></div><p className="mt-0.5 truncate text-[11px] text-[#71879a]">{category.description || category.slug}</p></div>
                        <div className="flex shrink-0 items-center gap-1">
                            <button type="button" aria-label={`${category.is_active ? "Deactivate" : "Activate"} ${category.name}`} aria-checked={category.is_active} role="switch" disabled={busy} onClick={() => void toggle(category)} className={`relative h-5 w-9 rounded-full transition-colors ${category.is_active ? "bg-[#078cf0]" : "bg-[#b7c4d0]"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${category.is_active ? "translate-x-4.5" : "translate-x-0.5"}`} /></button>
                            <button type="button" aria-label={`Edit ${category.name}`} disabled={busy} onClick={() => { setError(""); setMessage(""); setForm(categoryToForm(category)); }} className="rounded-md border border-[#d7e2ec] p-2 text-[#0876c7]"><Pencil className="h-4 w-4" aria-hidden="true" /></button>
                            <button type="button" aria-label={`Delete ${category.name}`} disabled={busy} onClick={() => void remove(category)} className="rounded-md border border-[#d7e2ec] px-2 py-2 text-[10px] font-semibold text-[#526a80]">Delete</button>
                        </div>
                    </li>)}
                </ul>
                <div className="hidden overflow-hidden rounded-md border border-[#d7e2ec] bg-[#f7faff] shadow-[0_8px_24px_rgba(0,0,0,0.15)] lg:block"><div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left text-[9px]">
                <thead className="bg-[#eaf1f8] text-[8px] font-bold uppercase text-[#597087]"><tr>{["Image", "Name", "Slug", "Description", "Order", "Status", "Actions"].map((heading) => <th key={heading} scope="col" className="px-2.5 py-2.5">{heading}</th>)}</tr></thead>
                <tbody className="divide-y divide-[#e2e9f0]">{categories.map((category) => <tr key={category.id} className="hover:bg-white">
                    <td className="w-12 px-2.5 py-1.5">{category.image_url ? <Image src={category.image_url} alt="" width={36} height={36} unoptimized className="h-8 w-8 rounded-sm object-cover" /> : <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-[#e4ebf2] text-[7px] text-[#71879a]">No image</span>}</td>
                    <td className="whitespace-nowrap px-2.5 py-1.5 font-semibold text-[#173650]">{category.name}</td>
                    <td className="px-2.5 py-1.5 font-mono text-[8px] text-[#526a80]">{category.slug}</td>
                    <td className="max-w-48 truncate px-2.5 py-1.5 text-[#6d8194]">{category.description || "—"}</td>
                    <td className="px-2.5 py-1.5 tabular-nums text-[#526a80]">{category.display_order}</td>
                    <td className="px-2.5 py-1.5"><span className={`inline-flex rounded px-1.5 py-0.5 text-[8px] font-semibold ${category.is_active ? "bg-[#d9f5e9] text-[#167553]" : "bg-[#e8edf2] text-[#647789]"}`}>{category.is_active ? "Active" : "Inactive"}</span></td>
                    <td className="px-2.5 py-1.5"><div className="flex items-center gap-1.5"><button type="button" role="switch" aria-label={`${category.is_active ? "Deactivate" : "Activate"} ${category.name}`} aria-checked={category.is_active} disabled={busy} onClick={() => void toggle(category)} className={`relative h-4 w-7 rounded-full transition-colors ${category.is_active ? "bg-[#0795f5]" : "bg-[#b7c4d0]"}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${category.is_active ? "translate-x-3.5" : "translate-x-0.5"}`} /></button><button type="button" aria-label={`Edit ${category.name}`} disabled={busy} onClick={() => { setError(""); setMessage(""); setForm(categoryToForm(category)); }} className="rounded px-1.5 py-1 text-[#0876c7] hover:bg-[#dcefff] disabled:opacity-50"><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></button><button type="button" disabled={busy} onClick={() => void remove(category)} className="rounded px-1.5 py-1 text-[8px] font-semibold text-[#526a80] hover:bg-[#e8eef4] disabled:opacity-50">Delete</button></div></td>
                </tr>)}</tbody>
            </table></div></div>
            </> : null}
        </div>
    );
}