"use client";

import { useState, type FormEvent } from "react";
import { Check } from "lucide-react";

import { saveAdminRestaurantSettingsAction } from "@/app/admin/management-actions";
import { AdminImageUpload } from "@/components/admin-image-upload";
import type { AdminPageData, AdminRestaurantSettings } from "@/lib/admin-management-data";
import type { PreparationEstimateRange } from "@/lib/admin-data";
import type { Json } from "@/types/database";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const SOCIALS = ["website", "facebook", "instagram", "tiktok", "x", "youtube"] as const;
const SOCIAL_LABELS: Record<(typeof SOCIALS)[number], string> = {
    website: "Website",
    facebook: "Facebook",
    instagram: "Instagram",
    tiktok: "TikTok",
    x: "X",
    youtube: "YouTube",
};

type SettingsFormValue = {
    name: string;
    description: string;
    aboutText: string;
    address: string;
    phone: string;
    email: string;
    logoUrl: string | null;
    coverImageUrl: string | null;
    openingHours: Record<string, { closed: boolean; open: string; close: string }>;
    socialLinks: Record<string, string>;
    currency: string;
    isPublished: boolean;
    isOrderingEnabled: boolean;
    orderingDisabledMessage: string;
    dineInEnabled: boolean;
    allowCustomerCancellation: boolean;
    defaultPreparationMinutes: number;
    timeZone: string;
};

const DEFAULT_DAY = { closed: false, open: "09:00", close: "22:00" };

function parseTime(value: string) {
    const match = value.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2] ?? "0");
    if (match[3]) hour = (hour % 12) + (match[3].toUpperCase() === "PM" ? 12 : 0);
    if (hour > 23 || minute > 59) return null;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function toRecord(value: Json): Record<string, Json | undefined> {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function settingsToForm(row: AdminRestaurantSettings | null, estimateRange: PreparationEstimateRange): SettingsFormValue {
    const hours = toRecord(row?.opening_hours ?? {});
    const social = toRecord(row?.social_links ?? {});
    return {
        name: row?.name ?? "",
        description: row?.description ?? "",
        aboutText: row?.about_text ?? "",
        address: row?.address ?? "",
        phone: row?.phone ?? "",
        email: row?.email ?? "",
        logoUrl: row?.logo_url ?? null,
        coverImageUrl: row?.cover_image_url ?? null,
        openingHours: Object.fromEntries(DAYS.map((day) => {
            const raw = hours[day];
            if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
                const schedule = raw as Record<string, Json | undefined>;
                return [day, {
                    closed: schedule.closed === true,
                    open: typeof schedule.open === "string" ? schedule.open : DEFAULT_DAY.open,
                    close: typeof schedule.close === "string" ? schedule.close : DEFAULT_DAY.close,
                }];
            }
            if (typeof raw === "string" && raw.trim()) {
                const [start, end] = raw.split(/\s*(?:-|–|—|to)\s*/i);
                return [day, { closed: false, open: parseTime(start) ?? DEFAULT_DAY.open, close: parseTime(end ?? "") ?? DEFAULT_DAY.close }];
            }
            return [day, { ...DEFAULT_DAY, closed: true }];
        })),
        socialLinks: Object.fromEntries(SOCIALS.map((site) => [site, typeof social[site] === "string" ? social[site] : ""])),
        currency: row?.currency ?? "BDT",
        isPublished: row?.is_published ?? false,
        isOrderingEnabled: row?.is_ordering_enabled ?? true,
        orderingDisabledMessage: row?.ordering_disabled_message ?? "",
        dineInEnabled: row?.dine_in_enabled ?? true,
        allowCustomerCancellation: row?.allow_customer_cancellation ?? true,
        defaultPreparationMinutes: Math.min(estimateRange.max, Math.max(estimateRange.min, row?.default_preparation_minutes ?? 30)),
        timeZone: row?.time_zone ?? "UTC",
    };
}

export function AdminSettingsPanel({ initialResult, estimateRange }: { initialResult: AdminPageData<AdminRestaurantSettings | null>; estimateRange: PreparationEstimateRange }) {
    const row = initialResult.ok ? initialResult.data : null;
    const [savedForm, setSavedForm] = useState(() => settingsToForm(row, estimateRange));
    const [form, setForm] = useState(() => settingsToForm(row, estimateRange));
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [confirmDisable, setConfirmDisable] = useState(false);

    function save() {
        let timeZone: string;
        try {
            timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch {
            setError("This device's time zone could not be detected. Check your browser settings and try again.");
            return;
        }
        if (!timeZone) {
            setError("This device's time zone could not be detected. Check your browser settings and try again.");
            return;
        }

        setBusy(true);
        setMessage("");
        setError("");
        const submittedForm = { ...form, timeZone };
        void saveAdminRestaurantSettingsAction(submittedForm).then((result) => {
            if (!result.ok) setError(result.reason);
            else {
                const savedValues = { ...submittedForm, openingHours: { ...form.openingHours }, socialLinks: { ...form.socialLinks } };
                setSavedForm(savedValues);
                setForm(savedValues);
                setMessage("Restaurant settings saved. Public pages now read the updated values.");
                setConfirmDisable(false);
            }
            setBusy(false);
        }).catch(() => {
            setError("Restaurant settings could not be saved. Please retry.");
            setBusy(false);
        });
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (savedForm.isOrderingEnabled && !form.isOrderingEnabled && !confirmDisable) {
            setConfirmDisable(true);
            return;
        }
        save();
    }

    function cancel() {
        setForm({
            ...savedForm,
            openingHours: { ...savedForm.openingHours },
            socialLinks: { ...savedForm.socialLinks },
        });
        setError("");
        setMessage("");
        setConfirmDisable(false);
    }

    return (
        <form onSubmit={submit} className="space-y-3">
            {message ? <p role="status" className="rounded border border-[#176c5d] bg-[#123e4c] px-3 py-2 text-[10px] text-[#c9f3e7]">{message}</p> : null}
            {error ? <p role="alert" className="rounded border border-[#743b47] bg-[#331f35] px-3 py-2 text-[10px] text-[#ffd9df]">{error}</p> : null}
            {confirmDisable ? <div role="alertdialog" aria-labelledby="disable-ordering-title" className="rounded border border-[#a26427] bg-[#3a3020] p-3 text-[10px] text-[#ffe2a5]"><h2 id="disable-ordering-title" className="font-bold">Temporarily disable ordering?</h2><p className="mt-1">Customers will still be able to browse, but new orders will be rejected by the server until ordering is re-enabled.</p><div className="mt-2 flex gap-2"><button type="button" onClick={() => setConfirmDisable(false)} className="rounded border border-[#826337] px-3 py-1.5 font-semibold">Go back</button><button type="button" onClick={save} disabled={busy} className="rounded bg-[#a74437] px-3 py-1.5 font-semibold text-white disabled:opacity-50">Confirm and save</button></div></div> : null}
            {!row ? <p className="rounded border border-[#745522] bg-[#3a3020] px-3 py-2 text-[10px] text-[#ffe2a5]">No settings record exists yet. Saving creates the single restaurant record; optional contact fields remain blank until entered.</p> : null}
            <div className="flex justify-end gap-1.5">
                <button type="button" onClick={cancel} disabled={busy} className="h-7 rounded border border-[#245477] px-2.5 text-[9px] font-semibold text-[#a9bfd3] hover:bg-[#0b2e50] disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={busy} className="inline-flex h-7 items-center gap-1.5 rounded bg-[#0795f5] px-3 text-[9px] font-semibold text-white hover:bg-[#1685d2] disabled:opacity-50">{busy ? "Saving…" : <><Check className="h-3.5 w-3.5" aria-hidden="true" /> Save Changes</>}</button>
            </div>
            <div className="grid overflow-hidden rounded-md border border-[#d7e2ec] bg-[#f7faff] shadow-[0_8px_24px_rgba(0,0,0,0.15)] lg:grid-cols-3 lg:divide-x lg:divide-[#d7e2ec]">
                <section className="space-y-3 p-3.5 sm:p-4">
                    <div className="border-b border-[#dce5ee] pb-2"><h2 className="text-[11px] font-semibold text-[#183a55]">Basic Information</h2><p className="mt-0.5 text-[8px] text-[#788b9d]">Public name, description, and currency</p></div>
                    <label className="block text-[9px] font-semibold text-[#425b70]">Restaurant Name<input required maxLength={120} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="mt-1 h-7 w-full rounded-sm border border-[#ccd8e4] bg-white px-2 text-[9px] font-normal text-[#193a55] outline-none focus:border-[#0795f5] focus:ring-1 focus:ring-[#0795f5]/30" /></label>
                    <label className="block text-[9px] font-semibold text-[#425b70]">Description<textarea rows={4} maxLength={2000} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="mt-1 w-full resize-y rounded-sm border border-[#ccd8e4] bg-white px-2 py-1.5 text-[9px] font-normal leading-4 text-[#193a55] outline-none focus:border-[#0795f5] focus:ring-1 focus:ring-[#0795f5]/30" /></label>
                    <label className="block text-[9px] font-semibold text-[#425b70]">About<textarea rows={5} maxLength={4000} value={form.aboutText} onChange={(event) => setForm((current) => ({ ...current, aboutText: event.target.value }))} className="mt-1 w-full resize-y rounded-sm border border-[#ccd8e4] bg-white px-2 py-1.5 text-[9px] font-normal leading-4 text-[#193a55] outline-none focus:border-[#0795f5] focus:ring-1 focus:ring-[#0795f5]/30" /><span className="mt-1 block text-[8px] font-normal text-[#788b9d]">Optional story shown in the restaurant profile section.</span></label>
                    <label className="block text-[9px] font-semibold text-[#425b70]">Currency<input required pattern="[A-Z]{3}" maxLength={3} value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} className="mt-1 h-7 w-full rounded-sm border border-[#ccd8e4] bg-white px-2 font-mono text-[9px] font-normal uppercase text-[#193a55] outline-none focus:border-[#0795f5] focus:ring-1 focus:ring-[#0795f5]/30" /><span className="mt-1 block text-[8px] font-normal text-[#788b9d]">ISO code such as BDT. Existing orders retain their stored currency.</span></label>
                    <label className="flex items-start gap-2 border-t border-[#dce5ee] pt-3 text-[9px] font-semibold text-[#425b70]"><input type="checkbox" checked={form.isPublished} onChange={(event) => setForm((current) => ({ ...current, isPublished: event.target.checked }))} className="mt-0.5 h-3.5 w-3.5 accent-[#0795f5]" /><span>Publish profile<span className="mt-0.5 block text-[8px] font-normal text-[#788b9d]">Unpublished settings stay hidden on public pages.</span></span></label>
                </section>

                <section className="space-y-3 border-t border-[#d7e2ec] p-3.5 sm:p-4 lg:border-t-0">
                    <div className="border-b border-[#dce5ee] pb-2"><h2 className="text-[11px] font-semibold text-[#183a55]">Branding</h2><p className="mt-0.5 text-[8px] text-[#788b9d]">Public restaurant images</p></div>
                    <AdminImageUpload label="Logo" role="logo" value={form.logoUrl} persistedValue={savedForm.logoUrl} onChange={(logoUrl) => setForm((current) => ({ ...current, logoUrl }))} />
                    <div className="border-t border-[#e2e9f0] pt-3"><AdminImageUpload label="Cover Image" role="cover" value={form.coverImageUrl} persistedValue={savedForm.coverImageUrl} onChange={(coverImageUrl) => setForm((current) => ({ ...current, coverImageUrl }))} /></div>
                </section>

                <section className="space-y-3 border-t border-[#d7e2ec] p-3.5 sm:p-4 lg:border-t-0">
                    <div className="border-b border-[#dce5ee] pb-2"><h2 className="text-[11px] font-semibold text-[#183a55]">Contact Information</h2><p className="mt-0.5 text-[8px] text-[#788b9d]">Optional customer-facing details</p></div>
                    <label className="block text-[9px] font-semibold text-[#425b70]">Address<textarea rows={2} maxLength={300} value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} className="mt-1 w-full resize-y rounded-sm border border-[#ccd8e4] bg-white px-2 py-1.5 text-[9px] font-normal text-[#193a55] outline-none focus:border-[#0795f5]" /></label>
                    <div className="grid grid-cols-2 gap-2"><label className="block text-[9px] font-semibold text-[#425b70]">Phone<input type="tel" maxLength={32} value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} className="mt-1 h-7 w-full rounded-sm border border-[#ccd8e4] bg-white px-2 text-[9px] font-normal text-[#193a55] outline-none focus:border-[#0795f5]" /></label><label className="block text-[9px] font-semibold text-[#425b70]">Email<input type="email" maxLength={254} value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="mt-1 h-7 w-full rounded-sm border border-[#ccd8e4] bg-white px-2 text-[9px] font-normal text-[#193a55] outline-none focus:border-[#0795f5]" /></label></div>
                    <div><h3 className="mb-1.5 text-[9px] font-semibold text-[#425b70]">Social Links</h3><div className="grid grid-cols-2 gap-1.5">{SOCIALS.map((site) => <label key={site} className="text-[8px] font-medium text-[#61768b]">{SOCIAL_LABELS[site]}<input type="url" maxLength={2048} placeholder="https://" value={form.socialLinks[site] ?? ""} onChange={(event) => setForm((current) => ({ ...current, socialLinks: { ...current.socialLinks, [site]: event.target.value } }))} className="mt-0.5 h-6 w-full rounded-sm border border-[#ccd8e4] bg-white px-1.5 text-[8px] font-normal text-[#193a55] outline-none focus:border-[#0795f5]" /></label>)}</div></div>
                </section>
            </div>
            <section className="rounded-md border border-[#d7e2ec] bg-[#f7faff] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.15)]">
                <div className="mb-3"><h2 className="text-sm font-semibold text-[#183a55]">Opening Hours</h2><p className="mt-1 text-xs text-[#788b9d]">Use 24-hour local time. Overnight hours (for example 18:00 to 02:00) are supported.</p></div>
                <div className="space-y-2">{DAYS.map((day) => {
                    const hours = form.openingHours[day] ?? { ...DEFAULT_DAY, closed: true };
                    return <div key={day} className="grid items-center gap-2 border-t border-[#e2e9f0] py-2 sm:grid-cols-[130px_100px_1fr]">
                        <span className="text-xs font-semibold capitalize text-[#425b70]">{day}</span>
                        <label className="flex items-center gap-2 text-xs text-[#61768b]"><input type="checkbox" checked={!hours.closed} onChange={(event) => setForm((current) => ({ ...current, openingHours: { ...current.openingHours, [day]: { ...hours, closed: !event.target.checked } } }))} className="h-4 w-4 accent-[#0795f5]" />Open</label>
                        <div className="grid grid-cols-2 gap-2">
                            <label className="text-[10px] text-[#61768b]">Opens<input type="time" disabled={hours.closed} value={hours.open} onChange={(event) => setForm((current) => ({ ...current, openingHours: { ...current.openingHours, [day]: { ...hours, open: event.target.value } } }))} className="mt-1 h-9 w-full rounded border border-[#ccd8e4] bg-white px-2 text-sm text-[#193a55] disabled:opacity-50" /></label>
                            <label className="text-[10px] text-[#61768b]">Closes<input type="time" disabled={hours.closed} value={hours.close} onChange={(event) => setForm((current) => ({ ...current, openingHours: { ...current.openingHours, [day]: { ...hours, close: event.target.value } } }))} className="mt-1 h-9 w-full rounded border border-[#ccd8e4] bg-white px-2 text-sm text-[#193a55] disabled:opacity-50" /></label>
                        </div>
                    </div>;
                })}</div>
                <label className="mt-3 block max-w-sm text-xs font-semibold text-[#425b70]">Restaurant time zone<input required maxLength={80} readOnly value={form.timeZone} className="mt-1 h-9 w-full rounded border border-[#ccd8e4] bg-[#edf2f7] px-2 text-sm font-normal text-[#193a55]" /><span className="mt-1 block font-normal text-[#788b9d]">Automatically detected from this device each time you save settings. Opening hours use this location&apos;s local time.</span></label>
            </section>
            <section className="grid gap-3 rounded-md border border-[#d7e2ec] bg-[#f7faff] p-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><h2 className="text-sm font-semibold text-[#183a55]">Ordering &amp; Payment</h2><p className="mt-1 text-xs text-[#788b9d]">Changes are checked again when the order is created on the server.</p></div>
                <label className="flex items-start gap-2 text-xs font-semibold text-[#425b70]"><input type="checkbox" checked={form.isOrderingEnabled} onChange={(event) => setForm((current) => ({ ...current, isOrderingEnabled: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-[#0795f5]" /><span>Accept new orders<span className="mt-1 block font-normal text-[#788b9d]">When disabled, guests can continue to browse the menu.</span></span></label>
                <label className="flex items-start gap-2 text-xs font-semibold text-[#425b70]"><input type="checkbox" checked={form.dineInEnabled} onChange={(event) => setForm((current) => ({ ...current, dineInEnabled: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-[#0795f5]" /><span>Enable dine-in ordering<span className="mt-1 block font-normal text-[#788b9d]">Requires customers to scan a valid table QR code.</span></span></label>
                <label className="flex items-start gap-2 text-xs font-semibold text-[#425b70]"><input type="checkbox" checked={form.allowCustomerCancellation} onChange={(event) => setForm((current) => ({ ...current, allowCustomerCancellation: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-[#0795f5]" /><span>Allow pending-order cancellation<span className="mt-1 block font-normal text-[#788b9d]">Customers may cancel only while an order is pending.</span></span></label>
                <label className="block text-xs font-semibold text-[#425b70]">Default preparation time (minutes)<input required type="number" min={estimateRange.min} max={estimateRange.max} value={form.defaultPreparationMinutes} onChange={(event) => setForm((current) => ({ ...current, defaultPreparationMinutes: Number(event.target.value) }))} className="mt-1 h-9 w-full rounded border border-[#ccd8e4] bg-white px-2 text-sm font-normal text-[#193a55]" /><span className="mt-1 block font-normal text-[#788b9d]">{estimateRange.min}–{estimateRange.max} minutes</span></label>
                {!form.isOrderingEnabled ? <label className="block text-xs font-semibold text-[#425b70] sm:col-span-2">Message shown to customers<input maxLength={300} value={form.orderingDisabledMessage} onChange={(event) => setForm((current) => ({ ...current, orderingDisabledMessage: event.target.value }))} placeholder="Ordering is temporarily unavailable" className="mt-1 h-9 w-full rounded border border-[#ccd8e4] bg-white px-2 text-sm font-normal text-[#193a55]" /></label> : null}
                <div className="flex items-center justify-between border-t border-[#dce5ee] pt-3 text-xs text-[#425b70] sm:col-span-2"><span>Payment method: <strong>Pay at Restaurant Counter</strong><br />Default payment status: <strong>Unpaid</strong></span><span>Authentication is required to order</span></div>
            </section>
        </form>
    );
}