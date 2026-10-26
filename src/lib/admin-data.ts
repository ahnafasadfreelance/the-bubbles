import "server-only";

import { createPrivilegedClient } from "@/lib/supabase/privileged-server";
import { getAdminAccess, hasAdminRole } from "@/lib/admin-auth";
import { isOrderStatus, ORDER_STATUSES, type OrderStatus } from "@/lib/order-status";
import { isPaymentMethod, type PaymentMethod, type PaymentStatus } from "@/lib/payment";
import type { Json } from "@/types/database";

export type AdminOrderItem = {
    id: string;
    item_name: string;
    unit_price: number;
    quantity: number;
    line_total: number;
    special_instructions: string | null;
};

export type AdminOrder = {
    id: string;
    order_number: string;
    customer_id: string;
    customer_name: string;
    customer_email: string | null;
    table_number_snapshot: string;
    table_name_snapshot: string | null;
    status: OrderStatus;
    subtotal: number;
    discount_total: number;
    total: number;
    currency: string;
    payment_method: "counter";
    preferred_payment_method: PaymentMethod | null;
    amount_paid: number;
    payment_status: PaymentStatus;
    payment_collections: AdminPaymentCollection[];
    customer_note: string | null;
    rejection_reason: string | null;
    estimated_preparation_minutes: number | null;
    preparation_started_at: string | null;
    estimated_ready_at: string | null;
    created_at: string;
    updated_at: string;
    items: AdminOrderItem[];
};

export type AdminPaymentCollection = {
    id: string;
    amount: number;
    payment_method: PaymentMethod;
    collected_by: string;
    collected_by_name: string;
    collected_at: string;
    verification_status: "staff_verified";
    notes: string | null;
};

export type AdminPaymentOverview = {
    collected_by_currency: Record<string, number>;
    collected_by_method: Partial<Record<PaymentMethod, Record<string, number>>>;
    outstanding_by_currency: Record<string, number>;
    unpaid_orders: number;
    partially_paid_orders: number;
    paid_orders: number;
};

export type AdminDashboard = {
    summary: {
        pending: number;
        confirmed: number;
        preparing: number;
        ready: number;
        completed: number;
        today_count: number;
        today_recorded_revenue_by_currency: Record<string, number>;
    };
    orders: AdminOrder[];
    total: number;
    status_counts: Record<OrderStatus, number>;
    payment_overview: AdminPaymentOverview;
};

export type AdminDashboardFilters = {
    status: OrderStatus | "all";
    search: string;
    offset: number;
    limit?: 20 | 25;
    table?: string;
    fromDate?: string;
    toDate?: string;
    paymentStatus?: "all" | PaymentStatus;
    paymentMethod?: "all" | PaymentMethod;
};

export type AdminDashboardResult =
    | { ok: true; data: AdminDashboard }
    | { ok: false; reason: "unauthorized" | "unconfigured" | "unavailable" };

export type AdminOrderBucket = { bucket_label: string; order_count: number };
export type PreparationEstimateRange = { min: number; max: number };

export function getPreparationEstimateRange(): PreparationEstimateRange {
    const minimum = Number(process.env.ORDER_PREPARATION_MIN_MINUTES ?? 5);
    const maximum = Number(process.env.ORDER_PREPARATION_MAX_MINUTES ?? 240);
    return Number.isInteger(minimum) && Number.isInteger(maximum)
        && minimum >= 1 && minimum < maximum && maximum <= 1440
        ? { min: minimum, max: maximum }
        : { min: 5, max: 240 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function nullableString(value: unknown): value is string | null {
    return value === null || typeof value === "string";
}

function parseOrderItem(value: unknown): AdminOrderItem | null {
    if (!isRecord(value)) return null;
    if (
        typeof value.id !== "string"
        || typeof value.item_name !== "string"
        || !isNumber(value.unit_price)
        || typeof value.quantity !== "number"
        || !Number.isInteger(value.quantity)
        || !isNumber(value.line_total)
        || !nullableString(value.special_instructions)
    ) return null;

    return {
        id: value.id,
        item_name: value.item_name,
        unit_price: value.unit_price,
        quantity: value.quantity,
        line_total: value.line_total,
        special_instructions: value.special_instructions,
    };
}

function parsePaymentCollection(value: unknown): AdminPaymentCollection | null {
    if (!isRecord(value)
        || typeof value.id !== "string"
        || !isNumber(value.amount)
        || !isPaymentMethod(value.payment_method)
        || typeof value.collected_by !== "string"
        || typeof value.collected_by_name !== "string"
        || typeof value.collected_at !== "string"
        || value.verification_status !== "staff_verified"
        || !nullableString(value.notes)) return null;
    return {
        id: value.id,
        amount: value.amount,
        payment_method: value.payment_method,
        collected_by: value.collected_by,
        collected_by_name: value.collected_by_name,
        collected_at: value.collected_at,
        verification_status: value.verification_status,
        notes: value.notes,
    };
}

function parseOrder(value: unknown): AdminOrder | null {
    if (!isRecord(value) || !Array.isArray(value.items) || !Array.isArray(value.payment_collections)) return null;
    const items = value.items.map(parseOrderItem);
    const paymentCollections = value.payment_collections.map(parsePaymentCollection);
    if (items.some((item) => item === null) || paymentCollections.some((payment) => payment === null)) return null;
    if (
        typeof value.id !== "string"
        || typeof value.order_number !== "string"
        || typeof value.customer_id !== "string"
        || typeof value.customer_name !== "string"
        || !nullableString(value.customer_email)
        || typeof value.table_number_snapshot !== "string"
        || !nullableString(value.table_name_snapshot)
        || !isOrderStatus(value.status)
        || !isNumber(value.subtotal)
        || !isNumber(value.discount_total)
        || !isNumber(value.total)
        || typeof value.currency !== "string"
        || value.payment_method !== "counter"
        || (value.preferred_payment_method !== null && !isPaymentMethod(value.preferred_payment_method))
        || !isNumber(value.amount_paid)
        || (value.payment_status !== "unpaid" && value.payment_status !== "partially_paid" && value.payment_status !== "paid" && value.payment_status !== "refunded")
        || !nullableString(value.customer_note)
        || !nullableString(value.rejection_reason)
        || (value.estimated_preparation_minutes !== null && !isNumber(value.estimated_preparation_minutes))
        || !nullableString(value.preparation_started_at)
        || !nullableString(value.estimated_ready_at)
        || typeof value.created_at !== "string"
        || typeof value.updated_at !== "string"
    ) return null;

    return {
        id: value.id,
        order_number: value.order_number,
        customer_id: value.customer_id,
        customer_name: value.customer_name,
        customer_email: value.customer_email,
        table_number_snapshot: value.table_number_snapshot,
        table_name_snapshot: value.table_name_snapshot,
        status: value.status,
        subtotal: value.subtotal,
        discount_total: value.discount_total,
        total: value.total,
        currency: value.currency,
        payment_method: value.payment_method,
        preferred_payment_method: value.preferred_payment_method,
        amount_paid: value.amount_paid,
        payment_status: value.payment_status,
        payment_collections: paymentCollections as AdminPaymentCollection[],
        customer_note: value.customer_note,
        rejection_reason: value.rejection_reason,
        estimated_preparation_minutes: value.estimated_preparation_minutes,
        preparation_started_at: value.preparation_started_at,
        estimated_ready_at: value.estimated_ready_at,
        created_at: value.created_at,
        updated_at: value.updated_at,
        items: items as AdminOrderItem[],
    };
}

function parseMoneyMap(value: unknown) {
    if (!isRecord(value)
        || !Object.entries(value).every(([currency, amount]) => /^[A-Z]{3}$/.test(currency) && isNumber(amount))) return null;
    return value as Record<string, number>;
}

function parsePaymentOverview(value: unknown): AdminPaymentOverview | null {
    if (!isRecord(value)
        || !isRecord(value.collected_by_method)
        || !Object.entries(value.collected_by_method).every(([method, currencies]) => (
            isPaymentMethod(method)
            && isRecord(currencies)
            && Object.entries(currencies).every(([currency, amount]) => /^[A-Z]{3}$/.test(currency) && isNumber(amount))
        ))
        || !Number.isInteger(value.unpaid_orders)
        || !Number.isInteger(value.partially_paid_orders)
        || !Number.isInteger(value.paid_orders)) return null;
    const collectedByCurrency = parseMoneyMap(value.collected_by_currency);
    const outstandingByCurrency = parseMoneyMap(value.outstanding_by_currency);
    if (!collectedByCurrency || !outstandingByCurrency) return null;
    return {
        collected_by_currency: collectedByCurrency,
        collected_by_method: value.collected_by_method as Partial<Record<PaymentMethod, Record<string, number>>>,
        outstanding_by_currency: outstandingByCurrency,
        unpaid_orders: value.unpaid_orders as number,
        partially_paid_orders: value.partially_paid_orders as number,
        paid_orders: value.paid_orders as number,
    };
}

function parseDashboard(value: Json): AdminDashboard | null {
    if (!isRecord(value) || !isRecord(value.summary) || !Array.isArray(value.orders)) return null;
    const orders = value.orders.map(parseOrder);
    const summary = value.summary;
    const summaryKeys = ["pending", "confirmed", "preparing", "ready", "completed", "today_count"] as const;
    const revenueByCurrency = summary.today_recorded_revenue_by_currency;
    if (
        orders.some((order) => order === null)
        || !summaryKeys.every((key) => Number.isInteger(summary[key]) && (summary[key] as number) >= 0)
        || !isRecord(revenueByCurrency)
        || !Object.entries(revenueByCurrency).every(([currency, amount]) => /^[A-Z]{3}$/.test(currency) && isNumber(amount))
        || !Number.isInteger(value.total)
        || (value.total as number) < 0
    ) return null;
    const paymentOverview = parsePaymentOverview(value.payment_overview);
    if (!paymentOverview) return null;

    return {
        summary: {
            pending: summary.pending as number,
            confirmed: summary.confirmed as number,
            preparing: summary.preparing as number,
            ready: summary.ready as number,
            completed: summary.completed as number,
            today_count: summary.today_count as number,
            today_recorded_revenue_by_currency: revenueByCurrency as Record<string, number>,
        },
        orders: orders as AdminOrder[],
        total: value.total as number,
        status_counts: Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0])) as Record<OrderStatus, number>,
        payment_overview: paymentOverview,
    };
}

export async function getAdminDashboard(filters: AdminDashboardFilters): Promise<AdminDashboardResult> {
    const access = await getAdminAccess();
    if (!hasAdminRole(access, "owner", "full_admin")) return { ok: false, reason: "unauthorized" };
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
        return { ok: false, reason: "unconfigured" };
    }

    try {
        const supabase = createPrivilegedClient();
        const [
            { data, error },
            { data: paymentOverviewData, error: paymentOverviewError },
            { data: statusCounts, error: countError },
        ] = await Promise.all([
            supabase.rpc("admin_order_dashboard_with_payments", {
                p_status: filters.status,
                p_search: filters.search || null,
                p_table: filters.table || null,
                p_from_date: filters.fromDate || null,
                p_to_date: filters.toDate || null,
                p_payment_status: filters.paymentStatus ?? "all",
                p_payment_method: filters.paymentMethod ?? "all",
                p_offset: filters.offset,
                p_limit: filters.limit ?? 25,
            }),
            supabase.rpc("admin_payment_overview", {
                p_from_date: filters.fromDate || null,
                p_to_date: filters.toDate || null,
            }),
            supabase.rpc("admin_order_status_counts"),
        ]);
        if (error || !data || paymentOverviewError || !paymentOverviewData || countError || !statusCounts
            || typeof data !== "object" || Array.isArray(data)) {
            return { ok: false, reason: "unavailable" };
        }
        const dashboard = parseDashboard({ ...data, payment_overview: paymentOverviewData } as Json);
        if (!dashboard) return { ok: false, reason: "unavailable" };
        for (const row of statusCounts) {
            if (isOrderStatus(row.status) && Number.isInteger(row.order_count) && row.order_count >= 0) {
                dashboard.status_counts[row.status] = row.order_count;
            }
        }
        return { ok: true, data: dashboard };
    } catch {
        return { ok: false, reason: "unavailable" };
    }
}

export async function getOrderManagementDashboard(filters: AdminDashboardFilters): Promise<AdminDashboardResult> {
    const access = await getAdminAccess();
    if (!hasAdminRole(access, "order_management")) return { ok: false, reason: "unauthorized" };
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
        return { ok: false, reason: "unconfigured" };
    }

    try {
        const supabase = createPrivilegedClient();
        const [
            { data, error },
            { data: statusCounts, error: countError },
        ] = await Promise.all([
            supabase.rpc("admin_order_dashboard_with_payments", {
                p_status: filters.status,
                p_search: filters.search || null,
                p_table: filters.table || null,
                p_from_date: filters.fromDate || null,
                p_to_date: filters.toDate || null,
                p_payment_status: filters.paymentStatus ?? "all",
                p_payment_method: filters.paymentMethod ?? "all",
                p_offset: filters.offset,
                p_limit: filters.limit ?? 25,
            }),
            supabase.rpc("admin_order_status_counts"),
        ]);
        if (error || !data || countError || !statusCounts || typeof data !== "object" || Array.isArray(data)) {
            return { ok: false, reason: "unavailable" };
        }

        const paymentOverview: AdminPaymentOverview = {
            collected_by_currency: {},
            collected_by_method: {},
            outstanding_by_currency: {},
            unpaid_orders: 0,
            partially_paid_orders: 0,
            paid_orders: 0,
        };
        const dashboard = parseDashboard({ ...data, payment_overview: paymentOverview } as Json);
        if (!dashboard) return { ok: false, reason: "unavailable" };

        for (const row of statusCounts) {
            if (isOrderStatus(row.status) && Number.isInteger(row.order_count) && row.order_count >= 0) {
                dashboard.status_counts[row.status] = row.order_count;
            }
        }
        return { ok: true, data: dashboard };
    } catch {
        return { ok: false, reason: "unavailable" };
    }
}

export function parseDashboardFilters(value: unknown): AdminDashboardFilters | null {
    if (!isRecord(value)) return null;
    const status = value.status;
    const search = value.search;
    const offset = value.offset;
    const limit = value.limit ?? 25;
    const table = value.table ?? "";
    const fromDate = value.fromDate ?? "";
    const toDate = value.toDate ?? "";
    const paymentStatus = value.paymentStatus ?? "all";
    const paymentMethod = value.paymentMethod ?? "all";
    const validDate = (input: string) => {
        if (!input) return true;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return false;
        const parsed = new Date(`${input}T00:00:00.000Z`);
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === input;
    };
    if (
        (status !== "all" && !isOrderStatus(status))
        || typeof search !== "string"
        || search.length > 80
        || /[\u0000-\u001f\u007f]/.test(search)
        || !Number.isInteger(offset)
        || (offset as number) < 0
        || (offset as number) > 100000
        || (limit !== 20 && limit !== 25)
        || typeof table !== "string"
        || table.length > 80
        || /[\u0000-\u001f\u007f]/.test(table)
        || typeof fromDate !== "string"
        || !validDate(fromDate)
        || typeof toDate !== "string"
        || !validDate(toDate)
        || (paymentStatus !== "all" && paymentStatus !== "unpaid" && paymentStatus !== "partially_paid" && paymentStatus !== "paid" && paymentStatus !== "refunded")
        || (paymentMethod !== "all" && !isPaymentMethod(paymentMethod))
        || (fromDate !== "" && toDate !== "" && fromDate > toDate)
    ) return null;

    return { status, search: search.trim(), offset: offset as number, limit, table: table.trim(), fromDate, toDate, paymentStatus, paymentMethod };
}

export async function getAdminOrderBuckets(): Promise<AdminOrderBucket[]> {
    const access = await getAdminAccess();
    if (!hasAdminRole(access, "owner", "full_admin")) return [];
    try {
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase.rpc("admin_dashboard_order_buckets");
        if (error || !data) return [];
        return data.flatMap((bucket) => (
            typeof bucket.bucket_label === "string"
                && Number.isInteger(bucket.order_count)
                && bucket.order_count >= 0
                ? [{ bucket_label: bucket.bucket_label, order_count: bucket.order_count }]
                : []
        ));
    } catch {
        return [];
    }
}