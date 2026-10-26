"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getFixedSlotDisplayAvailability } from "@/lib/turf/booking-rules";

type TurfFixedSlot = {
    id: string;
    label: string;
    starts_at: string;
    ends_at: string;
    price: number;
};

type BlockedRange = {
    starts_at: string;
    ends_at: string;
    kind: "booked" | "unavailable";
};

type TurfDay = {
    local_date: string;
    is_open: boolean;
    opens_at: string | null;
    closes_at: string | null;
    booking_enabled: boolean;
    hourly_rate: number;
    minimum_duration_minutes: number;
    duration_increment_minutes: number;
    minimum_players: number;
    maximum_players: number;
    advance_amount: number;
    blocked_ranges: BlockedRange[];
    booked_ranges: { starts_at: string; ends_at: string }[];
    fixed_slots: TurfFixedSlot[];
    policy: { id: number; version: number; content: string; effective_at: string } | null;
};

type BookingSuccess = {
    reference: string;
    tracking_token: string;
    status: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDay(value: unknown): TurfDay | null {
    if (!isRecord(value)
        || typeof value.local_date !== "string"
        || typeof value.is_open !== "boolean"
        || typeof value.booking_enabled !== "boolean"
        || typeof value.hourly_rate !== "number"
        || typeof value.minimum_duration_minutes !== "number"
        || typeof value.duration_increment_minutes !== "number"
        || typeof value.minimum_players !== "number"
        || typeof value.maximum_players !== "number"
        || typeof value.advance_amount !== "number"
        || !Array.isArray(value.blocked_ranges)
        || !Array.isArray(value.booked_ranges)
        || !Array.isArray(value.fixed_slots)) {
        return null;
    }

    const policy = isRecord(value.policy)
        && typeof value.policy.id === "number"
        && typeof value.policy.version === "number"
        && typeof value.policy.content === "string"
        && typeof value.policy.effective_at === "string"
        ? {
            id: value.policy.id,
            version: value.policy.version,
            content: value.policy.content,
            effective_at: value.policy.effective_at,
        }
        : null;

    const blockedRanges = value.blocked_ranges.flatMap((range) =>
        isRecord(range)
            && typeof range.starts_at === "string"
            && typeof range.ends_at === "string"
            && (range.kind === "booked" || range.kind === "unavailable")
            ? [{
                starts_at: range.starts_at,
                ends_at: range.ends_at,
                kind: range.kind === "booked" ? "booked" as const : "unavailable" as const,
            }]
            : [],
    );
    const fixedSlots = value.fixed_slots.flatMap((slot) =>
        isRecord(slot)
            && typeof slot.id === "string"
            && typeof slot.label === "string"
            && typeof slot.starts_at === "string"
            && typeof slot.ends_at === "string"
            && typeof slot.price === "number"
            ? [{
                id: slot.id,
                label: slot.label,
                starts_at: slot.starts_at,
                ends_at: slot.ends_at,
                price: slot.price,
            }]
            : [],
    );
    const bookedRanges = value.booked_ranges.flatMap((range) =>
        isRecord(range) && typeof range.starts_at === "string" && typeof range.ends_at === "string"
            ? [{ starts_at: range.starts_at, ends_at: range.ends_at }]
            : [],
    );

    return {
        local_date: value.local_date,
        is_open: value.is_open,
        opens_at: typeof value.opens_at === "string" ? value.opens_at : null,
        closes_at: typeof value.closes_at === "string" ? value.closes_at : null,
        booking_enabled: value.booking_enabled,
        hourly_rate: value.hourly_rate,
        minimum_duration_minutes: value.minimum_duration_minutes,
        duration_increment_minutes: value.duration_increment_minutes,
        minimum_players: value.minimum_players,
        maximum_players: value.maximum_players,
        advance_amount: value.advance_amount,
        blocked_ranges: blockedRanges,
        booked_ranges: bookedRanges,
        fixed_slots: fixedSlots,
        policy,
    };
}

function dhakaTimestamp(date: string, time: string) {
    return new Date(`${date}T${time.slice(0, 5)}:00+06:00`).getTime();
}

function formatPrice(amount: number) {
    return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(amount);
}

function getHourlyStartTimes(day: TurfDay) {
    if (!day.opens_at || !day.closes_at) return [];
    const [openHour, openMinute] = day.opens_at.split(":").map(Number);
    const [closeHour, closeMinute] = day.closes_at.split(":").map(Number);
    const opening = openHour * 60 + openMinute;
    const closing = closeHour * 60 + closeMinute;
    const startTimes: string[] = [];
    for (let minutes = opening; minutes < closing; minutes += day.duration_increment_minutes) {
        const hour = Math.floor(minutes / 60).toString().padStart(2, "0");
        const minute = (minutes % 60).toString().padStart(2, "0");
        startTimes.push(`${hour}:${minute}`);
    }
    return startTimes;
}

export function TurfBookingForm({
    today,
    customerName,
    signedIn,
}: {
    today: string;
    customerName: string;
    signedIn: boolean;
}) {
    const [date, setDate] = useState(today);
    const [day, setDay] = useState<TurfDay | null>(null);
    const [weekStart, setWeekStart] = useState(today);
    const [weekDays, setWeekDays] = useState<TurfDay[]>([]);
    const [weekError, setWeekError] = useState<string | null>(null);
    const [mode, setMode] = useState<"hourly" | "fixed">("hourly");
    const [startTime, setStartTime] = useState("");
    const [duration, setDuration] = useState(60);
    const [fixedSlotId, setFixedSlotId] = useState("");
    const [name, setName] = useState(customerName);
    const [phone, setPhone] = useState("");
    const [players, setPlayers] = useState(2);
    const [note, setNote] = useState("");
    const [acceptedPolicy, setAcceptedPolicy] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [loadError, setLoadError] = useState<{ date: string; message: string } | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [success, setSuccess] = useState<BookingSuccess | null>(null);

    useEffect(() => {
        let cancelled = false;

        fetch(`/api/turf/day?date=${encodeURIComponent(date)}`, { cache: "no-store" })
            .then(async (response) => {
                const result: unknown = await response.json();
                if (!response.ok) {
                    throw new Error(isRecord(result) && typeof result.error === "string"
                        ? result.error
                        : "Availability could not be loaded.");
                }
                if (!isRecord(result)) throw new Error("Availability response was invalid.");
                const parsed = parseDay(result.day);
                if (!parsed) throw new Error("Availability response was invalid.");
                if (!cancelled) {
                    setDay(parsed);
                    setLoadError(null);
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    setLoadError({
                        date,
                        message: error instanceof Error ? error.message : "Availability could not be loaded.",
                    });
                }
            });
        return () => { cancelled = true; };
    }, [date]);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/turf/week?from=${encodeURIComponent(weekStart)}`, { cache: "no-store" })
            .then(async (response) => {
                const result: unknown = await response.json();
                if (!response.ok) {
                    throw new Error(isRecord(result) && typeof result.error === "string"
                        ? result.error
                        : "Weekly availability could not be loaded.");
                }
                if (!isRecord(result) || !isRecord(result.week) || !Array.isArray(result.week.days)) {
                    throw new Error("Weekly availability response was invalid.");
                }
                const parsed = result.week.days.map(parseDay).filter((item): item is TurfDay => item !== null);
                if (!cancelled) {
                    setWeekDays(parsed);
                    setWeekError(null);
                }
            })
            .catch((error: unknown) => {
                if (!cancelled) setWeekError(error instanceof Error ? error.message : "Weekly availability could not be loaded.");
            });
        return () => { cancelled = true; };
    }, [weekStart]);

    const loading = day?.local_date !== date && loadError?.date !== date;
    const currentLoadError = loadError?.date === date ? loadError.message : null;
    const weeklyOverview = weekDays.map((weekDay) => {
        if (!weekDay.is_open) return { weekDay, label: "Closed" };
        if (!weekDay.booking_enabled) return { weekDay, label: "Unavailable" };
        const hasHourlySlot = getHourlyStartTimes(weekDay).some((start) => {
            const [hour, minute] = start.split(":").map(Number);
            const endMinute = hour * 60 + minute + weekDay.minimum_duration_minutes;
            const end = `${Math.floor(endMinute / 60).toString().padStart(2, "0")}:${(endMinute % 60).toString().padStart(2, "0")}`;
            if (!weekDay.closes_at || end > weekDay.closes_at.slice(0, 5)) return false;
            const from = dhakaTimestamp(weekDay.local_date, start);
            const to = dhakaTimestamp(weekDay.local_date, end);
            return !weekDay.blocked_ranges.some((block) => from < Date.parse(block.ends_at) && to > Date.parse(block.starts_at));
        });
        const hasFixedSlot = weekDay.fixed_slots.some((slot) => {
            const operatingHours = weekDay.opens_at && weekDay.closes_at
                ? {
                    startsAt: `${weekDay.local_date}T${weekDay.opens_at.slice(0, 5)}:00+06:00`,
                    endsAt: `${weekDay.local_date}T${weekDay.closes_at.slice(0, 5)}:00+06:00`,
                }
                : null;
            return getFixedSlotDisplayAvailability({
                startsAt: `${weekDay.local_date}T${slot.starts_at.slice(0, 5)}:00+06:00`,
                endsAt: `${weekDay.local_date}T${slot.ends_at.slice(0, 5)}:00+06:00`,
            }, operatingHours, weekDay.booked_ranges.map((range) => ({
                startsAt: range.starts_at,
                endsAt: range.ends_at,
            })), weekDay.blocked_ranges.map((range) => ({
                startsAt: range.starts_at,
                endsAt: range.ends_at,
            }))) === "available";
        });
        const hasAvailability = hasHourlySlot || hasFixedSlot;
        const hasBookings = weekDay.blocked_ranges.some((block) => block.kind === "booked");
        const hasClosures = weekDay.blocked_ranges.some((block) => block.kind === "unavailable");
        return {
            weekDay,
            label: hasAvailability ? (hasBookings ? "Partially booked" : "Available")
                : hasBookings && !hasClosures ? "Fully booked" : "Unavailable",
        };
    });

    const hourlyTimes = useMemo(() => day ? getHourlyStartTimes(day) : [], [day]);
    const fixedSlot = day?.fixed_slots.find((slot) => slot.id === fixedSlotId) ?? null;
    const hourlyEndTime = useMemo(() => {
        if (!startTime) return "";
        const [hour, minute] = startTime.split(":").map(Number);
        const endMinutes = hour * 60 + minute + duration;
        return `${Math.floor(endMinutes / 60).toString().padStart(2, "0")}:${(endMinutes % 60).toString().padStart(2, "0")}`;
    }, [duration, startTime]);
    const selectedStart = mode === "fixed" ? fixedSlot?.starts_at.slice(0, 5) ?? "" : startTime;
    const selectedEnd = mode === "fixed" ? fixedSlot?.ends_at.slice(0, 5) ?? "" : hourlyEndTime;
    const price = mode === "fixed"
        ? fixedSlot?.price ?? 0
        : day && selectedStart && selectedEnd
            ? day.hourly_rate * duration / 60
            : 0;
    const availableStarts = useMemo(() => {
        if (!day || !day.opens_at || !day.closes_at) return [];
        return hourlyTimes.filter((start) => {
            const [hour, minute] = start.split(":").map(Number);
            const end = `${Math.floor((hour * 60 + minute + duration) / 60).toString().padStart(2, "0")}:${((hour * 60 + minute + duration) % 60).toString().padStart(2, "0")}`;
            if (end > day.closes_at!.slice(0, 5)) return false;
            const fromMs = dhakaTimestamp(date, start);
            const toMs = dhakaTimestamp(date, end);
            return !day.blocked_ranges.some((blocked) =>
                fromMs < Date.parse(blocked.ends_at) && toMs > Date.parse(blocked.starts_at),
            );
        });
    }, [date, day, duration, hourlyTimes]);
    const fixedSlotAvailability = useMemo(() => {
        if (!day) return [];
        const operatingHours = day.is_open && day.opens_at && day.closes_at
            ? {
                startsAt: `${date}T${day.opens_at.slice(0, 5)}:00+06:00`,
                endsAt: `${date}T${day.closes_at.slice(0, 5)}:00+06:00`,
            }
            : null;
        return day.fixed_slots.map((slot) => ({
            slot,
            availability: getFixedSlotDisplayAvailability({
                startsAt: `${date}T${slot.starts_at.slice(0, 5)}:00+06:00`,
                endsAt: `${date}T${slot.ends_at.slice(0, 5)}:00+06:00`,
            }, operatingHours, day.booked_ranges.map((range) => ({
                startsAt: range.starts_at,
                endsAt: range.ends_at,
            })), day.blocked_ranges.map((range) => ({
                startsAt: range.starts_at,
                endsAt: range.ends_at,
            }))),
        }));
    }, [date, day]);
    const selectedFixedSlotIsAvailable = fixedSlotAvailability.some(({ slot, availability }) =>
        slot.id === fixedSlotId && availability === "available",
    );

    async function submitBooking(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!day?.policy || !selectedStart || !selectedEnd || (mode === "fixed" && !selectedFixedSlotIsAvailable)) return;
        setSubmitting(true);
        setSubmitError(null);

        try {
            const response = await fetch("/api/turf/bookings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    startsAt: new Date(dhakaTimestamp(date, selectedStart)).toISOString(),
                    endsAt: new Date(dhakaTimestamp(date, selectedEnd)).toISOString(),
                    mode,
                    customerName: name,
                    customerPhone: phone,
                    playerCount: players,
                    customerNote: note || null,
                    policyVersionId: day.policy.id,
                    policyAccepted: acceptedPolicy,
                    fixedSlotId: mode === "fixed" ? fixedSlotId : null,
                }),
            });
            const result: unknown = await response.json();
            if (!response.ok) {
                throw new Error(isRecord(result) && typeof result.error === "string"
                    ? result.error
                    : "Booking request could not be submitted.");
            }
            if (!isRecord(result) || !isRecord(result.booking)
                || typeof result.booking.reference !== "string"
                || typeof result.booking.tracking_token !== "string"
                || typeof result.booking.status !== "string") {
                throw new Error("Booking was submitted, but its tracking details could not be loaded. Contact The Bubbles with your account.");
            }
            setSuccess({
                reference: result.booking.reference,
                tracking_token: result.booking.tracking_token,
                status: result.booking.status,
            });
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : "Booking request could not be submitted.");
        } finally {
            setSubmitting(false);
        }
    }

    if (success) {
        const trackingUrl = `/turf/booking/${encodeURIComponent(success.reference)}?token=${encodeURIComponent(success.tracking_token)}`;
        return (
            <section className="mt-8 max-w-2xl rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm sm:p-8" role="status">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700" aria-hidden="true">✓</div>
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Request submitted</p>
                <h2 className="mt-2 text-2xl font-black">Your time is held for staff review</h2>
                <p className="mt-2 text-sm leading-6 text-[#597267]">This is not yet a confirmed booking. Staff will review your request and send payment instructions if approved.</p>
                <p className="mt-5 rounded-xl bg-[#f3f8f5] p-4 text-sm">Booking reference <strong className="ml-2 font-mono text-[#087a4a]">{success.reference}</strong></p>
                <Link href={trackingUrl} className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[#087a4a] px-5 font-bold text-white hover:bg-[#06643d]">Track this request</Link>
            </section>
        );
    }

    const bookingAllowed = signedIn && Boolean(day?.booking_enabled && day?.policy && day.is_open);
    const canSubmit = bookingAllowed && Boolean(selectedStart && selectedEnd)
        && (mode !== "fixed" || selectedFixedSlotIsAvailable)
        && acceptedPolicy && name.trim().length > 0 && phone.trim().length > 0
        && players >= (day?.minimum_players ?? 1) && players <= (day?.maximum_players ?? 100);

    return (
        <section className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_0.8fr]">
            <form onSubmit={submitBooking} className="rounded-3xl border border-[#dce8e0] bg-white p-5 shadow-sm sm:p-7">
                <div className="flex items-center justify-between gap-4">
                    <h2 className="text-lg font-extrabold">1. Select date & time</h2>
                    <span className="text-xs font-semibold text-[#6a8176]">Business time · Dhaka</span>
                </div>
                <label className="mt-5 block text-sm font-bold" htmlFor="turf-date">Booking date</label>
                <input id="turf-date" type="date" min={today} value={date} onChange={(event) => {
                    setDate(event.target.value);
                    setWeekStart(event.target.value);
                    setStartTime("");
                    setFixedSlotId("");
                    setAcceptedPolicy(false);
                    setSubmitError(null);
                }}
                    className="mt-2 min-h-12 w-full rounded-xl border border-[#cbd9d0] bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" />

                <section aria-label="Weekly availability" className="mt-4">
                    <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-sm font-bold">Weekly overview</h3>
                        <span className="text-xs text-[#6a8176]">Select a date</span>
                    </div>
                    {weekError ? <p role="alert" className="mb-2 text-xs text-red-700">{weekError}</p> : null}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {weeklyOverview.map(({ weekDay, label }) => {
                            const displayDate = new Date(`${weekDay.local_date}T12:00:00+06:00`);
                            const selected = date === weekDay.local_date;
                            return (
                                <button type="button" key={weekDay.local_date} onClick={() => {
                                    setDate(weekDay.local_date);
                                    setStartTime("");
                                    setFixedSlotId("");
                                    setAcceptedPolicy(false);
                                    setSubmitError(null);
                                }}
                                    aria-pressed={selected}
                                    className={`rounded-xl border p-2.5 text-left transition ${selected ? "border-emerald-700 bg-emerald-50" : "border-[#dce8e0] bg-white hover:border-emerald-500"}`}>
                                    <span className="block text-xs font-bold">{new Intl.DateTimeFormat("en-BD", { timeZone: "Asia/Dhaka", weekday: "short", day: "numeric", month: "short" }).format(displayDate)}</span>
                                    <span className={`mt-1 block text-[10px] font-semibold ${label === "Available" ? "text-emerald-700" : label === "Closed" || label === "Unavailable" ? "text-[#7b5c2c]" : "text-[#546d61]"}`}>{label}</span>
                                </button>
                            );
                        })}
                    </div>
                </section>

                {loading ? <p className="mt-5 rounded-xl bg-[#f4f8f6] p-4 text-sm text-[#597267]" role="status">Checking live availability…</p> : null}
                {currentLoadError ? <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{currentLoadError}</div> : null}
                {day && !loading ? (
                    <>
                        {!day.is_open ? <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">The turf is closed on this date.</p> : null}
                        {day.is_open && !day.booking_enabled ? <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">Online booking is being configured. Please check back soon.</p> : null}
                        {day.is_open && day.booking_enabled ? (
                            <>
                                <div className="mt-5 grid grid-cols-2 rounded-xl bg-[#edf4ef] p-1">
                                    <button type="button" onClick={() => { setMode("hourly"); setFixedSlotId(""); }}
                                        aria-pressed={mode === "hourly"} className={`min-h-10 rounded-lg text-sm font-bold ${mode === "hourly" ? "bg-white text-[#087a4a] shadow-sm" : "text-[#5a7165]"}`}>
                                        Hourly
                                    </button>
                                    <button type="button" onClick={() => { setMode("fixed"); setStartTime(""); }}
                                        aria-pressed={mode === "fixed"} className={`min-h-10 rounded-lg text-sm font-bold ${mode === "fixed" ? "bg-white text-[#087a4a] shadow-sm" : "text-[#5a7165]"}`}>
                                        Fixed slots
                                    </button>
                                </div>

                                {mode === "hourly" ? (
                                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                                        <div>
                                            <label className="block text-sm font-bold" htmlFor="turf-start">Available start</label>
                                            <select id="turf-start" value={startTime} onChange={(event) => setStartTime(event.target.value)}
                                                className="mt-2 min-h-12 w-full rounded-xl border border-[#cbd9d0] bg-white px-3 text-sm">
                                                <option value="">Choose a time</option>
                                                {availableStarts.map((time) => <option key={time} value={time}>{time}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold" htmlFor="turf-duration">Duration</label>
                                            <select id="turf-duration" value={duration} onChange={(event) => { setDuration(Number(event.target.value)); setStartTime(""); }}
                                                className="mt-2 min-h-12 w-full rounded-xl border border-[#cbd9d0] bg-white px-3 text-sm">
                                                {Array.from({ length: 10 }, (_, index) => day.minimum_duration_minutes + index * day.duration_increment_minutes)
                                                    .filter((minutes) => minutes <= 720)
                                                    .map((minutes) => <option key={minutes} value={minutes}>{minutes / 60} {minutes === 60 ? "hour" : "hours"}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mt-5 grid gap-2 sm:grid-cols-2">
                                        {fixedSlotAvailability.length ? fixedSlotAvailability.map(({ slot, availability }) => {
                                            const selected = fixedSlotId === slot.id;
                                            const available = availability === "available" && day.is_open && day.booking_enabled;
                                            const className = availability === "booked"
                                                ? "cursor-not-allowed border-red-400 bg-red-100 text-red-950"
                                                : available
                                                    ? selected
                                                        ? "border-emerald-700 bg-emerald-100 text-emerald-950"
                                                        : "border-emerald-300 bg-emerald-50 text-emerald-950 hover:border-emerald-500"
                                                    : "cursor-not-allowed border-amber-200 bg-amber-50 text-amber-900";
                                            const status = availability === "booked"
                                                ? "Booked"
                                                : available
                                                    ? "Available"
                                                    : "Unavailable";
                                            return (
                                                <button type="button" key={slot.id} disabled={!available} onClick={() => setFixedSlotId(slot.id)}
                                                    aria-pressed={selected} className={`rounded-xl border p-3 text-left transition disabled:opacity-100 ${className}`}>
                                                    <span className="block text-sm font-bold">{slot.label}</span>
                                                    <span className="mt-1 block text-xs">{slot.starts_at.slice(0, 5)}–{slot.ends_at.slice(0, 5)} · {formatPrice(slot.price)}</span>
                                                    <span className="mt-1 block text-xs font-bold">{status}</span>
                                                </button>
                                            );
                                        }) : <p className="col-span-full rounded-xl bg-[#f4f8f6] p-4 text-sm text-[#597267]">No fixed slots are configured for this date.</p>}
                                    </div>
                                )}
                                {mode === "hourly" && !availableStarts.length ? <p className="mt-3 text-sm text-[#7c5b1b]">No available hourly starts for this duration.</p> : null}
                            </>
                        ) : null}
                    </>
                ) : null}

                <div className="my-6 border-t border-[#e8efea]" />
                <h2 className="text-lg font-extrabold">2. Your booking details</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                        <label className="block text-sm font-bold" htmlFor="turf-name">Full name</label>
                        <input id="turf-name" required maxLength={200} value={name} onChange={(event) => setName(event.target.value)}
                            className="mt-2 min-h-12 w-full rounded-xl border border-[#cbd9d0] px-3 text-sm" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold" htmlFor="turf-phone">Contact phone</label>
                        <input id="turf-phone" required type="tel" minLength={8} maxLength={25} value={phone} onChange={(event) => setPhone(event.target.value)}
                            placeholder="+880 1XXXXXXXXX" className="mt-2 min-h-12 w-full rounded-xl border border-[#cbd9d0] px-3 text-sm" />
                    </div>
                </div>
                <div className="mt-4">
                    <label className="block text-sm font-bold" htmlFor="turf-players">Number of players</label>
                    <input id="turf-players" required type="number" min={day?.minimum_players ?? 1} max={day?.maximum_players ?? 100}
                        value={players} onChange={(event) => setPlayers(Number(event.target.value))}
                        className="mt-2 min-h-12 w-full rounded-xl border border-[#cbd9d0] px-3 text-sm sm:max-w-40" />
                    {day ? <p className="mt-1 text-xs text-[#6a8176]">Allowed: {day.minimum_players}–{day.maximum_players} players.</p> : null}
                </div>
                <div className="mt-4">
                    <label className="block text-sm font-bold" htmlFor="turf-note">Additional instructions <span className="font-normal text-[#6a8176]">(optional)</span></label>
                    <textarea id="turf-note" maxLength={2000} rows={3} value={note} onChange={(event) => setNote(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-[#cbd9d0] px-3 py-2 text-sm" />
                </div>
                {day?.policy ? (
                    <details className="mt-5 rounded-xl border border-[#dce8e0] bg-[#f8fbf9] p-4">
                        <summary className="cursor-pointer text-sm font-bold">Booking policy · Version {day.policy.version}</summary>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#536b5f]">{day.policy.content}</p>
                    </details>
                ) : null}
                <label className="mt-4 flex items-start gap-3 text-sm leading-5">
                    <input type="checkbox" checked={acceptedPolicy} onChange={(event) => setAcceptedPolicy(event.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-700" />
                    <span>I accept the current booking policy and understand that this request needs staff approval.</span>
                </label>
                {submitError ? <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{submitError}</p> : null}
                <button type="submit" disabled={!canSubmit || submitting}
                    className="mt-5 min-h-12 w-full rounded-xl bg-[#087a4a] px-5 font-bold text-white transition hover:bg-[#06643d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#a8b8af]">
                    {submitting ? "Submitting request…" : "Request this booking"}
                </button>
                {!signedIn ? <p className="mt-3 text-center text-xs text-[#6a8176]">Sign in with Google above to submit your request.</p> : null}
            </form>

            <aside className="rounded-3xl bg-[#082c22] p-5 text-white shadow-sm sm:p-7">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">Booking summary</p>
                <h2 className="mt-2 text-xl font-extrabold">Review your time</h2>
                <dl className="mt-5 space-y-3 border-t border-white/10 pt-5 text-sm">
                    <div className="flex justify-between gap-4"><dt className="text-white/60">Date</dt><dd className="font-semibold">{date}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-white/60">Time</dt><dd className="font-semibold">{selectedStart && selectedEnd ? `${selectedStart}–${selectedEnd}` : "Choose a slot"}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-white/60">Booking type</dt><dd className="font-semibold">{mode === "hourly" ? "Hourly" : "Fixed slot"}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-white/60">Estimated price</dt><dd className="font-bold text-emerald-200">{formatPrice(price)}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-white/60">Default advance</dt><dd className="font-semibold">{day ? formatPrice(day.advance_amount) : "—"}</dd></div>
                </dl>
                <p className="mt-5 rounded-xl bg-white/[0.07] p-4 text-xs leading-5 text-white/70">
                    Advance payment is due only after staff approve your request. Do not send money before receiving the official payment instructions.
                </p>
                <p className="mt-4 text-xs leading-5 text-white/50">Unavailable times include bookings, closures, and the required 15-minute buffer. Final availability is always checked again when you submit.</p>
            </aside>
        </section>
    );
}
