"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAdminAccess, hasAdminRole, isUuid } from "@/lib/admin-auth";
import { getAdminDashboard, getOrderManagementDashboard, getPreparationEstimateRange, parseDashboardFilters } from "@/lib/admin-data";
import { canTransitionOrder, isOrderStatus, type OrderStatus } from "@/lib/order-status";
import { createPrivilegedClient } from "@/lib/supabase/privileged-server";
import { createClient } from "@/lib/supabase/server";

type ActionResult =
    | { ok: true; order: { id: string; order_number: string; status: OrderStatus; updated_at: string; rejection_reason: string | null; estimated_preparation_minutes: number | null; preparation_started_at: string | null; estimated_ready_at: string | null } }
    | { ok: false; reason: "unauthorized" | "invalid" | "not_found" | "stale" | "invalid_transition" | "unavailable"; currentStatus?: OrderStatus };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTransitionResult(value: unknown): ActionResult {
    if (!isRecord(value) || typeof value.ok !== "boolean") return { ok: false, reason: "unavailable" };
    if (
        value.ok
        && isRecord(value.order)
        && typeof value.order.id === "string"
        && typeof value.order.order_number === "string"
        && isOrderStatus(value.order.status)
        && typeof value.order.updated_at === "string"
        && (value.order.rejection_reason === null || typeof value.order.rejection_reason === "string")
        && (value.order.estimated_preparation_minutes === null || typeof value.order.estimated_preparation_minutes === "number")
        && (value.order.preparation_started_at === null || typeof value.order.preparation_started_at === "string")
        && (value.order.estimated_ready_at === null || typeof value.order.estimated_ready_at === "string")
    ) {
        return {
            ok: true,
            order: {
                id: value.order.id,
                order_number: value.order.order_number,
                status: value.order.status,
                updated_at: value.order.updated_at,
                rejection_reason: value.order.rejection_reason,
                estimated_preparation_minutes: value.order.estimated_preparation_minutes,
                preparation_started_at: value.order.preparation_started_at,
                estimated_ready_at: value.order.estimated_ready_at,
            },
        };
    }
    if (value.reason === "not_found") return { ok: false, reason: "not_found" };
    if (value.reason === "stale") {
        return {
            ok: false,
            reason: "stale",
            ...(isOrderStatus(value.current_status) ? { currentStatus: value.current_status } : {}),
        };
    }
    if (value.reason === "invalid_transition" || value.reason === "invalid_status") {
        return {
            ok: false,
            reason: "invalid_transition",
            ...(isOrderStatus(value.current_status) ? { currentStatus: value.current_status } : {}),
        };
    }
    return { ok: false, reason: "unavailable" };
}

export async function loadAdminDashboardAction(filtersInput: unknown) {
    const access = await getAdminAccess();
    if (!hasAdminRole(access, "owner", "full_admin")) return { ok: false as const, reason: "unauthorized" as const };
    const filters = parseDashboardFilters(filtersInput);
    if (!filters) return { ok: false as const, reason: "invalid" as const };
    return getAdminDashboard(filters);
}

export async function loadOrderManagementDashboardAction(filtersInput: unknown) {
    const access = await getAdminAccess();
    if (!hasAdminRole(access, "order_management")) return { ok: false as const, reason: "unauthorized" as const };
    const filters = parseDashboardFilters(filtersInput);
    if (!filters) return { ok: false as const, reason: "invalid" as const };
    return getOrderManagementDashboard(filters);
}

export async function transitionAdminOrderAction(input: unknown): Promise<ActionResult> {
    const access = await getAdminAccess();
    if (!hasAdminRole(access, "owner", "full_admin", "order_management")) return { ok: false, reason: "unauthorized" };
    if (!isRecord(input)) return { ok: false, reason: "invalid" };

    const { orderId, expectedStatus, nextStatus, rejectionReason } = input;
    const estimateRange = getPreparationEstimateRange();
    if (
        !isUuid(orderId)
        || !isOrderStatus(expectedStatus)
        || !isOrderStatus(nextStatus)
        || !canTransitionOrder(expectedStatus, nextStatus)
        || (rejectionReason !== undefined && rejectionReason !== null && (
            typeof rejectionReason !== "string"
            || rejectionReason.length > 300
            || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(rejectionReason)
        ))
    ) return { ok: false, reason: "invalid" };

    try {
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase.rpc("admin_transition_order", {
            p_order_id: orderId,
            p_expected_status: expectedStatus,
            p_next_status: nextStatus,
            p_rejection_reason: typeof rejectionReason === "string" ? rejectionReason.trim() || null : null,
            p_min_minutes: estimateRange.min,
            p_max_minutes: estimateRange.max,
        });
        if (error) return { ok: false, reason: "unavailable" };
        const result = parseTransitionResult(data);
        if (result.ok) revalidatePath("/admin");
        return result;
    } catch {
        return { ok: false, reason: "unavailable" };
    }
}

export async function setAdminPreparationEstimateAction(input: unknown): Promise<ActionResult> {
    const access = await getAdminAccess();
    if (!hasAdminRole(access, "owner", "full_admin", "order_management")) return { ok: false, reason: "unauthorized" };
    if (!isRecord(input)) return { ok: false, reason: "invalid" };

    const { orderId, expectedStatus, minutes } = input;
    const estimateRange = getPreparationEstimateRange();
    if (
        !isUuid(orderId)
        || !isOrderStatus(expectedStatus)
        || (expectedStatus !== "confirmed" && expectedStatus !== "preparing")
        || !Number.isInteger(minutes)
        || (minutes as number) < estimateRange.min
        || (minutes as number) > estimateRange.max
    ) return { ok: false, reason: "invalid" };

    try {
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase.rpc("admin_set_preparation_estimate", {
            p_order_id: orderId,
            p_expected_status: expectedStatus,
            p_minutes: minutes as number,
            p_min_minutes: estimateRange.min,
            p_max_minutes: estimateRange.max,
        });
        if (error) return { ok: false, reason: "unavailable" };
        const result = parseTransitionResult(data);
        if (result.ok) revalidatePath("/admin");
        return result;
    } catch {
        return { ok: false, reason: "unavailable" };
    }
}

export async function adminSignOutAction() {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/");
}