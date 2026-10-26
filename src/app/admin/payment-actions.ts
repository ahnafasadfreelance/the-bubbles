"use server";

import { revalidatePath } from "next/cache";

import { getAdminAccess, isUuid } from "@/lib/admin-auth";
import { canRecordOrderPayment } from "@/lib/admin-role-policy";
import { isPaymentMethod } from "@/lib/payment";
import { createPrivilegedClient } from "@/lib/supabase/privileged-server";

export type RecordOrderPaymentResult =
    | { ok: true; duplicate: boolean; amount: number; collectedAt: string }
    | { ok: false; reason: "unauthorized" | "invalid" | "not_found" | "amount_exceeds_balance" | "not_collectable" | "unavailable" };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function recordOrderPaymentAction(input: unknown): Promise<RecordOrderPaymentResult> {
    const access = await getAdminAccess();
    if (access.kind !== "authorized" || !canRecordOrderPayment(access.role)) return { ok: false, reason: "unauthorized" };
    if (!isRecord(input)) return { ok: false, reason: "invalid" };

    const { orderId, amount, paymentMethod, notes, idempotencyKey } = input;
    if (
        !isUuid(orderId)
        || typeof amount !== "number"
        || !Number.isFinite(amount)
        || amount <= 0
        || Number(amount.toFixed(2)) !== amount
        || !isPaymentMethod(paymentMethod)
        || typeof idempotencyKey !== "string"
        || !isUuid(idempotencyKey)
        || (notes !== undefined && notes !== null && (
            typeof notes !== "string"
            || notes.length > 300
            || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(notes)
        ))
    ) return { ok: false, reason: "invalid" };

    try {
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase.rpc("admin_record_order_payment", {
            p_order_id: orderId,
            p_staff_id: access.user.id,
            p_amount: amount,
            p_payment_method: paymentMethod,
            p_notes: typeof notes === "string" ? notes.trim() || null : null,
            p_idempotency_key: idempotencyKey,
        });
        if (error || !isRecord(data) || typeof data.ok !== "boolean") {
            return { ok: false, reason: "unavailable" };
        }
        if (data.ok) {
            if (
                typeof data.duplicate !== "boolean"
                || typeof data.amount !== "number"
                || typeof data.collected_at !== "string"
            ) return { ok: false, reason: "unavailable" };
            revalidatePath("/admin");
            revalidatePath("/admin/orders");
            return {
                ok: true,
                duplicate: data.duplicate,
                amount: data.amount,
                collectedAt: data.collected_at,
            };
        }
        if (data.reason === "not_found" || data.reason === "amount_exceeds_balance" || data.reason === "not_collectable") {
            return { ok: false, reason: data.reason };
        }
        return { ok: false, reason: "unavailable" };
    } catch {
        return { ok: false, reason: "unavailable" };
    }
}
