"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/types/database";

type Settings = {
    hourly_rate: number;
    advance_amount: number;
    minimum_duration_minutes: number;
    duration_increment_minutes: number;
    booking_horizon_days: number;
    request_hold_minutes: number;
    payment_deadline_hours: number;
    minimum_players: number;
    maximum_players: number;
    no_show_grace_minutes: number;
    booking_enabled: boolean;
};

type WeeklyHours = {
    weekday: number;
    is_closed: boolean;
    opens_at: string | null;
    closes_at: string | null;
};

type FixedSlot = {
    id: string;
    label: string;
    starts_at: string;
    ends_at: string;
    price: number;
    is_active: boolean;
};

type PaymentMethod = {
    method: string;
    display_name: string;
    account_details: string;
    account_type: string;
    instructions: string;
    is_active: boolean;
};

type Configuration = {
    settings: Settings;
    weekly_hours: WeeklyHours[];
    fixed_slots: FixedSlot[];
    payment_methods: PaymentMethod[];
    current_policy: { version: number; content: string } | null;
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PAYMENT_OPTIONS = [
    { value: "bkash", label: "bKash" },
    { value: "nagad", label: "Nagad" },
    { value: "rocket", label: "Rocket" },
    { value: "bank_transfer", label: "Bank transfer" },
    { value: "other", label: "Other" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSettings(value: unknown): Settings | null {
    if (!isRecord(value)
        || typeof value.hourly_rate !== "number"
        || typeof value.advance_amount !== "number"
        || typeof value.minimum_duration_minutes !== "number"
        || typeof value.duration_increment_minutes !== "number"
        || typeof value.booking_horizon_days !== "number"
        || typeof value.request_hold_minutes !== "number"
        || typeof value.payment_deadline_hours !== "number"
        || typeof value.minimum_players !== "number"
        || typeof value.maximum_players !== "number"
        || typeof value.no_show_grace_minutes !== "number"
        || typeof value.booking_enabled !== "boolean") return null;
    return {
        hourly_rate: value.hourly_rate,
        advance_amount: value.advance_amount,
        minimum_duration_minutes: value.minimum_duration_minutes,
        duration_increment_minutes: value.duration_increment_minutes,
        booking_horizon_days: value.booking_horizon_days,
        request_hold_minutes: value.request_hold_minutes,
        payment_deadline_hours: value.payment_deadline_hours,
        minimum_players: value.minimum_players,
        maximum_players: value.maximum_players,
        no_show_grace_minutes: value.no_show_grace_minutes,
        booking_enabled: value.booking_enabled,
    };
}

function parseConfiguration(value: Json): Configuration | null {
    if (!isRecord(value)) return null;
    const settings = readSettings(value.settings);
    if (!settings || !Array.isArray(value.weekly_hours) || !Array.isArray(value.fixed_slots) || !Array.isArray(value.payment_methods)) return null;
    const weeklyHours = value.weekly_hours.flatMap((entry) =>
        isRecord(entry) && typeof entry.weekday === "number" && typeof entry.is_closed === "boolean"
            ? [{
                weekday: entry.weekday,
                is_closed: entry.is_closed,
                opens_at: typeof entry.opens_at === "string" ? entry.opens_at.slice(0, 5) : null,
                closes_at: typeof entry.closes_at === "string" ? entry.closes_at.slice(0, 5) : null,
            }]
            : [],
    );
    const fixedSlots = value.fixed_slots.flatMap((entry) =>
        isRecord(entry) && typeof entry.id === "string" && typeof entry.label === "string"
            && typeof entry.starts_at === "string" && typeof entry.ends_at === "string"
            && typeof entry.price === "number" && typeof entry.is_active === "boolean"
            ? [{
                id: entry.id,
                label: entry.label,
                starts_at: entry.starts_at.slice(0, 5),
                ends_at: entry.ends_at.slice(0, 5),
                price: entry.price,
                is_active: entry.is_active,
            }]
            : [],
    );
    const paymentMethods = value.payment_methods.flatMap((entry) =>
        isRecord(entry) && typeof entry.method === "string" && typeof entry.display_name === "string"
            && typeof entry.account_details === "string" && typeof entry.account_type === "string"
            && typeof entry.instructions === "string" && typeof entry.is_active === "boolean"
            ? [{
                method: entry.method,
                display_name: entry.display_name,
                account_details: entry.account_details,
                account_type: entry.account_type,
                instructions: entry.instructions,
                is_active: entry.is_active,
            }]
            : [],
    );
    const policy = isRecord(value.current_policy)
        && typeof value.current_policy.version === "number"
        && typeof value.current_policy.content === "string"
        ? { version: value.current_policy.version, content: value.current_policy.content }
        : null;
    return { settings, weekly_hours: weeklyHours, fixed_slots: fixedSlots, payment_methods: paymentMethods, current_policy: policy };
}

function InputField({
    label, value, onChange, min, max, step = 1,
}: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    step?: number;
}) {
    return <label className="block text-sm font-semibold">{label}<input type="number" min={min} max={max} step={step} value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 min-h-10 w-full rounded-lg border border-[#cbd9d0] px-3 font-normal" /></label>;
}

export function TurfSettingsPanel({ initial }: { initial: Json }) {
    const router = useRouter();
    const configuration = parseConfiguration(initial);
    const [settings, setSettings] = useState<Settings | null>(configuration?.settings ?? null);
    const [weekly, setWeekly] = useState(configuration?.weekly_hours ?? []);
    const [policy, setPolicy] = useState(configuration?.current_policy?.content ?? "");
    const [reason, setReason] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [slotLabel, setSlotLabel] = useState("");
    const [slotStart, setSlotStart] = useState("18:00");
    const [slotEnd, setSlotEnd] = useState("19:00");
    const [slotPrice, setSlotPrice] = useState(1000);
    const [paymentMethod, setPaymentMethod] = useState(PAYMENT_OPTIONS[0].value);
    const [paymentName, setPaymentName] = useState("");
    const [accountDetails, setAccountDetails] = useState("");
    const [accountType, setAccountType] = useState("Merchant");
    const [instructions, setInstructions] = useState("");

    if (!configuration || !settings) {
        return <p role="alert" className="rounded-2xl bg-white p-6 text-sm text-red-800">Turf settings could not be read. Refresh and retry.</p>;
    }

    async function save(operation: string, call: () => Promise<{ error: { message: string; code?: string } | null }>) {
        if (reason.trim().length < 3) {
            setError("Enter a reason for this settings change.");
            return;
        }
        setBusy(operation);
        setError(null);
        setNotice(null);
        try {
            const result = await call();
            if (result.error) {
                const expectedRejection = ["23P01", "22023", "42501", "55000"].includes(result.error.code ?? "");
                if (!expectedRejection) {
                    console.error(
                        "Turf settings update failed unexpectedly.",
                        operation,
                        result.error.code ?? "unknown database error",
                        result.error.message,
                    );
                }
                if (result.error.code === "23P01" && operation.startsWith("weekday-")) {
                    throw new Error("These hours would conflict with an existing protected booking. Keep the current hours or resolve affected bookings before changing this day.");
                }
                if (result.error.code === "23P01" && operation === "fixed-slot") {
                    throw new Error("This fixed slot overlaps another active slot or is already used by a protected booking. Choose a non-overlapping time; existing booked slots cannot be changed.");
                }
                throw new Error(`Settings were not saved (${result.error.code ?? "database error"}).`);
            }
            setNotice("Changes saved and recorded in the turf audit history.");
            setReason("");
            router.refresh();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Settings could not be saved.");
        } finally {
            setBusy(null);
        }
    }

    const inputClass = "min-h-10 w-full rounded-lg border border-[#cbd9d0] bg-white px-3 text-sm";

    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-[#c8e4d5] bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
                Full Admin and Turf Manager have equal turf permissions. Every setting change requires an explanation and is audited.
            </div>
            <section className="rounded-2xl border border-[#dce8e0] bg-white p-5 sm:p-6">
                <h2 className="text-lg font-extrabold">Booking rules & pricing</h2>
                <p className="mt-1 text-sm text-[#597267]">Values are checked by PostgreSQL when a booking is submitted.</p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <InputField label="Hourly rate (BDT)" min={0} max={1000000} step={50} value={settings.hourly_rate} onChange={(value) => setSettings({ ...settings, hourly_rate: value })} />
                    <InputField label="Default advance (BDT)" min={0} max={1000000} step={50} value={settings.advance_amount} onChange={(value) => setSettings({ ...settings, advance_amount: value })} />
                    <InputField label="Minimum duration (minutes)" min={15} max={720} step={15} value={settings.minimum_duration_minutes} onChange={(value) => setSettings({ ...settings, minimum_duration_minutes: value })} />
                    <InputField label="Duration increment (minutes)" min={15} max={720} step={15} value={settings.duration_increment_minutes} onChange={(value) => setSettings({ ...settings, duration_increment_minutes: value })} />
                    <InputField label="Booking horizon (days)" min={1} max={365} value={settings.booking_horizon_days} onChange={(value) => setSettings({ ...settings, booking_horizon_days: value })} />
                    <InputField label="Request hold (minutes)" min={5} max={1440} value={settings.request_hold_minutes} onChange={(value) => setSettings({ ...settings, request_hold_minutes: value })} />
                    <InputField label="Advance deadline (hours)" min={1} max={720} value={settings.payment_deadline_hours} onChange={(value) => setSettings({ ...settings, payment_deadline_hours: value })} />
                    <InputField label="Minimum players" min={1} max={100} value={settings.minimum_players} onChange={(value) => setSettings({ ...settings, minimum_players: value })} />
                    <InputField label="Maximum players" min={1} max={100} value={settings.maximum_players} onChange={(value) => setSettings({ ...settings, maximum_players: value })} />
                    <InputField label="No-show grace (minutes)" min={0} max={240} value={settings.no_show_grace_minutes} onChange={(value) => setSettings({ ...settings, no_show_grace_minutes: value })} />
                </div>
                <label className="mt-4 flex items-center gap-3 text-sm font-semibold">
                    <input type="checkbox" checked={settings.booking_enabled} onChange={(event) => setSettings({ ...settings, booking_enabled: event.target.checked })} className="h-4 w-4 accent-emerald-700" />
                    Accept online booking requests
                </label>
                <ReasonField value={reason} onChange={setReason} />
                <button type="button" disabled={busy !== null} onClick={() => save("settings", async () => {
                    const supabase = createClient();
                    return supabase.rpc("turf_update_settings", {
                        p_hourly_rate: settings.hourly_rate,
                        p_advance_amount: settings.advance_amount,
                        p_minimum_duration_minutes: settings.minimum_duration_minutes,
                        p_duration_increment_minutes: settings.duration_increment_minutes,
                        p_booking_horizon_days: settings.booking_horizon_days,
                        p_request_hold_minutes: settings.request_hold_minutes,
                        p_payment_deadline_hours: settings.payment_deadline_hours,
                        p_minimum_players: settings.minimum_players,
                        p_maximum_players: settings.maximum_players,
                        p_no_show_grace_minutes: settings.no_show_grace_minutes,
                        p_booking_enabled: settings.booking_enabled,
                        p_reason: reason.trim(),
                    });
                })} className="mt-3 min-h-10 rounded-lg bg-[#087a4a] px-4 text-sm font-bold text-white disabled:opacity-50">
                    {busy === "settings" ? "Saving…" : "Save booking settings"}
                </button>
            </section>

            <section className="rounded-2xl border border-[#dce8e0] bg-white p-5 sm:p-6">
                <h2 className="text-lg font-extrabold">Weekly operating hours</h2>
                <div className="mt-4 divide-y divide-[#e8efea]">
                    {WEEKDAYS.map((label, weekday) => {
                        const hours = weekly.find((item) => item.weekday === weekday);
                        if (!hours) return null;
                        return (
                            <div key={weekday} className="grid gap-3 py-4 sm:grid-cols-[7rem_1fr_auto] sm:items-center">
                                <span className="text-sm font-bold">{label}</span>
                                <div className="flex flex-wrap items-center gap-3">
                                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hours.is_closed}
                                        onChange={(event) => setWeekly(weekly.map((item) => item.weekday === weekday
                                            ? { ...item, is_closed: event.target.checked }
                                            : item))} className="accent-emerald-700" /> Closed</label>
                                    {!hours.is_closed ? <>
                                        <input type="time" value={hours.opens_at ?? "09:00"} aria-label={`${label} opens at`}
                                            onChange={(event) => setWeekly(weekly.map((item) => item.weekday === weekday ? { ...item, opens_at: event.target.value } : item))}
                                            className={inputClass + " max-w-36"} />
                                        <span className="text-xs text-[#6a8176]">to</span>
                                        <input type="time" value={hours.closes_at ?? "22:00"} aria-label={`${label} closes at`}
                                            onChange={(event) => setWeekly(weekly.map((item) => item.weekday === weekday ? { ...item, closes_at: event.target.value } : item))}
                                            className={inputClass + " max-w-36"} />
                                    </> : null}
                                </div>
                                <button type="button" disabled={busy !== null} onClick={() => save(`weekday-${weekday}`, async () => {
                                    const supabase = createClient();
                                    return supabase.rpc("turf_set_weekly_hours", {
                                        p_weekday: weekday,
                                        p_is_closed: hours.is_closed,
                                        p_opens_at: hours.is_closed ? null : hours.opens_at,
                                        p_closes_at: hours.is_closed ? null : hours.closes_at,
                                        p_reason: reason.trim(),
                                    });
                                })} className="min-h-9 rounded-lg border border-[#cbd9d0] px-3 text-xs font-bold text-[#087a4a] disabled:opacity-50">
                                    {busy === `weekday-${weekday}` ? "Saving…" : "Save day"}
                                </button>
                            </div>
                        );
                    })}
                </div>
                <ReasonField value={reason} onChange={setReason} />
                <p className="mt-2 text-xs text-[#6a8176]">Schedule edits are rejected if they would invalidate a protected booking; resolve affected bookings first.</p>
            </section>

            <section className="rounded-2xl border border-[#dce8e0] bg-white p-5 sm:p-6">
                <h2 className="text-lg font-extrabold">Fixed slots</h2>
                <div className="mt-3 space-y-2">
                    {configuration.fixed_slots.map((slot) => (
                        <div key={slot.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f4f8f6] p-3 text-sm">
                            <span><strong>{slot.label}</strong> · {slot.starts_at}–{slot.ends_at} · BDT {slot.price} · {slot.is_active ? "Active" : "Inactive"}</span>
                        </div>
                    ))}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-semibold">Slot label<input className={inputClass + " mt-1"} value={slotLabel} onChange={(event) => setSlotLabel(event.target.value)} /></label>
                    <label className="text-sm font-semibold">Price (BDT)<input type="number" min="1" value={slotPrice} onChange={(event) => setSlotPrice(Number(event.target.value))} className={inputClass + " mt-1"} /></label>
                    <label className="text-sm font-semibold">Starts<input type="time" value={slotStart} onChange={(event) => setSlotStart(event.target.value)} className={inputClass + " mt-1"} /></label>
                    <label className="text-sm font-semibold">Ends<input type="time" value={slotEnd} onChange={(event) => setSlotEnd(event.target.value)} className={inputClass + " mt-1"} /></label>
                </div>
                <ReasonField value={reason} onChange={setReason} />
                <button type="button" disabled={busy !== null || !slotLabel.trim() || slotStart >= slotEnd} onClick={() => save("fixed-slot", async () => {
                    const supabase = createClient();
                    return supabase.rpc("turf_set_fixed_slot", {
                        p_slot_id: null,
                        p_label: slotLabel.trim(),
                        p_starts_at: slotStart,
                        p_ends_at: slotEnd,
                        p_price: slotPrice,
                        p_is_active: true,
                        p_reason: reason.trim(),
                    });
                })} className="mt-3 min-h-10 rounded-lg bg-[#087a4a] px-4 text-sm font-bold text-white disabled:opacity-50">
                    {busy === "fixed-slot" ? "Saving…" : "Add fixed slot"}
                </button>
            </section>

            <section className="rounded-2xl border border-[#dce8e0] bg-white p-5 sm:p-6">
                <h2 className="text-lg font-extrabold">Published booking policy</h2>
                {configuration.current_policy ? <p className="mt-1 text-xs text-[#6a8176]">Current version: {configuration.current_policy.version}. Existing bookings keep the version they accepted.</p> : <p className="mt-1 text-sm text-amber-800">No policy is published yet. Publish a policy before enabling bookings.</p>}
                <label className="mt-4 block text-sm font-semibold">Policy content<textarea rows={8} minLength={20} maxLength={20000} value={policy}
                    onChange={(event) => setPolicy(event.target.value)} className={inputClass + " mt-1 py-2"} /></label>
                <ReasonField value={reason} onChange={setReason} />
                <button type="button" disabled={busy !== null || policy.trim().length < 20} onClick={() => save("policy", async () => {
                    const supabase = createClient();
                    return supabase.rpc("turf_publish_policy", {
                        p_content: policy,
                        p_effective_at: new Date().toISOString(),
                        p_reason: reason.trim(),
                    });
                })} className="mt-3 min-h-10 rounded-lg bg-[#087a4a] px-4 text-sm font-bold text-white disabled:opacity-50">
                    {busy === "policy" ? "Publishing…" : "Publish new version"}
                </button>
            </section>

            <section className="rounded-2xl border border-[#dce8e0] bg-white p-5 sm:p-6">
                <h2 className="text-lg font-extrabold">Payment instructions</h2>
                <div className="mt-3 space-y-2">
                    {configuration.payment_methods.map((method) => (
                        <div key={method.method} className="rounded-xl bg-[#f4f8f6] p-3 text-sm">
                            <strong>{method.display_name}</strong> · {method.account_type} · {method.is_active ? "Active" : "Inactive"}
                            <p className="mt-1 break-all font-mono text-xs">{method.account_details}</p>
                        </div>
                    ))}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-semibold">Method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className={inputClass + " mt-1"}>
                        {PAYMENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select></label>
                    <label className="text-sm font-semibold">Display name<input value={paymentName} onChange={(event) => setPaymentName(event.target.value)} className={inputClass + " mt-1"} /></label>
                    <label className="text-sm font-semibold">Account details<input value={accountDetails} onChange={(event) => setAccountDetails(event.target.value)} className={inputClass + " mt-1"} /></label>
                    <label className="text-sm font-semibold">Account type<input value={accountType} onChange={(event) => setAccountType(event.target.value)} className={inputClass + " mt-1"} /></label>
                    <label className="text-sm font-semibold sm:col-span-2">Instructions<textarea rows={3} value={instructions} onChange={(event) => setInstructions(event.target.value)} className={inputClass + " mt-1 py-2"} /></label>
                </div>
                <ReasonField value={reason} onChange={setReason} />
                <button type="button" disabled={busy !== null || !paymentName.trim() || !accountDetails.trim() || !instructions.trim()} onClick={() => save("payment-method", async () => {
                    const supabase = createClient();
                    return supabase.rpc("turf_set_payment_method", {
                        p_method: paymentMethod,
                        p_display_name: paymentName.trim(),
                        p_account_details: accountDetails.trim(),
                        p_account_type: accountType.trim(),
                        p_instructions: instructions.trim(),
                        p_is_active: true,
                        p_reason: reason.trim(),
                    });
                })} className="mt-3 min-h-10 rounded-lg bg-[#087a4a] px-4 text-sm font-bold text-white disabled:opacity-50">
                    {busy === "payment-method" ? "Saving…" : "Save payment method"}
                </button>
            </section>

            {error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
            {notice ? <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</p> : null}
        </div>
    );
}

function ReasonField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    return <label className="mt-4 block text-xs font-semibold text-[#597267]">Reason for settings change (required)
        <input required minLength={3} maxLength={500} value={value} onChange={(event) => onChange(event.target.value)}
            className="mt-1 min-h-10 w-full rounded-lg border border-[#cbd9d0] px-3 text-sm font-normal" />
    </label>;
}
