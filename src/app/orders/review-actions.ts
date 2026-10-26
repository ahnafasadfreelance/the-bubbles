"use server";

import { revalidatePath } from "next/cache";

import { createPrivilegedClient } from "@/lib/supabase/privileged-server";
import { getCurrentUser } from "@/lib/supabase/auth-server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMMENT_CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

type ReviewActionResult =
    | { ok: true; state: "eligible" | "not_completed" | "reviewed" | "dismissed" }
    | { ok: false; reason: "unauthorized" | "invalid" | "not_found" | "not_completed" | "already_reviewed" | "unavailable" };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function getCustomerReviewPromptState(orderId: unknown): Promise<ReviewActionResult> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, reason: "unauthorized" };
    if (typeof orderId !== "string" || !UUID_PATTERN.test(orderId)) return { ok: false, reason: "invalid" };

    try {
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase.rpc("customer_review_prompt_state", {
            p_customer_id: user.id,
            p_order_id: orderId,
        });
        if (error || !isRecord(data)) return { ok: false, reason: "unavailable" };
        if (data.ok === true && (
            data.state === "eligible"
            || data.state === "not_completed"
            || data.state === "reviewed"
            || data.state === "dismissed"
        )) return { ok: true, state: data.state };
        if (data.reason === "not_found") return { ok: false, reason: "not_found" };
        return { ok: false, reason: "unavailable" };
    } catch {
        return { ok: false, reason: "unavailable" };
    }
}

export async function submitCustomerReview(input: unknown): Promise<ReviewActionResult> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, reason: "unauthorized" };
    if (!isRecord(input)) return { ok: false, reason: "invalid" };

    const { orderId, rating, comment } = input;
    if (
        typeof orderId !== "string"
        || !UUID_PATTERN.test(orderId)
        || typeof rating !== "number"
        || !Number.isInteger(rating)
        || rating < 1
        || rating > 5
        || typeof comment !== "string"
        || comment.length > 2000
        || COMMENT_CONTROL_CHARACTERS.test(comment)
    ) return { ok: false, reason: "invalid" };

    try {
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase.rpc("submit_customer_review", {
            p_customer_id: user.id,
            p_order_id: orderId,
            p_rating: rating,
            p_comment: comment.trim() || null,
        });
        if (error || !isRecord(data)) return { ok: false, reason: "unavailable" };
        if (data.ok === true) {
            revalidatePath("/admin/reviews");
            return { ok: true, state: "reviewed" };
        }
        if (data.reason === "not_found") return { ok: false, reason: "not_found" };
        if (data.reason === "not_completed") return { ok: false, reason: "not_completed" };
        if (data.reason === "already_reviewed") return { ok: false, reason: "already_reviewed" };
        if (data.reason === "invalid") return { ok: false, reason: "invalid" };
        return { ok: false, reason: "unavailable" };
    } catch {
        return { ok: false, reason: "unavailable" };
    }
}

export async function dismissCustomerReviewPrompt(orderId: unknown): Promise<ReviewActionResult> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, reason: "unauthorized" };
    if (typeof orderId !== "string" || !UUID_PATTERN.test(orderId)) return { ok: false, reason: "invalid" };

    try {
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase.rpc("dismiss_customer_review_prompt", {
            p_customer_id: user.id,
            p_order_id: orderId,
        });
        if (error || !isRecord(data)) return { ok: false, reason: "unavailable" };
        if (data.ok === true && (data.state === "dismissed" || data.state === "reviewed")) {
            return { ok: true, state: data.state };
        }
        if (data.reason === "not_found") return { ok: false, reason: "not_found" };
        if (data.reason === "not_completed") return { ok: false, reason: "not_completed" };
        return { ok: false, reason: "unavailable" };
    } catch {
        return { ok: false, reason: "unavailable" };
    }
}
