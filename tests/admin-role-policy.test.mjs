import assert from "node:assert/strict";
import test from "node:test";
import { canInviteStaffRole, canManageStaffMember, canRecordOrderPayment, hasAdminRole } from "../src/lib/admin-role-policy.ts";

test("role checks require an authorized membership with a permitted role", () => {
    assert.equal(hasAdminRole({ kind: "authorized", role: "owner" }, "owner", "full_admin"), true);
    assert.equal(hasAdminRole({ kind: "authorized", role: "order_management" }, "owner", "full_admin"), false);
    assert.equal(hasAdminRole({ kind: "forbidden", role: "owner" }, "owner"), false);
    assert.equal(hasAdminRole({ kind: "authorized" }, "owner"), false);
});

test("only Owner can invite Full Admin; Owner and Full Admin can invite Order Management", () => {
    assert.equal(canInviteStaffRole("owner", "full_admin"), true);
    assert.equal(canInviteStaffRole("full_admin", "full_admin"), false);
    assert.equal(canInviteStaffRole("owner", "order_management"), true);
    assert.equal(canInviteStaffRole("full_admin", "order_management"), true);
    assert.equal(canInviteStaffRole("order_management", "order_management"), false);
});

test("staff-management actions protect Owner accounts and prevent self-management", () => {
    assert.equal(canManageStaffMember("owner", "full_admin", "owner-id", "admin-id"), true);
    assert.equal(canManageStaffMember("owner", "order_management", "owner-id", "staff-id"), true);
    assert.equal(canManageStaffMember("full_admin", "order_management", "admin-id", "staff-id"), true);
    assert.equal(canManageStaffMember("full_admin", "full_admin", "admin-id", "other-admin-id"), false);
    assert.equal(canManageStaffMember("order_management", "order_management", "staff-id", "other-staff-id"), false);
    assert.equal(canManageStaffMember("owner", "owner", "owner-id", "other-owner-id"), false);
    assert.equal(canManageStaffMember("owner", "order_management", "owner-id", "owner-id"), false);
});

test("all three authorized roles may record a verified order payment", () => {
    assert.equal(canRecordOrderPayment("owner"), true);
    assert.equal(canRecordOrderPayment("full_admin"), true);
    assert.equal(canRecordOrderPayment("order_management"), true);
});
