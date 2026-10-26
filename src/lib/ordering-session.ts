import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { createPrivilegedClient } from "@/lib/supabase/privileged-server";

export const ORDERING_SESSION_COOKIE = "blue-table-ordering-session";
export const ORDERING_SESSION_TTL_SECONDS = 24 * 60 * 60;

export type PublicOrderingSession = {
    visitId: string;
    createdAt: string;
    expiresAt: string;
    visitExpiresAt: string;
    supportCooldownUntil: string | null;
    serverNow: string;
};

type SessionProof = {
    id: string;
    tokenHash: string;
    visitId: string;
};

function tokenHash(token: string) {
    return createHash("sha256").update(token, "utf8").digest("hex");
}

function parseSessionCookie(value: string | undefined): Omit<SessionProof, "visitId"> | null {
    if (!value) return null;
    const [id, secret, extra] = value.split(".");
    if (
        extra !== undefined
        || !id
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        || !secret
        || !/^[A-Za-z0-9_-]{43}$/.test(secret)
    ) return null;

    return { id, tokenHash: tokenHash(secret) };
}

export async function getCurrentOrderingSessionProof(tableId: string): Promise<{
    proof: SessionProof;
    session: PublicOrderingSession;
} | null> {
    const cookieStore = await cookies();
    const partialProof = parseSessionCookie(cookieStore.get(ORDERING_SESSION_COOKIE)?.value);
    if (!partialProof) return null;

    const supabase = createPrivilegedClient();
    const { data, error } = await supabase
        .from("ordering_sessions")
        .select("id, table_id, token_hash, created_at, expires_at, revoked_at, visit_id")
        .eq("id", partialProof.id)
        .eq("table_id", tableId)
        .maybeSingle();

    if (error) throw new Error(`Unable to validate ordering session: ${error.message}`);
    if (
        !data
        || data.revoked_at !== null
        || data.visit_id === null
        || Date.parse(data.expires_at) <= Date.now()
    ) return null;

    const expected = Buffer.from(data.token_hash, "hex");
    const supplied = Buffer.from(partialProof.tokenHash, "hex");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

    const { data: state, error: stateError } = await supabase.rpc("get_table_visit_state", {
        p_session_id: data.id,
        p_session_token_hash: partialProof.tokenHash,
    });
    if (stateError) throw new Error(`Unable to read table visit: ${stateError.message}`);
    if (!state || typeof state !== "object" || Array.isArray(state) || state.active !== true) return null;

    const visitState = state as {
        visitId?: unknown;
        startedAt?: unknown;
        orderWindowExpiresAt?: unknown;
        visitExpiresAt?: unknown;
        supportCooldownUntil?: unknown;
        serverNow?: unknown;
    };
    if (
        typeof visitState.visitId !== "string"
        || typeof visitState.startedAt !== "string"
        || typeof visitState.orderWindowExpiresAt !== "string"
        || typeof visitState.visitExpiresAt !== "string"
        || (visitState.supportCooldownUntil !== null && typeof visitState.supportCooldownUntil !== "string")
        || typeof visitState.serverNow !== "string"
    ) return null;

    return {
        proof: { ...partialProof, visitId: data.visit_id },
        session: {
            visitId: visitState.visitId,
            createdAt: visitState.startedAt,
            expiresAt: visitState.orderWindowExpiresAt,
            visitExpiresAt: visitState.visitExpiresAt,
            supportCooldownUntil: visitState.supportCooldownUntil,
            serverNow: visitState.serverNow,
        },
    };
}

export async function getCurrentOrderingSession(tableId: string): Promise<PublicOrderingSession | null> {
    const current = await getCurrentOrderingSessionProof(tableId);
    return current?.session ?? null;
}

export async function createOrderingSession(tableId: string) {
    const secret = randomBytes(32).toString("base64url");
    const hash = tokenHash(secret);
    const supabase = createPrivilegedClient();
    const { data, error } = await supabase.rpc("create_qr_ordering_session", {
        p_table_id: tableId,
        p_token_hash: hash,
    });
    const session = Array.isArray(data) ? data[0] : null;
    if (error) throw new Error(`Unable to create QR table visit access: ${error.message}`);
    if (
        !session
        || typeof session.id !== "string"
        || typeof session.created_at !== "string"
        || typeof session.expires_at !== "string"
        || typeof session.visit_id !== "string"
        || typeof session.visit_started_at !== "string"
        || typeof session.order_window_expires_at !== "string"
    ) throw new Error("The database did not return the new table visit access session.");

    return {
        cookieValue: `${session.id}.${secret}`,
        createdAt: session.visit_started_at,
        expiresAt: session.expires_at,
        visitId: session.visit_id,
    };
}

export function sessionCookieMaxAge(expiresAt: string) {
    return Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 1000));
}
