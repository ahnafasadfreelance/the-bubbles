"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { CartItem } from "@/components/cart-provider";
import { getCurrentOrderingSessionProof } from "@/lib/ordering-session";
import { getCurrentTableContext } from "@/lib/table-context";
import { createPrivilegedClient } from "@/lib/supabase/privileged-server";
import { getCurrentUser } from "@/lib/supabase/auth-server";
import { isPaymentMethod } from "@/lib/payment";
import type { Json } from "@/types/database";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PlaceOrderResult =
    | { ok: true; orderId: string; orderNumber: string }
    | { ok: false; reason: "table_required" | "ordering_session_expired" | "invalid_cart" | "item_unavailable" | "price_changed" | "menu_unavailable" | "ordering_unavailable" | "restaurant_closed" | "dine_in_unavailable" | "error" };

function safeCartItems(value: unknown): CartItem[] | null {
    if (!Array.isArray(value) || value.length < 1 || value.length > 30) return null;
    const seen = new Set<string>();
    const items: CartItem[] = [];

    for (const candidate of value) {
        if (!candidate || typeof candidate !== "object") return null;
        const item = candidate as Partial<CartItem>;
        if (
            typeof item.menuItemId !== "string"
            || !UUID_PATTERN.test(item.menuItemId)
            || seen.has(item.menuItemId)
            || !Number.isInteger(item.quantity)
            || (item.quantity ?? 0) < 1
            || (item.quantity ?? 0) > 20
            || typeof item.specialInstructions !== "string"
            || item.specialInstructions.length > 500
            || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(item.specialInstructions)
            || typeof item.observedUnitPrice !== "number"
            || !Number.isFinite(item.observedUnitPrice)
            || item.observedUnitPrice < 0
            || item.observedUnitPrice > 99_999_999
        ) return null;
        seen.add(item.menuItemId);
        items.push({
            menuItemId: item.menuItemId,
            quantity: item.quantity!,
            specialInstructions: item.specialInstructions.trim(),
            observedUnitPrice: item.observedUnitPrice,
        });
    }
    return items;
}

type PlaceOrderInput = {
    items?: unknown;
    customerNote?: unknown;
    idempotencyKey?: unknown;
    boundTableId?: unknown;
    preferredPaymentMethod?: unknown;
};

export async function placeOrderAction(input: unknown): Promise<PlaceOrderResult> {
    const user = await getCurrentUser();
    if (!user) redirect("/login?next=%2Fcart");

    const table = await getCurrentTableContext();
    if (!table) return { ok: false, reason: "table_required" };
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return { ok: false, reason: "invalid_cart" };
    }
    const orderInput = input as PlaceOrderInput;
    if (orderInput.boundTableId !== table.tableId) return { ok: false, reason: "table_required" };
    if (!isPaymentMethod(orderInput.preferredPaymentMethod)) return { ok: false, reason: "invalid_cart" };

    const items = safeCartItems(orderInput.items);
    if (!items || typeof orderInput.idempotencyKey !== "string" || !UUID_PATTERN.test(orderInput.idempotencyKey)) {
        return { ok: false, reason: "invalid_cart" };
    }
    if (
        orderInput.customerNote !== undefined
        && (typeof orderInput.customerNote !== "string"
            || orderInput.customerNote.length > 1000
            || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(orderInput.customerNote))
    ) return { ok: false, reason: "invalid_cart" };

    const trustedItems: Json[] = items.map((item) => ({
        menu_item_id: item.menuItemId,
        quantity: item.quantity,
        special_instructions: item.specialInstructions || null,
        expected_unit_price: item.observedUnitPrice,
    }));

    try {
        const orderingSession = await getCurrentOrderingSessionProof(table.tableId);
        if (!orderingSession) return { ok: false, reason: "ordering_session_expired" };

        const supabase = createPrivilegedClient();
        const { data, error } = await supabase.rpc("create_dine_in_order_with_payment", {
            p_customer_id: user.id,
            p_table_id: table.tableId,
            p_idempotency_key: orderInput.idempotencyKey,
            p_items: trustedItems,
            p_customer_note: typeof orderInput.customerNote === "string" ? orderInput.customerNote.trim() || null : null,
            p_session_id: orderingSession.proof.id,
            p_session_token_hash: orderingSession.proof.tokenHash,
            p_preferred_payment_method: orderInput.preferredPaymentMethod,
        });

        if (error) {
            if (error.message.includes("ORDERING_SESSION_EXPIRED")) return { ok: false, reason: "ordering_session_expired" };
            if (error.message.includes("PRICE_CHANGED")) return { ok: false, reason: "price_changed" };
            if (error.message.includes("ITEM_UNAVAILABLE")) return { ok: false, reason: "item_unavailable" };
            if (error.message.includes("TABLE_UNAVAILABLE")) return { ok: false, reason: "table_required" };
            if (error.message.includes("MENU_UNAVAILABLE")) return { ok: false, reason: "menu_unavailable" };
            if (error.message.includes("ORDERING_UNAVAILABLE")) return { ok: false, reason: "ordering_unavailable" };
            if (error.message.includes("DINE_IN_UNAVAILABLE")) return { ok: false, reason: "dine_in_unavailable" };
            if (error.message.includes("RESTAURANT_CLOSED")) return { ok: false, reason: "restaurant_closed" };
            return { ok: false, reason: "error" };
        }

        if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, reason: "error" };
        const result = data as { id?: unknown; order_number?: unknown };
        if (
            typeof result.id !== "string"
            || !UUID_PATTERN.test(result.id)
            || typeof result.order_number !== "string"
        ) return { ok: false, reason: "error" };

        revalidatePath("/my-orders");
        return { ok: true, orderId: result.id, orderNumber: result.order_number };
    } catch {
        return { ok: false, reason: "error" };
    }
}

export type CancelOrderResult = "cancelled" | "not_cancellable" | "not_found" | "error";

export async function cancelCustomerOrderAction(orderId: string): Promise<CancelOrderResult> {
    const user = await getCurrentUser();
    if (!user) redirect(`/login?next=${encodeURIComponent(`/orders/${orderId}`)}`);
    if (!UUID_PATTERN.test(orderId)) return "not_found";

    try {
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase.rpc("cancel_customer_order", {
            p_customer_id: user.id,
            p_order_id: orderId,
        });
        if (error) return "error";
        if (data !== "cancelled" && data !== "not_cancellable" && data !== "not_found") return "error";

        revalidatePath(`/orders/${orderId}`);
        revalidatePath("/my-orders");
        return data;
    } catch {
        return "error";
    }
}