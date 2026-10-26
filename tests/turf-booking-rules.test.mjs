import assert from "node:assert/strict";
import test from "node:test";
import {
    canTransitionBookingStatus,
    getSlotAvailability,
    hasReservationConflict,
    isWithinOperatingHours,
    validateRequestedSlot,
} from "../src/lib/turf/booking-rules.ts";

const operatingHours = {
    startsAt: "2026-10-26T09:00:00+06:00",
    endsAt: "2026-10-26T22:00:00+06:00",
};

test("operating hours must contain the complete requested interval", () => {
    assert.equal(isWithinOperatingHours({
        startsAt: "2026-10-26T10:00:00+06:00",
        endsAt: "2026-10-26T11:00:00+06:00",
    }, operatingHours), true);
    assert.equal(isWithinOperatingHours({
        startsAt: "2026-10-26T21:30:00+06:00",
        endsAt: "2026-10-26T22:30:00+06:00",
    }, operatingHours), false);
    assert.equal(isWithinOperatingHours({
        startsAt: "2026-10-26T10:00:00+06:00",
        endsAt: "2026-10-26T11:00:00+06:00",
    }, null), false);
});

test("buffer is required on both sides of a protected booking", () => {
    const booking = {
        startsAt: "2026-10-26T11:00:00+06:00",
        endsAt: "2026-10-26T12:00:00+06:00",
    };
    assert.equal(hasReservationConflict({
        startsAt: "2026-10-26T10:30:00+06:00",
        endsAt: "2026-10-26T11:00:00+06:00",
    }, [booking]), true);
    assert.equal(hasReservationConflict({
        startsAt: "2026-10-26T10:00:00+06:00",
        endsAt: "2026-10-26T10:30:00+06:00",
    }, [booking]), false);
    assert.equal(hasReservationConflict({
        startsAt: "2026-10-26T12:00:00+06:00",
        endsAt: "2026-10-26T12:30:00+06:00",
    }, [booking]), true);
    assert.equal(hasReservationConflict({
        startsAt: "2026-10-26T12:30:00+06:00",
        endsAt: "2026-10-26T13:00:00+06:00",
    }, [booking]), false);
});

test("slot availability distinguishes bookings, closures, closed days and outside-hours times", () => {
    const requested = {
        startsAt: "2026-10-26T11:00:00+06:00",
        endsAt: "2026-10-26T12:00:00+06:00",
    };
    assert.equal(getSlotAvailability(requested, null, []), "closed");
    assert.equal(getSlotAvailability(requested, operatingHours, [{
        ...requested,
        kind: "booking",
    }]), "booked");
    assert.equal(getSlotAvailability(requested, operatingHours, [{
        ...requested,
        kind: "closure",
    }]), "unavailable");
    assert.equal(getSlotAvailability({
        startsAt: "2026-10-26T22:00:00+06:00",
        endsAt: "2026-10-26T23:00:00+06:00",
    }, operatingHours, []), "unavailable");
    assert.equal(getSlotAvailability(requested, operatingHours, []), "available");
});

test("requested duration, increment, future start and booking horizon are validated", () => {
    const rules = {
        mode: "hourly",
        minimumDurationMinutes: 60,
        durationIncrementMinutes: 30,
        bookingHorizonDays: 30,
    };
    assert.deepEqual(validateRequestedSlot({
        startsAt: "2026-10-27T10:00:00+06:00",
        endsAt: "2026-10-27T11:30:00+06:00",
    }, rules, "2026-10-26T09:00:00+06:00"), []);
    assert.deepEqual(validateRequestedSlot({
        startsAt: "2026-10-27T10:00:00+06:00",
        endsAt: "2026-10-27T11:45:00+06:00",
    }, rules, "2026-10-26T09:00:00+06:00"), [
        "The requested duration does not match the configured increments.",
    ]);
    assert.deepEqual(validateRequestedSlot({
        startsAt: "2026-12-01T10:00:00+06:00",
        endsAt: "2026-12-01T11:00:00+06:00",
    }, rules, "2026-10-26T09:00:00+06:00"), [
        "The requested start time is beyond the booking horizon.",
    ]);
    assert.deepEqual(validateRequestedSlot({
        startsAt: "2026-10-26T08:00:00+06:00",
        endsAt: "2026-10-26T08:30:00+06:00",
    }, rules, "2026-10-26T09:00:00+06:00"), [
        "The requested start time must be in the future.",
        "The requested duration is shorter than the configured minimum.",
    ]);
});

test("fixed slots skip hourly duration increments but still enforce minimum duration", () => {
    assert.deepEqual(validateRequestedSlot({
        startsAt: "2026-10-27T10:00:00+06:00",
        endsAt: "2026-10-27T11:15:00+06:00",
    }, {
        mode: "fixed",
        minimumDurationMinutes: 60,
        durationIncrementMinutes: 30,
        bookingHorizonDays: 30,
    }, "2026-10-26T09:00:00+06:00"), []);
});

test("booking state transitions do not allow approval to bypass verified payment", () => {
    assert.equal(canTransitionBookingStatus("pending", "approved_awaiting_payment"), true);
    assert.equal(canTransitionBookingStatus("pending", "confirmed", { advanceVerified: true }), false);
    assert.equal(canTransitionBookingStatus("approved_awaiting_payment", "confirmed"), false);
    assert.equal(canTransitionBookingStatus("approved_awaiting_payment", "confirmed", { advanceVerified: true }), true);
    assert.equal(canTransitionBookingStatus("rejected", "confirmed"), false);
    assert.equal(canTransitionBookingStatus("completed", "confirmed"), false);
});

test("invalid intervals and configuration fail explicitly", () => {
    assert.throws(() => hasReservationConflict({
        startsAt: "invalid",
        endsAt: "2026-10-26T12:00:00+06:00",
    }, []), RangeError);
    assert.throws(() => validateRequestedSlot({
        startsAt: "2026-10-26T10:00:00+06:00",
        endsAt: "2026-10-26T11:00:00+06:00",
    }, {
        mode: "hourly",
        minimumDurationMinutes: 0,
        durationIncrementMinutes: 30,
        bookingHorizonDays: 30,
    }, "2026-10-26T09:00:00+06:00"), RangeError);
    assert.throws(() => isWithinOperatingHours({
        startsAt: "2026-10-26T10:00:00",
        endsAt: "2026-10-26T11:00:00",
    }, operatingHours), RangeError);
});
