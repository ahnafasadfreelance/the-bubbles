import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { createPrivilegedClient } from "@/lib/supabase/privileged-server";

export const TABLE_CONTEXT_COOKIE = "blue-table-context";
export const TABLE_CONTEXT_TTL_SECONDS = 60 * 60 * 24 * 30;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResolvedTableContext = {
    tableId: string;
    tableNumber: string;
    tableName: string | null;
};

function contextSecret() {
    const secret = process.env.TABLE_CONTEXT_SECRET;
    if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
        throw new Error("Table context signing is not configured.");
    }
    return secret;
}

export function signTableContext(tableId: string) {
    if (!UUID_PATTERN.test(tableId)) throw new Error("Invalid table identifier.");
    const expiresAt = Math.floor(Date.now() / 1000) + TABLE_CONTEXT_TTL_SECONDS;
    const payload = `${tableId}.${expiresAt}`;
    const signature = createHmac("sha256", contextSecret()).update(payload).digest("hex");
    return `${payload}.${signature}`;
}

function verifiedTableId(value: string | undefined) {
    if (!value) return null;
    const [tableId, expiry, signature, extra] = value.split(".");
    if (!tableId || !expiry || !signature || extra !== undefined || !UUID_PATTERN.test(tableId)) return null;
    const expiresAt = Number(expiry);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + TABLE_CONTEXT_TTL_SECONDS) return null;

    try {
        const expected = createHmac("sha256", contextSecret()).update(`${tableId}.${expiry}`).digest();
        const provided = Buffer.from(signature, "hex");
        return provided.length === expected.length && timingSafeEqual(provided, expected)
            ? tableId
            : null;
    } catch {
        return null;
    }
}

async function getActiveTableContext(tableId: string): Promise<ResolvedTableContext | null> {
    try {
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase
            .from("restaurant_tables")
            .select("id, table_number, table_name")
            .eq("id", tableId)
            .eq("is_active", true)
            .maybeSingle();

        if (error || !data) return null;
        return {
            tableId: data.id,
            tableNumber: data.table_number,
            tableName: data.table_name,
        };
    } catch {
        return null;
    }
}

export async function resolveActiveTableToken(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;

    try {
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase
            .from("restaurant_tables")
            .select("id, table_number, table_name")
            .eq("qr_token", token)
            .eq("is_active", true)
            .maybeSingle();

        if (error || !data) return null;
        return {
            id: data.id,
            tableNumber: data.table_number,
            tableName: data.table_name,
        };
    } catch {
        return null;
    }
}

export async function getCurrentTableContext(): Promise<ResolvedTableContext | null> {
    const cookieStore = await cookies();
    const tableId = verifiedTableId(cookieStore.get(TABLE_CONTEXT_COOKIE)?.value);
    return tableId ? getActiveTableContext(tableId) : null;
}