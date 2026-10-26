"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, type FormEvent } from "react";
import { Check, ChevronLeft, ChevronRight, Pencil, Plus, Search } from "lucide-react";

import {
    loadAdminMenuItemsAction,
    saveAdminMenuItemAction,
    setAdminMenuItemAvailabilityAction,
    setAdminMenuItemFeaturedAction,
} from "@/app/admin/management-actions";
import { AdminImageUpload } from "@/components/admin-image-upload";
import { AdminConfirmDialog } from "@/components/admin-confirm-dialog";
import { formatPrice } from "@/lib/format-price";
import type { AdminMenuCategory, AdminMenuItem, AdminMenuItemFilter, AdminPageData } from "@/lib/admin-management-data";

const PAGE_SIZE = 30;

type ItemFormValue = {
    id: string | null;
    name: string;
    slug: string;
    categoryId: string;
    description: string;
    imageUrl: string | null;
    price: string;
    discountPrice: string;
    preparationTime: string;
    displayOrder: string;
    isAvailable: boolean;
    isFeatured: boolean;
};

function emptyForm(categoryId = ""): ItemFormValue {
    return {
        id: null,
        name: "",
        slug: "",
        categoryId,
        description: "",
        imageUrl: null,
        price: "",
        discountPrice: "",
        preparationTime: "0",
        displayOrder: "0",
        isAvailable: true,
        isFeatured: false,
    };
}

function editForm(item: AdminMenuItem): ItemFormValue {
    return {
        id: item.id,
        name: item.name,
        slug: item.slug,
        categoryId: item.category_id,
        description: item.description ?? "",
        imageUrl: item.image_url,
        price: String(item.price),
        discountPrice: item.discount_price === null ? "" : String(item.discount_price),
        preparationTime: String(item.preparation_time_minutes),
        displayOrder: String(item.display_order),
        isAvailable: item.is_available,
        isFeatured: item.is_featured,
    };
}

function slugFromName(value: string) {
    return value.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function MenuItemForm({
    initial,
    categories,
    currency,
    maxPreparationMinutes,
    busy,
    onCancel,
    onSave,
}: {
    initial: ItemFormValue;
    categories: Pick<AdminMenuCategory, "id" | "name" | "is_active">[];
    currency: string;
    maxPreparationMinutes: number;
    busy: boolean;
    onCancel: () => void;
    onSave: (value: ItemFormValue) => void;
}) {
    const [form, setForm] = useState(initial);
    const [slugEdited, setSlugEdited] = useState(Boolean(initial.id));

    function update<K extends keyof ItemFormValue>(key: K, value: ItemFormValue[K]) {
        setForm((current) => ({ ...current, [key]: value }));
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        onSave(form);
    }

    return (
        <form onSubmit={submit} className="space-y-5 border border-[#b9d0e1] bg-white p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e1eaf1] pb-4">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#0879be]">Menu item</p>
                    <h2 className="mt-1 text-base font-semibold text-[#183a55]">{form.id ? "Edit dish" : "Create dish"}</h2>
                </div>
                <button type="button" onClick={onCancel} disabled={busy} className="min-h-9 px-3 text-xs font-bold text-[#617991] hover:bg-[#f4f8fb]">Cancel</button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-bold text-[#234861]">Name
                    <input required maxLength={200} value={form.name} onChange={(event) => {
                        const name = event.target.value;
                        setForm((current) => ({ ...current, name, ...(!slugEdited ? { slug: slugFromName(name) } : {}) }));
                    }} className="mt-1.5 h-10 w-full border border-[#cbdbe7] px-3 font-normal outline-none focus:border-[#087bc1] focus:ring-2 focus:ring-[#087bc1]/20" />
                </label>
                <label className="text-xs font-bold text-[#234861]">Slug
                    <input required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} value={form.slug} onChange={(event) => { setSlugEdited(true); update("slug", event.target.value); }} className="mt-1.5 h-10 w-full border border-[#cbdbe7] px-3 font-mono text-xs font-normal outline-none focus:border-[#087bc1] focus:ring-2 focus:ring-[#087bc1]/20" />
                </label>
                <label className="text-xs font-bold text-[#234861]">Category
                    <select required value={form.categoryId} onChange={(event) => update("categoryId", event.target.value)} className="mt-1.5 h-10 w-full border border-[#cbdbe7] bg-white px-3 font-normal outline-none focus:border-[#087bc1] focus:ring-2 focus:ring-[#087bc1]/20">
                        <option value="">Choose a category</option>
                        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.is_active ? "" : " (inactive)"}</option>)}
                    </select>
                </label>
                <label className="text-xs font-bold text-[#234861]">Display order
                    <input required type="number" min={0} max={100000} step={1} value={form.displayOrder} onChange={(event) => update("displayOrder", event.target.value)} className="mt-1.5 h-10 w-full border border-[#cbdbe7] px-3 font-normal outline-none focus:border-[#087bc1] focus:ring-2 focus:ring-[#087bc1]/20" />
                </label>
                <label className="text-xs font-bold text-[#234861]">Regular price ({currency})
                    <input required type="number" min={0} max={99999999.99} step="0.01" value={form.price} onChange={(event) => update("price", event.target.value)} className="mt-1.5 h-10 w-full border border-[#cbdbe7] px-3 font-normal tabular-nums outline-none focus:border-[#087bc1] focus:ring-2 focus:ring-[#087bc1]/20" />
                </label>
                <label className="text-xs font-bold text-[#234861]">Discount price ({currency})
                    <input type="number" min={0} max={99999999.99} step="0.01" value={form.discountPrice} onChange={(event) => update("discountPrice", event.target.value)} className="mt-1.5 h-10 w-full border border-[#cbdbe7] px-3 font-normal tabular-nums outline-none focus:border-[#087bc1] focus:ring-2 focus:ring-[#087bc1]/20" />
                    <span className="mt-1 block font-normal text-[#71879a]">Optional; must be lower than the regular price.</span>
                </label>
                <label className="text-xs font-bold text-[#234861]">Preparation time (minutes)
                    <input required type="number" min={0} max={maxPreparationMinutes} step={1} value={form.preparationTime} onChange={(event) => update("preparationTime", event.target.value)} className="mt-1.5 h-10 w-full border border-[#cbdbe7] px-3 font-normal outline-none focus:border-[#087bc1] focus:ring-2 focus:ring-[#087bc1]/20" />
                    <span className="mt-1 block font-normal text-[#71879a]">Maximum {maxPreparationMinutes} minutes.</span>
                </label>
                <label className="flex min-h-10 items-center gap-2 self-end text-xs font-semibold text-[#37566f]"><input type="checkbox" checked={form.isAvailable} onChange={(event) => update("isAvailable", event.target.checked)} className="h-4 w-4 accent-[#087bc1]" /> Available to order</label>
                <label className="flex min-h-10 items-center gap-2 self-end text-xs font-semibold text-[#37566f]"><input type="checkbox" checked={form.isFeatured} onChange={(event) => update("isFeatured", event.target.checked)} className="h-4 w-4 accent-[#087bc1]" /> Feature on homepage</label>
            </div>

            <label className="block text-xs font-bold text-[#234861]">Description
                <textarea maxLength={2000} rows={3} value={form.description} onChange={(event) => update("description", event.target.value)} className="mt-1.5 w-full resize-y border border-[#cbdbe7] px-3 py-2 font-normal leading-5 outline-none focus:border-[#087bc1] focus:ring-2 focus:ring-[#087bc1]/20" />
            </label>
            <AdminImageUpload label="Dish image" role="dish" value={form.imageUrl} persistedValue={initial.imageUrl} onChange={(imageUrl) => update("imageUrl", imageUrl)} />

            <section aria-label="Public menu preview" className="max-w-md border border-[#d8e3ed] bg-[#fbfdfe]">
                <p className="border-b border-[#e1eaf1] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#617991]">Dish preview</p>
                <div className="grid grid-cols-[112px_1fr] gap-3 p-3">
                    {form.imageUrl ? <Image src={form.imageUrl} alt="" width={112} height={112} unoptimized className="aspect-square w-28 object-cover" /> : <div className="flex aspect-square w-28 items-center justify-center bg-[#eaf2f7] text-[10px] text-[#71879a]">No image</div>}
                    <div className="min-w-0 py-1">
                        <p className="truncate text-[10px] font-bold uppercase text-[#0879be]">{categories.find((category) => category.id === form.categoryId)?.name ?? "Category"}</p>
                        <h3 className="mt-1 truncate text-sm font-semibold text-[#173650]">{form.name || "Dish name"}</h3>
                        <p className="mt-1 line-clamp-3 text-xs leading-5 text-[#617991]">{form.description || "Dish description"}</p>
                        <p className="mt-2 text-sm font-bold text-[#0759a8]">{form.discountPrice && Number(form.discountPrice) < Number(form.price) ? <><del className="mr-2 text-xs font-medium text-[#8093a4]">{formatPrice(Number(form.price) || 0, currency)}</del>{formatPrice(Number(form.discountPrice), currency)}</> : formatPrice(Number(form.price) || 0, currency)}</p>
                    </div>
                </div>
            </section>

            <div className="flex flex-wrap justify-end gap-2 border-t border-[#e1eaf1] pt-4">
                <button type="button" onClick={onCancel} disabled={busy} className="min-h-10 border border-[#cbdbe7] px-4 text-xs font-bold text-[#47657a] disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={busy || categories.length === 0} className="inline-flex min-h-10 items-center gap-2 bg-[#0759a8] px-4 text-xs font-bold text-white hover:bg-[#064987] disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Saving…" : <><Check className="h-4 w-4" aria-hidden="true" /> Save dish</>}</button>
            </div>
        </form>
    );
}

export function AdminMenuItemsPanel({
    initialResult,
    currency,
    maxPreparationMinutes,
}: {
    initialResult: AdminPageData<{ items: AdminMenuItem[]; categories: Pick<AdminMenuCategory, "id" | "name" | "is_active">[]; total: number; counts: Record<AdminMenuItemFilter, number> }>;
    currency: string;
    maxPreparationMinutes: number;
}) {
    const [result, setResult] = useState(initialResult);
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<AdminMenuItemFilter>("all");
    const [offset, setOffset] = useState(0);
    const [form, setForm] = useState<ItemFormValue | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [pendingArchive, setPendingArchive] = useState<AdminMenuItem | null>(null);

    async function load(nextSearch = search, nextOffset = offset, nextFilter = filter) {
        setBusy(true);
        setError("");
        try {
            const nextResult = await loadAdminMenuItemsAction(nextSearch, nextOffset, nextFilter);
            setResult(nextResult);
            if (!nextResult.ok) setError(nextResult.reason === "unauthorized" ? "Administrator access is required." : "Menu items could not be loaded. Try again.");
        } catch {
            setError("Menu items could not be loaded. Check your connection and try again.");
        } finally {
            setBusy(false);
        }
    }

    async function submitSearch(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const nextSearch = searchInput.trim();
        setSearch(nextSearch);
        setOffset(0);
        await load(nextSearch, 0);
    }

    async function changeFilter(nextFilter: AdminMenuItemFilter) {
        setFilter(nextFilter);
        setOffset(0);
        await load(search, 0, nextFilter);
    }

    async function save(value: ItemFormValue) {
        setBusy(true);
        setError("");
        setMessage("");
        try {
            const saved = await saveAdminMenuItemAction({
                ...value,
                price: Number(value.price),
                discountPrice: value.discountPrice ? Number(value.discountPrice) : null,
                preparationTime: Number(value.preparationTime),
                displayOrder: Number(value.displayOrder),
            });
            if (!saved.ok) {
                setError(saved.reason);
                return;
            }
            setForm(null);
            setMessage(value.id ? "Dish updated." : "Dish created.");
            await load(search, offset);
        } catch {
            setError("The menu item could not be saved. Check your connection and try again.");
        } finally {
            setBusy(false);
        }
    }

    async function changeAvailability(item: AdminMenuItem) {
        const nextAvailable = !item.is_available;
        if (!nextAvailable) {
            setPendingArchive(item);
            return;
        }
        await setAvailability(item, nextAvailable);
    }

    async function setAvailability(item: AdminMenuItem, isAvailable: boolean) {
        setBusy(true);
        setError("");
        try {
            const response = await setAdminMenuItemAvailabilityAction({ id: item.id, isAvailable });
            if (!response.ok) setError(response.reason);
            else {
                setMessage(isAvailable ? `${item.name} is available again.` : `${item.name} is archived and no longer orderable.`);
                await load(search, offset);
            }
        } catch {
            setError("The menu item availability could not be changed. Check your connection and try again.");
        } finally {
            setBusy(false);
        }
    }

    async function toggleFeatured(item: AdminMenuItem) {
        setBusy(true);
        setError("");
        try {
            const response = await setAdminMenuItemFeaturedAction({ id: item.id, isFeatured: !item.is_featured });
            if (!response.ok) setError(response.reason);
            else {
                setMessage(item.is_featured ? `${item.name} removed from featured dishes.` : `${item.name} featured on the homepage.`);
                await load(search, offset);
            }
        } catch {
            setError("The featured status could not be changed. Check your connection and try again.");
        } finally {
            setBusy(false);
        }
    }

    const pageData = result.ok ? result.data : null;
    const items = pageData?.items ?? [];
    const categories = pageData?.categories ?? [];
    const total = pageData?.total ?? 0;
    const counts = pageData?.counts ?? { all: 0, featured: 0, available: 0, unavailable: 0 };

    return (
        <div className="space-y-3">
            <AdminConfirmDialog open={pendingArchive !== null} title="Archive this menu item?" description={pendingArchive ? `${pendingArchive.name} will disappear from the public menu. Existing order records are unchanged.` : ""} confirmLabel="Archive item" busy={busy} onCancel={() => setPendingArchive(null)} onConfirm={() => { const item = pendingArchive; if (item) { setPendingArchive(null); void setAvailability(item, false); } }} />
            {message ? <p role="status" className="rounded border border-[#176c5d] bg-[#123e4c] px-3 py-2 text-[10px] text-[#c9f3e7]">{message}</p> : null}
            {error ? <p role="alert" className="rounded border border-[#743b47] bg-[#331f35] px-3 py-2 text-[10px] text-[#ffd9df]">{error}</p> : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
                <form onSubmit={(event) => void submitSearch(event)} className="flex min-w-0 flex-1 sm:max-w-64">
                    <label htmlFor="menu-item-search" className="sr-only">Search menu items</label>
                    <div className="flex min-w-0 flex-1 items-center rounded-l border border-r-0 border-[#234b6d] bg-[#092746] px-2"><Search className="h-3.5 w-3.5 shrink-0 text-[#7590a8]" aria-hidden="true" /><input id="menu-item-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} maxLength={80} placeholder="Search menu items…" className="h-8 min-w-0 flex-1 bg-transparent px-2 text-[9px] text-white outline-none placeholder:text-[#7089a0]" /></div>
                    <button type="submit" disabled={busy} className="rounded-r bg-[#0795f5] px-2.5 text-[9px] font-semibold text-white disabled:opacity-50">Search</button>
                </form>
                <button type="button" disabled={busy || categories.length === 0} onClick={() => { setError(""); setMessage(""); setForm(emptyForm(categories.find((category) => category.is_active)?.id ?? categories[0]?.id ?? "")); }} className="inline-flex h-8 items-center gap-1.5 rounded bg-[#0795f5] px-3 text-[9px] font-semibold text-white hover:bg-[#1685d2] disabled:opacity-50"><Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add Item</button>
            </div>

            <div role="group" aria-label="Filter menu items" className="flex gap-1 overflow-x-auto">
                {(["all", "featured", "available", "unavailable"] as const).map((value) => <button key={value} type="button" disabled={busy} aria-pressed={filter === value} onClick={() => void changeFilter(value)} className={`shrink-0 rounded px-2.5 py-1.5 text-[9px] font-semibold ${filter === value ? "bg-[#0795f5] text-white" : "border border-[#16466d] bg-[#092746] text-[#a9bfd3] hover:bg-[#103858] hover:text-white"}`}>{value === "all" ? "All" : value === "featured" ? "Featured" : value === "available" ? "Available" : "Unavailable"}<span className="ml-1 opacity-75">{counts[value]}</span></button>)}
            </div>

            {form ? <MenuItemForm key={form.id ?? "new"} initial={form} categories={categories} currency={currency} maxPreparationMinutes={maxPreparationMinutes} busy={busy} onCancel={() => setForm(null)} onSave={(value) => void save(value)} /> : null}

            {!form && categories.length === 0 ? <div className="rounded border border-dashed border-[#245477] bg-[#092746] p-5 text-[10px] leading-5 text-[#a9bfd3]">Create a category before adding dishes. <Link href="/admin/categories" className="font-bold text-[#46b6ff] underline underline-offset-2">Manage categories</Link></div> : null}

            {!form && items.length === 0 ? <div className="rounded border border-dashed border-[#245477] bg-[#092746] px-5 py-10 text-center"><h2 className="text-sm font-semibold text-white">No matching menu items</h2><p className="mt-1 text-[10px] text-[#91a9c2]">Create a dish or adjust your search.</p></div> : null}

            {items.length ? (
                <>
                <ul className="space-y-2 lg:hidden">
                    {items.map((item) => <li key={item.id} className="rounded-lg border border-[#d7e2ec] bg-white p-3.5 shadow-sm">
                        <div className="flex items-start gap-3">
                            {item.image_url ? <Image src={item.image_url} alt="" width={56} height={56} unoptimized className="h-14 w-14 shrink-0 rounded-md object-cover" /> : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-[#eaf1f8] text-[9px] text-[#71879a]">No image</span>}
                            <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="truncate text-sm font-semibold text-[#173650]">{item.name}</h2><p className="mt-0.5 truncate text-[11px] text-[#71879a]">{item.category_name}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${item.is_available ? "bg-[#e1f7ed] text-[#167553]" : "bg-[#edf1f4] text-[#647789]"}`}>{item.is_available ? "Available" : "Unavailable"}</span></div>
                                <div className="mt-2 flex items-center justify-between gap-2"><p className="text-sm font-bold tabular-nums text-[#173650]">{item.discount_price !== null && item.discount_price < item.price ? <><del className="mr-1 text-[10px] font-normal text-[#899bad]">{formatPrice(item.price, currency)}</del>{formatPrice(item.discount_price, currency)}</> : formatPrice(item.price, currency)}</p>
                                    <div className="flex items-center gap-2">
                                        <button type="button" role="switch" aria-label={`${item.is_featured ? "Remove" : "Add"} ${item.name} ${item.is_featured ? "from" : "to"} featured dishes`} aria-checked={item.is_featured} disabled={busy} onClick={() => void toggleFeatured(item)} className={`relative h-5 w-9 rounded-full transition-colors disabled:opacity-50 ${item.is_featured ? "bg-[#078cf0]" : "bg-[#b7c4d0]"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${item.is_featured ? "translate-x-4.5" : "translate-x-0.5"}`} /></button>
                                        <button type="button" aria-label={`Edit ${item.name}`} disabled={busy} onClick={() => { setError(""); setMessage(""); setForm(editForm(item)); }} className="rounded-md border border-[#d7e2ec] p-2 text-[#0876c7] hover:bg-[#eaf4fc] disabled:opacity-50"><Pencil className="h-4 w-4" aria-hidden="true" /></button>
                                        <button type="button" disabled={busy} onClick={() => void changeAvailability(item)} className="rounded-md border border-[#d7e2ec] px-2.5 py-2 text-[11px] font-semibold text-[#526a80] hover:bg-[#f3f7fa] disabled:opacity-50">{item.is_available ? "Archive" : "Restore"}</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </li>)}
                </ul>
                <div className="hidden overflow-hidden rounded-md border border-[#d7e2ec] bg-[#f7faff] shadow-[0_8px_24px_rgba(0,0,0,0.15)] lg:block">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] border-collapse text-left text-[9px]">
                            <thead className="bg-[#eaf1f8] text-[8px] font-bold uppercase text-[#597087]"><tr>{["Image", "Name", "Category", "Price", "Status", "Featured", "Actions"].map((heading) => <th key={heading} scope="col" className="px-2.5 py-2.5">{heading}</th>)}</tr></thead>
                            <tbody className="divide-y divide-[#e2e9f0]">
                                {items.map((item) => <tr key={item.id} className="hover:bg-white">
                                    <td className="w-14 px-2.5 py-1.5">{item.image_url ? <Image src={item.image_url} alt="" width={40} height={40} unoptimized className="h-9 w-9 rounded-sm object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-[#e4ebf2] text-[7px] text-[#71879a]">No image</span>}</td>
                                    <td className="max-w-52 px-2.5 py-1.5"><span className="block truncate text-[9px] font-semibold text-[#173650]">{item.name}</span><span className="mt-0.5 block max-w-48 truncate text-[8px] text-[#72869a]">{item.description || `/${item.slug}`}</span></td>
                                    <td className="px-2.5 py-1.5 text-[#526a80]">{item.category_name}</td>
                                    <td className="whitespace-nowrap px-2.5 py-1.5 font-semibold tabular-nums text-[#173650]">{item.discount_price !== null && item.discount_price < item.price ? <><del className="mr-1 text-[8px] font-normal text-[#899bad]">{formatPrice(item.price, currency)}</del>{formatPrice(item.discount_price, currency)}</> : formatPrice(item.price, currency)}</td>
                                    <td className="px-2.5 py-1.5"><span className={`inline-flex rounded px-1.5 py-0.5 text-[8px] font-semibold ${item.is_available ? "bg-[#d9f5e9] text-[#167553]" : "bg-[#e8edf2] text-[#647789]"}`}>{item.is_available ? "Available" : "Unavailable"}</span></td>
                                    <td className="px-2.5 py-1.5"><button type="button" role="switch" aria-label={`${item.is_featured ? "Remove" : "Add"} ${item.name} ${item.is_featured ? "from" : "to"} featured dishes`} aria-checked={item.is_featured} disabled={busy} onClick={() => void toggleFeatured(item)} className={`relative h-4 w-7 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0795f5] disabled:opacity-50 ${item.is_featured ? "bg-[#0795f5]" : "bg-[#b7c4d0]"}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${item.is_featured ? "translate-x-3.5" : "translate-x-0.5"}`} /></button></td>
                                    <td className="px-2.5 py-1.5"><div className="flex gap-1"><button type="button" aria-label={`Edit ${item.name}`} disabled={busy} onClick={() => { setError(""); setMessage(""); setForm(editForm(item)); }} className="rounded px-1.5 py-1 text-[#0876c7] hover:bg-[#dcefff] disabled:opacity-50"><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></button><button type="button" disabled={busy} onClick={() => void changeAvailability(item)} className="rounded px-1.5 py-1 text-[8px] font-semibold text-[#586f83] hover:bg-[#e8eef4] disabled:opacity-50">{item.is_available ? "Archive" : "Restore"}</button></div></td>
                                </tr>)}
                            </tbody>
                        </table>
                    </div>
                </div>
                </>
            ) : null}

            {total > PAGE_SIZE ? <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-[9px] text-[#91a9c2]"><p>Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}</p><div className="flex gap-1.5"><button type="button" disabled={offset === 0 || busy} onClick={() => { const next = Math.max(0, offset - PAGE_SIZE); setOffset(next); void load(search, next); }} className="inline-flex h-7 items-center gap-1 rounded border border-[#16466d] bg-[#092746] px-2 text-[#c2d3e2] disabled:opacity-40"><ChevronLeft className="h-3 w-3" aria-hidden="true" /> Previous</button><button type="button" disabled={offset + PAGE_SIZE >= total || busy} onClick={() => { const next = offset + PAGE_SIZE; setOffset(next); void load(search, next); }} className="inline-flex h-7 items-center gap-1 rounded border border-[#16466d] bg-[#092746] px-2 text-[#c2d3e2] disabled:opacity-40">Next <ChevronRight className="h-3 w-3" aria-hidden="true" /></button></div></div> : null}
        </div>
    );
}