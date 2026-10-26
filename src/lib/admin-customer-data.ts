import "server-only";

import { getAdminAccess, hasAdminRole } from "@/lib/admin-auth";
import { createPrivilegedClient } from "@/lib/supabase/privileged-server";
import { isOrderStatus, type OrderStatus } from "@/lib/order-status";
import type { Json } from "@/types/database";

const CUSTOMER_SORTS = ["newest", "oldest", "most_orders", "highest_spending", "recent_activity"] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export type AdminCustomer = {
    id: string;
    name: string;
    email: string | null;
    avatar_url: string | null;
    created_at: string;
    total_orders: number;
    total_spending_by_currency: Record<string, number>;
    spending_orders_by_currency: Record<string, number>;
    last_order_at: string | null;
    status_summary?: Partial<Record<OrderStatus, number>>;
};

export type AdminCustomerOrder = {
    id: string;
    order_number: string;
    table_number_snapshot: string;
    table_name_snapshot: string | null;
    status: OrderStatus;
    subtotal: number;
    discount_total: number;
    total: number;
    currency: string;
    payment_method: "counter";
    payment_status: "unpaid" | "partially_paid" | "paid" | "refunded";
    customer_note: string | null;
    estimated_preparation_minutes: number | null;
    preparation_started_at: string | null;
    estimated_ready_at: string | null;
    created_at: string;
    updated_at: string;
    items: { id: string; item_name: string; unit_price: number; quantity: number; line_total: number; special_instructions: string | null }[];
};

export type CustomerDirectoryResult =
    | { ok: true; customers: AdminCustomer[]; total: number }
    | { ok: false; reason: "unauthorized" | "unavailable" | "invalid" };

export type CustomerDetailsResult =
    | { ok: true; customer: AdminCustomer; orders: AdminCustomerOrder[] }
    | { ok: false; reason: "unauthorized" | "unavailable" | "not_found" };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function parseCustomer(value: unknown): AdminCustomer | null {
    const spending = isRecord(value) && isRecord(value.total_spending_by_currency) ? value.total_spending_by_currency : null;
    const spendingOrders = isRecord(value) && isRecord(value.spending_orders_by_currency) ? value.spending_orders_by_currency : null;
    if (!isRecord(value)
        || typeof value.id !== "string"
        || typeof value.name !== "string"
        || (value.email !== null && typeof value.email !== "string")
        || (value.avatar_url !== null && typeof value.avatar_url !== "string")
        || typeof value.created_at !== "string"
        || !Number.isInteger(value.total_orders)
        || !spending
        || !Object.entries(spending).every(([currency, amount]) => /^[A-Z]{3}$/.test(currency) && finiteNumber(amount))
        || !spendingOrders
        || !Object.entries(spendingOrders).every(([currency, count]) => /^[A-Z]{3}$/.test(currency) && Number.isInteger(count))
        || (value.last_order_at !== null && typeof value.last_order_at !== "string")) return null;

    const summary = isRecord(value.status_summary)
        ? Object.fromEntries(Object.entries(value.status_summary).filter(([status, count]) => isOrderStatus(status) && Number.isInteger(count))) as Partial<Record<OrderStatus, number>>
        : undefined;
    return {
        id: value.id,
        name: value.name,
        email: value.email,
        avatar_url: value.avatar_url,
        created_at: value.created_at,
        total_orders: value.total_orders as number,
        total_spending_by_currency: spending as Record<string, number>,
        spending_orders_by_currency: spendingOrders as Record<string, number>,
        last_order_at: value.last_order_at,
        ...(summary ? { status_summary: summary } : {}),
    };
}

function parseOrder(value: unknown): AdminCustomerOrder | null {
    if (!isRecord(value) || !Array.isArray(value.items)
        || typeof value.id !== "string"
        || typeof value.order_number !== "string"
        || typeof value.table_number_snapshot !== "string"
        || (value.table_name_snapshot !== null && typeof value.table_name_snapshot !== "string")
        || !isOrderStatus(value.status)
        || !finiteNumber(value.subtotal)
        || !finiteNumber(value.discount_total)
        || !finiteNumber(value.total)
        || typeof value.currency !== "string"
        || value.payment_method !== "counter"
        || (value.payment_status !== "unpaid" && value.payment_status !== "partially_paid" && value.payment_status !== "paid" && value.payment_status !== "refunded")
        || (value.customer_note !== null && typeof value.customer_note !== "string")
        || (value.estimated_preparation_minutes !== null && !finiteNumber(value.estimated_preparation_minutes))
        || (value.preparation_started_at !== null && typeof value.preparation_started_at !== "string")
        || (value.estimated_ready_at !== null && typeof value.estimated_ready_at !== "string")
        || typeof value.created_at !== "string"
        || typeof value.updated_at !== "string") return null;

    const items = value.items.flatMap((item) => {
        if (!isRecord(item) || typeof item.id !== "string" || typeof item.item_name !== "string"
            || !finiteNumber(item.unit_price) || !Number.isInteger(item.quantity) || !finiteNumber(item.line_total)
            || (item.special_instructions !== null && typeof item.special_instructions !== "string")) return [];
        return [{ id: item.id, item_name: item.item_name, unit_price: item.unit_price, quantity: item.quantity as number, line_total: item.line_total, special_instructions: item.special_instructions }];
    });
    if (items.length !== value.items.length) return null;
    return {
        id: value.id, order_number: value.order_number, table_number_snapshot: value.table_number_snapshot,
        table_name_snapshot: value.table_name_snapshot, status: value.status, subtotal: value.subtotal,
        discount_total: value.discount_total, total: value.total, currency: value.currency,
        payment_method: value.payment_method, payment_status: value.payment_status, customer_note: value.customer_note,
        estimated_preparation_minutes: value.estimated_preparation_minutes, preparation_started_at: value.preparation_started_at,
        estimated_ready_at: value.estimated_ready_at, created_at: value.created_at, updated_at: value.updated_at, items,
    };
}

async function authorizedClient() {
    const access = await getAdminAccess();
    if (!hasAdminRole(access, "owner", "full_admin")) return null;
    return createPrivilegedClient();
}

export async function getAdminCustomers(search: unknown, sort: unknown, offset: unknown): Promise<CustomerDirectoryResult> {
    const supabase = await authorizedClient();
    if (!supabase) return { ok: false, reason: "unauthorized" };
    if (typeof search !== "string" || search.length > 80 || typeof sort !== "string"
        || !CUSTOMER_SORTS.includes(sort as CustomerSort) || !Number.isInteger(offset)
        || (offset as number) < 0 || (offset as number) > 100000) return { ok: false, reason: "invalid" };
    try {
        const { data, error } = await supabase.rpc("admin_customer_directory", {
            p_search: search.trim() || null, p_sort: sort, p_offset: offset as number, p_limit: 25,
        });
        if (error || !isRecord(data) || !Array.isArray(data.customers) || !Number.isInteger(data.total)) return { ok: false, reason: "unavailable" };
        const customers = data.customers.map(parseCustomer);
        if (customers.some((customer) => !customer)) return { ok: false, reason: "unavailable" };
        return { ok: true, customers: customers as AdminCustomer[], total: data.total as number };
    } catch {
        return { ok: false, reason: "unavailable" };
    }
}

export async function getAdminCustomerDetails(id: string): Promise<CustomerDetailsResult> {
    const supabase = await authorizedClient();
    if (!supabase) return { ok: false, reason: "unauthorized" };
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { ok: false, reason: "not_found" };
    try {
        const [customerResult, ordersResult] = await Promise.all([
            supabase.rpc("admin_customer_details", { p_customer_id: id }),
            supabase.rpc("admin_customer_order_history", { p_customer_id: id }),
        ]);
        if (customerResult.error || ordersResult.error || !customerResult.data || !Array.isArray(ordersResult.data)) return { ok: false, reason: "unavailable" };
        const customer = parseCustomer(customerResult.data as Json);
        if (!customer) return { ok: false, reason: "not_found" };
        const orders = ordersResult.data.map(parseOrder);
        if (orders.some((order) => !order)) return { ok: false, reason: "unavailable" };
        return { ok: true, customer, orders: orders as AdminCustomerOrder[] };
    } catch {
        return { ok: false, reason: "unavailable" };
    }
}

export async function getAdminCustomerCount(): Promise<number | null> {
    const supabase = await authorizedClient();
    if (!supabase) return null;
    try {
        const { data, error } = await supabase.rpc("admin_customer_count");
        return error || !Number.isInteger(data) || data < 0 ? null : data;
    } catch {
        return null;
    }
}
