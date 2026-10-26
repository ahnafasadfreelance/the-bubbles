export type TimeInterval = {
    startsAt: string;
    endsAt: string;
};

export type ProtectedInterval = TimeInterval & {
    kind: "booking" | "closure";
};

export type SlotAvailability = "available" | "booked" | "closed" | "unavailable";

export type BookingStatus =
    | "pending"
    | "approved_awaiting_payment"
    | "payment_under_review"
    | "confirmed"
    | "rejected"
    | "cancelled"
    | "completed"
    | "no_show"
    | "expired";

const BUFFER_MS = 15 * 60 * 1000;

const BOOKING_TRANSITIONS: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = {
    pending: ["approved_awaiting_payment", "rejected", "expired"],
    approved_awaiting_payment: ["payment_under_review", "confirmed", "cancelled", "expired"],
    payment_under_review: ["approved_awaiting_payment", "confirmed", "cancelled", "expired"],
    confirmed: ["cancelled", "completed", "no_show"],
    rejected: [],
    cancelled: [],
    completed: [],
    no_show: [],
    expired: [],
};

function intervalMilliseconds(interval: TimeInterval): { startsAt: number; endsAt: number } {
    const hasTimezone = (value: string) => /(?:z|[+-]\d{2}:\d{2})$/i.test(value);
    const startsAt = Date.parse(interval.startsAt);
    const endsAt = Date.parse(interval.endsAt);

    if (!hasTimezone(interval.startsAt) || !hasTimezone(interval.endsAt)
        || !Number.isFinite(startsAt) || !Number.isFinite(endsAt) || startsAt >= endsAt) {
        throw new RangeError("A time interval must have valid, increasing timestamps.");
    }

    return { startsAt, endsAt };
}

export function isWithinOperatingHours(
    requested: TimeInterval,
    operatingHours: TimeInterval | null,
): boolean {
    if (!operatingHours) return false;

    const requestedTime = intervalMilliseconds(requested);
    const operatingTime = intervalMilliseconds(operatingHours);
    return requestedTime.startsAt >= operatingTime.startsAt
        && requestedTime.endsAt <= operatingTime.endsAt;
}

export function hasReservationConflict(
    requested: TimeInterval,
    existing: readonly TimeInterval[],
): boolean {
    const requestedTime = intervalMilliseconds(requested);
    return existing.some((interval) => {
        const existingTime = intervalMilliseconds(interval);
        return requestedTime.startsAt < existingTime.endsAt + BUFFER_MS
            && requestedTime.endsAt + BUFFER_MS > existingTime.startsAt;
    });
}

export function getSlotAvailability(
    requested: TimeInterval,
    operatingHours: TimeInterval | null,
    protectedIntervals: readonly ProtectedInterval[],
): SlotAvailability {
    if (!operatingHours) return "closed";
    if (!isWithinOperatingHours(requested, operatingHours)) return "unavailable";

    const closures = protectedIntervals.filter((interval) => interval.kind === "closure");
    if (hasReservationConflict(requested, closures)) return "unavailable";

    const bookings = protectedIntervals.filter((interval) => interval.kind === "booking");
    if (hasReservationConflict(requested, bookings)) return "booked";

    return "available";
}

export type SlotRules = {
    mode: "hourly" | "fixed";
    minimumDurationMinutes: number;
    durationIncrementMinutes: number;
    bookingHorizonDays: number;
};

export function validateRequestedSlot(
    requested: TimeInterval,
    rules: SlotRules,
    now: string,
): string[] {
    const slot = intervalMilliseconds(requested);
    const nowMs = Date.parse(now);

    if (!Number.isFinite(nowMs)) throw new RangeError("The current time must be a valid timestamp.");
    if (!/(?:z|[+-]\d{2}:\d{2})$/i.test(now)) {
        throw new RangeError("The current time must include an explicit timezone.");
    }
    if (rules.mode !== "hourly" && rules.mode !== "fixed") {
        throw new RangeError("The booking mode must be hourly or fixed.");
    }
    if (!Number.isInteger(rules.minimumDurationMinutes) || rules.minimumDurationMinutes <= 0) {
        throw new RangeError("The minimum duration must be a positive whole number of minutes.");
    }
    if (!Number.isInteger(rules.durationIncrementMinutes) || rules.durationIncrementMinutes <= 0) {
        throw new RangeError("The duration increment must be a positive whole number of minutes.");
    }
    if (!Number.isInteger(rules.bookingHorizonDays) || rules.bookingHorizonDays < 0) {
        throw new RangeError("The booking horizon must be a non-negative whole number of days.");
    }

    const errors: string[] = [];
    const durationMinutes = (slot.endsAt - slot.startsAt) / 60_000;

    if (slot.startsAt <= nowMs) errors.push("The requested start time must be in the future.");
    if (!Number.isInteger(durationMinutes)) errors.push("The requested duration must use whole minutes.");
    if (durationMinutes < rules.minimumDurationMinutes) {
        errors.push("The requested duration is shorter than the configured minimum.");
    }
    if (rules.mode === "hourly"
        && (durationMinutes - rules.minimumDurationMinutes) % rules.durationIncrementMinutes !== 0) {
        errors.push("The requested duration does not match the configured increments.");
    }
    if (slot.startsAt > nowMs + rules.bookingHorizonDays * 24 * 60 * 60 * 1000) {
        errors.push("The requested start time is beyond the booking horizon.");
    }

    return errors;
}

export function canTransitionBookingStatus(
    from: BookingStatus,
    to: BookingStatus,
    guards: { advanceVerified: boolean } = { advanceVerified: false },
): boolean {
    return BOOKING_TRANSITIONS[from].includes(to)
        && (to !== "confirmed" || guards.advanceVerified);
}
