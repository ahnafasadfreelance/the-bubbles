import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type CustomerOrder = Pick<
    Database["public"]["Tables"]["orders"]["Row"],
    | "id"
    | "order_number"
    | "table_number_snapshot"
    | "table_name_snapshot"
    | "status"
    | "subtotal"
    | "discount_total"
    | "total"
    | "currency"
    | "payment_method"
    | "payment_status"
    | "preferred_payment_method"
    | "amount_paid"
    | "customer_note"
    | "rejection_reason"
    | "estimated_preparation_minutes"
    | "preparation_started_at"
    | "estimated_ready_at"
    | "created_at"
    | "updated_at"
>;

export type CustomerOrderItem = Pick<
    Database["public"]["Tables"]["order_items"]["Row"],
    | "id"
    | "item_name"
    | "unit_price"
    | "quantity"
    | "line_total"
    | "special_instructions"
>;

export type OrderReadResult<T> = { data: T; error: false } | { data: null; error: true };

const ORDER_SELECT = "id, order_number, table_number_snapshot, table_name_snapshot, status, subtotal, discount_total, total, currency, payment_method, preferred_payment_method, amount_paid, payment_status, customer_note, rejection_reason, estimated_preparation_minutes, preparation_started_at, estimated_ready_at, created_at, updated_at";
const ITEM_SELECT = "id, item_name, unit_price, quantity, line_total, special_instructions";

export async function getCustomerOrders(customerId: string): Promise<OrderReadResult<CustomerOrder[]>> {
    try {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("orders")
            .select(ORDER_SELECT)
            .eq("customer_id", customerId)
            .order("created_at", { ascending: false })
            .limit(50);
        return error || !data ? { data: null, error: true } : { data, error: false };
    } catch {
        return { data: null, error: true };
    }
}

export async function getCustomerOrder(
    orderId: string,
    customerId: string,
): Promise<OrderReadResult<{ order: CustomerOrder; items: CustomerOrderItem[] } | null>> {
    try {
        const supabase = await createClient();
        const { data: order, error: orderError } = await supabase
            .from("orders")
            .select(ORDER_SELECT)
            .eq("id", orderId)
            .eq("customer_id", customerId)
            .maybeSingle();
        if (orderError) return { data: null, error: true };
        if (!order) return { data: null, error: false };

        const { data: items, error: itemsError } = await supabase
            .from("order_items")
            .select(ITEM_SELECT)
            .eq("order_id", orderId)
            .order("created_at", { ascending: true });
        if (itemsError || !items) return { data: null, error: true };
        return { data: { order, items }, error: false };
    } catch {
        return { data: null, error: true };
    }
}