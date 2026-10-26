import "server-only";

import { getAdminAccess, hasAdminRole } from "@/lib/admin-auth";
import { createPrivilegedClient } from "@/lib/supabase/privileged-server";

export type AdminReviewFilters = {
    search: string;
    rating: number | null;
    sort: "newest" | "oldest" | "highest" | "lowest";
    offset: number;
};

export type AdminReview = {
    id: string;
    order_id: string;
    order_number: string;
    customer_id: string;
    customer_name: string;
    rating: number;
    comment: string | null;
    created_at: string;
    table_number: string;
    table_name: string | null;
    order_total: number;
    currency: string;
};

export type AdminReviewData = {
    metrics: {
        total_reviews: number;
        average_rating: number;
        five_star_reviews: number;
        recent_reviews: number;
    };
    distribution: { rating: number; count: number; percentage: number }[];
    total_filtered: number;
    reviews: AdminReview[];
};

export type AdminReviewsResult =
    | { ok: true; data: AdminReviewData }
    | { ok: false; reason: "unauthorized" | "unconfigured" | "unavailable" };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function parseAdminReview(value: unknown): AdminReview | null {
    if (!isRecord(value)
        || typeof value.id !== "string"
        || typeof value.order_id !== "string"
        || typeof value.order_number !== "string"
        || typeof value.customer_id !== "string"
        || typeof value.customer_name !== "string"
        || !Number.isInteger(value.rating)
        || (value.rating as number) < 1
        || (value.rating as number) > 5
        || (value.comment !== null && typeof value.comment !== "string")
        || typeof value.created_at !== "string"
        || typeof value.table_number !== "string"
        || (value.table_name !== null && typeof value.table_name !== "string")
        || !finiteNumber(value.order_total)
        || typeof value.currency !== "string") return null;

    return {
        id: value.id,
        order_id: value.order_id,
        order_number: value.order_number,
        customer_id: value.customer_id,
        customer_name: value.customer_name,
        rating: value.rating as number,
        comment: value.comment,
        created_at: value.created_at,
        table_number: value.table_number,
        table_name: value.table_name,
        order_total: value.order_total,
        currency: value.currency,
    };
}

function parseAdminReviews(value: unknown): AdminReviewData | null {
    if (!isRecord(value) || !isRecord(value.metrics) || !Array.isArray(value.distribution) || !Array.isArray(value.reviews)) return null;
    const metrics = value.metrics;
    if (!Number.isInteger(metrics.total_reviews)
        || !finiteNumber(metrics.average_rating)
        || !Number.isInteger(metrics.five_star_reviews)
        || !Number.isInteger(metrics.recent_reviews)
        || !Number.isInteger(value.total_filtered)) return null;

    const distribution = value.distribution.map((entry) => {
        if (!isRecord(entry)
            || !Number.isInteger(entry.rating)
            || (entry.rating as number) < 1
            || (entry.rating as number) > 5
            || !Number.isInteger(entry.count)
            || !finiteNumber(entry.percentage)) return null;
        return {
            rating: entry.rating as number,
            count: entry.count as number,
            percentage: entry.percentage,
        };
    });
    const reviews = value.reviews.map(parseAdminReview);
    if (distribution.some((entry) => entry === null) || reviews.some((review) => review === null)) return null;

    return {
        metrics: {
            total_reviews: metrics.total_reviews as number,
            average_rating: metrics.average_rating,
            five_star_reviews: metrics.five_star_reviews as number,
            recent_reviews: metrics.recent_reviews as number,
        },
        distribution: distribution as AdminReviewData["distribution"],
        total_filtered: value.total_filtered as number,
        reviews: reviews as AdminReview[],
    };
}

export async function getAdminReviews(filters: AdminReviewFilters): Promise<AdminReviewsResult> {
    const access = await getAdminAccess();
    if (!hasAdminRole(access, "owner", "full_admin")) return { ok: false, reason: "unauthorized" };
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
        return { ok: false, reason: "unconfigured" };
    }

    try {
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase.rpc("admin_customer_reviews", {
            p_search: filters.search || null,
            p_rating: filters.rating,
            p_sort: filters.sort,
            p_offset: filters.offset,
            p_limit: 25,
        });
        if (error) return { ok: false, reason: "unavailable" };
        const parsed = parseAdminReviews(data);
        return parsed ? { ok: true, data: parsed } : { ok: false, reason: "unavailable" };
    } catch {
        return { ok: false, reason: "unavailable" };
    }
}
