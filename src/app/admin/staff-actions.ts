"use server";

import { getAdminAccess, hasAdminRole, isUuid, type AdminRole } from "@/lib/admin-auth";
import { canInviteStaffRole } from "@/lib/admin-role-policy";
import { createPrivilegedClient } from "@/lib/supabase/privileged-server";
import type { Json } from "@/types/database";

export type StaffRecord = {
    userId: string;
    email: string;
    role: AdminRole;
    status: "invited" | "active" | "deactivated";
    invitedAt: string | null;
    activatedAt: string | null;
    updatedAt: string;
};

export type StaffAuditRecord = {
    id: number;
    actorId: string | null;
    action: string;
    targetEmail: string | null;
    metadata: Json;
    createdAt: string;
};

type StaffActionResult = { ok: true; existingAccount?: boolean } | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function emailAddress(value: unknown): string | null {
    if (typeof value !== "string" || value.length > 254) return null;
    const email = value.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function isAdminRole(value: unknown): value is AdminRole {
    return value === "owner" || value === "full_admin" || value === "order_management";
}

function isStaffStatus(value: unknown): value is StaffRecord["status"] {
    return value === "invited" || value === "active" || value === "deactivated";
}

function isRpcSuccess(value: unknown): value is { ok: true } {
    return isRecord(value) && value.ok === true;
}

export async function loadStaffAccessAction() {
    const access = await getAdminAccess();
    if (!hasAdminRole(access, "owner", "full_admin")) {
        return { ok: false as const, reason: "unauthorized" as const };
    }

    try {
        const supabase = createPrivilegedClient();
        const [{ data: memberships, error: membershipsError }, auditResult] = await Promise.all([
            supabase.from("restaurant_staff_memberships")
                .select("user_id, email, role, status, invited_at, activated_at, updated_at")
                .eq("restaurant_id", 1)
                .order("created_at", { ascending: false }),
            access.role === "owner"
                ? supabase.from("restaurant_admin_audit_log")
                    .select("id, actor_id, action, target_email, metadata, created_at")
                    .eq("restaurant_id", 1)
                    .order("created_at", { ascending: false })
                    .limit(50)
                : Promise.resolve({ data: [], error: null }),
        ]);
        if (membershipsError || auditResult.error || !memberships || !auditResult.data) {
            return { ok: false as const, reason: "unavailable" as const };
        }
        if (memberships.some((membership) =>
            !isAdminRole(membership.role) || !isStaffStatus(membership.status),
        )) {
            return { ok: false as const, reason: "unavailable" as const };
        }
        return {
            ok: true as const,
            role: access.role,
            actorUserId: access.user.id,
            staff: memberships.map((membership) => ({
                userId: membership.user_id,
                email: membership.email,
                role: membership.role as AdminRole,
                status: membership.status as StaffRecord["status"],
                invitedAt: membership.invited_at,
                activatedAt: membership.activated_at,
                updatedAt: membership.updated_at,
            })),
            audit: auditResult.data.map((event) => ({
                id: event.id,
                actorId: event.actor_id,
                action: event.action,
                targetEmail: event.target_email,
                metadata: event.metadata,
                createdAt: event.created_at,
            })),
        };
    } catch {
        return { ok: false as const, reason: "unavailable" as const };
    }
}

export async function inviteStaffAction(input: unknown): Promise<StaffActionResult> {
    const access = await getAdminAccess();
    if (!hasAdminRole(access, "owner", "full_admin")) {
        return { ok: false, reason: "You are not authorized to invite staff." };
    }
    if (!isRecord(input)) return { ok: false, reason: "Enter a valid email address and role." };
    const email = emailAddress(input.email);
    const role = input.role;
    if (!email || (role !== "full_admin" && role !== "order_management")) {
        return { ok: false, reason: "Enter a valid email address and role." };
    }
    if (!canInviteStaffRole(access.role, role)) {
        return { ok: false, reason: "Only the Owner can invite a Full Admin." };
    }

    try {
        const supabase = createPrivilegedClient();
        const { data: existing, error: lookupError } = await supabase
            .from("restaurant_staff_memberships")
            .select("user_id")
            .eq("restaurant_id", 1)
            .eq("email", email)
            .maybeSingle();
        if (lookupError) return { ok: false, reason: "Staff access could not be checked. Please retry." };
        if (existing) return { ok: false, reason: "This email already has staff access or a pending invitation." };

        const { data: existingAccountResult, error: existingAccountError } = await supabase.rpc(
            "admin_invite_existing_staff_account",
            {
                p_actor_id: access.user.id,
                p_email: email,
                p_role: role,
            },
        );
        if (existingAccountError) {
            return { ok: false, reason: "The existing account could not be checked. Apply the latest staff-access migration and retry." };
        }
        if (isRpcSuccess(existingAccountResult)) return { ok: true, existingAccount: true };
        if (isRecord(existingAccountResult) && existingAccountResult.reason === "duplicate") {
            return { ok: false, reason: "This email already has staff access or a pending invitation." };
        }
        if (isRecord(existingAccountResult) && existingAccountResult.reason === "unconfirmed") {
            return { ok: false, reason: "This Supabase account has not verified its email yet. Ask the account holder to verify it, then try again." };
        }
        if (!isRecord(existingAccountResult) || existingAccountResult.reason !== "no_account") {
            if (isRecord(existingAccountResult) && existingAccountResult.reason === "unauthorized") {
                return { ok: false, reason: "Your staff permissions changed. Refresh the page and try again." };
            }
            return { ok: false, reason: "The existing account could not be granted access. Please retry or contact the Owner." };
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
        if (!appUrl) return { ok: false, reason: "Staff invitations are not configured. Set NEXT_PUBLIC_APP_URL." };
        let redirectTo: string;
        try {
            const site = new URL(appUrl);
            if (site.protocol !== "https:" && site.hostname !== "localhost" && site.hostname !== "127.0.0.1") {
                return { ok: false, reason: "The configured application URL must use HTTPS." };
            }
            const callback = new URL("/auth/callback", site.origin);
            callback.searchParams.set("next", "/admin/staff");
            redirectTo = callback.toString();
        } catch {
            return { ok: false, reason: "The configured application URL is invalid." };
        }

        const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo });
        if (error || !data.user) {
            const message = error?.message.toLowerCase() ?? "";
            if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
                return { ok: false, reason: "Supabase reports an existing account, but it could not be matched to a confirmed account. Verify the email and try again." };
            }
            return { ok: false, reason: "Supabase could not send the invitation. Check the Auth email configuration and try again." };
        }

        const { data: result, error: insertError } = await supabase.rpc("admin_create_staff_invitation", {
            p_actor_id: access.user.id,
            p_user_id: data.user.id,
            p_email: email,
            p_role: role,
        });
        if (insertError || !isRpcSuccess(result)) {
            if (isRecord(result) && result.reason === "duplicate") {
                return { ok: false, reason: "This email already has staff access or a pending invitation." };
            }
            if (isRecord(result) && result.reason === "unauthorized") {
                return { ok: false, reason: "Your staff permissions changed. Refresh the page and try again." };
            }
            return { ok: false, reason: "The invitation email was sent, but staff access could not be recorded. Contact the Owner before inviting this address again." };
        }
        return { ok: true };
    } catch {
        return { ok: false, reason: "The invitation could not be sent. Please retry or contact the Owner." };
    }
}

export async function updateStaffAccessAction(input: unknown): Promise<StaffActionResult> {
    const access = await getAdminAccess();
    if (!hasAdminRole(access, "owner", "full_admin")) {
        return { ok: false, reason: "You are not authorized to manage staff access." };
    }
    if (!isRecord(input) || !isUuid(input.userId)) {
        return { ok: false, reason: "Invalid staff member." };
    }
    const role = input.role === undefined ? null : input.role;
    const status = input.status === undefined ? null : input.status;
    if ((role !== null && (role !== "full_admin" && role !== "order_management"))
        || (status !== null && status !== "active" && status !== "deactivated")
        || (role === null && status === null)) {
        return { ok: false, reason: "Invalid staff access change." };
    }
    if (role !== null && !canInviteStaffRole(access.role, role)) {
        return { ok: false, reason: "Only the Owner can grant Full Admin access." };
    }
    try {
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase.rpc("admin_update_staff_membership", {
            p_actor_id: access.user.id,
            p_target_user_id: input.userId,
            p_role: role,
            p_status: status,
        });
        if (error || !isRpcSuccess(data)) {
            if (isRecord(data) && data.reason === "self_change") {
                return { ok: false, reason: "You cannot change your own staff access." };
            }
            if (isRecord(data) && data.reason === "unauthorized") {
                return { ok: false, reason: "Only the Owner can change Full Admin access. Refresh the page and try again." };
            }
            if (isRecord(data) && data.reason === "not_found") {
                return { ok: false, reason: "This staff membership could not be found." };
            }
            return { ok: false, reason: "The access change was rejected. Refresh the staff list and try again." };
        }
        return { ok: true };
    } catch {
        return { ok: false, reason: "The staff access change could not be saved." };
    }
}
