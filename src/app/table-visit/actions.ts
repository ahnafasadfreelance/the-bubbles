"use server";

import { createPrivilegedClient } from "@/lib/supabase/privileged-server";
import { getCurrentOrderingSessionProof } from "@/lib/ordering-session";
import { getCurrentTableContext } from "@/lib/table-context";
import { getCurrentUser } from "@/lib/supabase/auth-server";
import { customerIdentityFromUser } from "@/lib/supabase/identity";

export type TableVisitState = {
    visitId: string;
    startedAt: string;
    orderWindowExpiresAt: string;
    visitExpiresAt: string;
    supportCooldownUntil: string | null;
    serverNow: string;
    requests: {
        id: string;
        request_type: string;
        customer_message: string | null;
        status: string;
        created_at: string;
    }[];
    messages: {
        id: string;
        sender_type: string;
        sender_name: string;
        body: string;
        created_at: string;
    }[];
};

export type TableVisitStateResult =
    | { ok: true; state: TableVisitState | null }
    | { ok: false; reason: string };

function validCustomerText(value: unknown, maxLength: number): value is string {
    return typeof value === "string"
        && value.trim().length > 0
        && value.trim().length <= maxLength
        && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}

function rpcResult(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

export async function loadTableVisitStateAction(): Promise<TableVisitStateResult> {
    try {
        const table = await getCurrentTableContext();
        if (!table) return { ok: true, state: null };
        const proof = await getCurrentOrderingSessionProof(table.tableId);
        if (!proof) return { ok: true, state: null };
        const supabase = createPrivilegedClient();
        const [{ data: requests, error: requestError }, { data: messages, error: messageError }] = await Promise.all([
            supabase
                .from("table_visit_support_requests")
                .select("id, request_type, customer_message, status, created_at")
                .eq("visit_id", proof.proof.visitId)
                .order("created_at", { ascending: false })
                .limit(10),
            supabase
                .from("table_visit_messages")
                .select("id, sender_type, sender_name, body, created_at")
                .eq("visit_id", proof.proof.visitId)
                .order("created_at", { ascending: false })
                .limit(30),
        ]);
        if (requestError || messageError || !requests || !messages) {
            return { ok: false, reason: "Table support could not be refreshed." };
        }
        return {
            ok: true,
            state: {
                visitId: proof.session.visitId,
                startedAt: proof.session.createdAt,
                orderWindowExpiresAt: proof.session.expiresAt,
                visitExpiresAt: proof.session.visitExpiresAt,
                supportCooldownUntil: proof.session.supportCooldownUntil,
                serverNow: proof.session.serverNow,
                requests,
                messages: messages.reverse(),
            },
        };
    } catch {
        return { ok: false, reason: "Table support could not be refreshed." };
    }
}

export async function createTableSupportRequestAction(input: unknown): Promise<
    { ok: true } | { ok: false; reason: "invalid" | "cooldown" | "closed" | "error" }
> {
    if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, reason: "invalid" };
    const request = input as { type?: unknown; message?: unknown };
    if (
        (request.type !== "waiter" && request.type !== "bill" && request.type !== "water_cutlery")
        || (request.message !== undefined && request.message !== "" && !validCustomerText(request.message, 500))
    ) return { ok: false, reason: "invalid" };
    try {
        const table = await getCurrentTableContext();
        if (!table) return { ok: false, reason: "closed" };
        const current = await getCurrentOrderingSessionProof(table.tableId);
        if (!current) return { ok: false, reason: "closed" };
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase.rpc("create_table_visit_support_request", {
            p_session_id: current.proof.id,
            p_session_token_hash: current.proof.tokenHash,
            p_request_type: request.type,
            p_customer_message: typeof request.message === "string" ? request.message.trim() || null : null,
        });
        if (error) {
            if (error.message.includes("TABLE_VISIT_CLOSED")) return { ok: false, reason: "closed" };
            return { ok: false, reason: "error" };
        }
        const result = rpcResult(data);
        if (result?.ok === true) return { ok: true };
        return result?.reason === "cooldown"
            ? { ok: false, reason: "cooldown" }
            : { ok: false, reason: "closed" };
    } catch {
        return { ok: false, reason: "error" };
    }
}

export async function sendTableVisitMessageAction(body: unknown): Promise<
    { ok: true } | { ok: false; reason: "invalid" | "cooldown" | "closed" | "error" }
> {
    if (!validCustomerText(body, 1000)) return { ok: false, reason: "invalid" };
    try {
        const table = await getCurrentTableContext();
        if (!table) return { ok: false, reason: "closed" };
        const current = await getCurrentOrderingSessionProof(table.tableId);
        if (!current) return { ok: false, reason: "closed" };
        const user = await getCurrentUser();
        const identity = user ? customerIdentityFromUser(user) : null;
        const senderName = identity?.displayName || "Table guest";
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase.rpc("send_table_visit_message", {
            p_session_id: current.proof.id,
            p_session_token_hash: current.proof.tokenHash,
            p_sender_name: senderName.slice(0, 80),
            p_body: body.trim(),
        });
        if (error) {
            if (error.message.includes("TABLE_VISIT_CLOSED")) return { ok: false, reason: "closed" };
            return { ok: false, reason: "error" };
        }
        const result = rpcResult(data);
        if (result?.ok === true) return { ok: true };
        return result?.reason === "cooldown"
            ? { ok: false, reason: "cooldown" }
            : { ok: false, reason: "closed" };
    } catch {
        return { ok: false, reason: "error" };
    }
}
