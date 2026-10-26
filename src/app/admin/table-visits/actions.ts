"use server";

import { revalidatePath } from "next/cache";

import { getAdminAccess, isUuid } from "@/lib/admin-auth";
import { getAdminTableVisitRequestCount, getAdminTableVisits } from "@/lib/table-visit-admin";
import { createPrivilegedClient } from "@/lib/supabase/privileged-server";
import { customerIdentityFromUser } from "@/lib/supabase/identity";

type ActionResult = { ok: true } | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidText(value: unknown, max: number): value is string {
    return typeof value === "string"
        && value.trim().length > 0
        && value.trim().length <= max
        && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}

function resultOk(value: unknown) {
    return isRecord(value) && value.ok === true;
}

async function authorized() {
    return getAdminAccess();
}

export async function loadAdminTableVisitsAction() {
    if ((await authorized()).kind !== "authorized") {
        return { ok: false as const, reason: "unauthorized" as const };
    }
    return getAdminTableVisits();
}

export async function loadAdminTableVisitRequestCountAction() {
    if ((await authorized()).kind !== "authorized") {
        return { ok: false as const, reason: "unauthorized" as const };
    }
    return getAdminTableVisitRequestCount();
}

export async function replyToTableVisitAction(input: unknown): Promise<ActionResult> {
    const access = await authorized();
    if (access.kind !== "authorized") return { ok: false, reason: "You are not authorized to reply." };
    if (!isRecord(input) || !isUuid(input.visitId) || !isValidText(input.body, 1000)) {
        return { ok: false, reason: "Enter a valid reply." };
    }
    try {
        const identity = customerIdentityFromUser(access.user);
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase.rpc("admin_reply_to_table_visit", {
            p_visit_id: input.visitId,
            p_staff_id: access.user.id,
            p_staff_name: (identity.displayName || identity.email || "Restaurant staff").slice(0, 80),
            p_body: input.body.trim(),
        });
        if (error || !resultOk(data)) return { ok: false, reason: "The reply could not be sent. The visit may have ended." };
        revalidatePath("/admin/table-visits");
        return { ok: true };
    } catch {
        return { ok: false, reason: "The reply could not be sent." };
    }
}

export async function updateTableVisitRequestAction(input: unknown): Promise<ActionResult> {
    if ((await authorized()).kind !== "authorized") return { ok: false, reason: "You are not authorized to update requests." };
    if (!isRecord(input) || !isUuid(input.requestId) || (input.status !== "acknowledged" && input.status !== "resolved")) {
        return { ok: false, reason: "Invalid request update." };
    }
    try {
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase.rpc("admin_update_table_support_request", {
            p_request_id: input.requestId,
            p_status: input.status,
        });
        if (error || !resultOk(data)) return { ok: false, reason: "The request could not be updated. The visit may have ended." };
        revalidatePath("/admin/table-visits");
        return { ok: true };
    } catch {
        return { ok: false, reason: "The request could not be updated." };
    }
}

export async function closeTableVisitAction(visitId: unknown): Promise<ActionResult> {
    if ((await authorized()).kind !== "authorized") return { ok: false, reason: "You are not authorized to close visits." };
    if (!isUuid(visitId)) return { ok: false, reason: "Invalid table visit." };
    try {
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase.rpc("admin_close_table_visit", { p_visit_id: visitId });
        if (error || !resultOk(data)) return { ok: false, reason: "The visit could not be closed." };
        revalidatePath("/admin/table-visits");
        return { ok: true };
    } catch {
        return { ok: false, reason: "The visit could not be closed." };
    }
}
