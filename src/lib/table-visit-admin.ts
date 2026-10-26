import "server-only";

import { getAdminAccess } from "@/lib/admin-auth";
import { createPrivilegedClient } from "@/lib/supabase/privileged-server";

export type AdminTableVisit = {
    id: string;
    tableId: string;
    tableLabel: string;
    startedAt: string;
    orderWindowExpiresAt: string;
    lastActivityAt: string;
    supportCooldownUntil: string | null;
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

export type AdminTableVisitsResult =
    | { ok: true; data: AdminTableVisit[] }
    | { ok: false; reason: "unauthorized" | "unavailable" };

export type AdminTableVisitRequestCountResult =
    | { ok: true; count: number }
    | { ok: false; reason: "unavailable" };

export async function getAdminTableVisitRequestCount(): Promise<AdminTableVisitRequestCountResult> {
    try {
        const supabase = createPrivilegedClient();
        const notStaleSince = new Date(Date.now() - 90 * 60 * 1000).toISOString();
        const { data: visits, error: visitsError } = await supabase
            .from("table_visits")
            .select("id")
            .is("closed_at", null)
            .gt("last_activity_at", notStaleSince)
            .limit(100);
        if (visitsError || !visits) return { ok: false, reason: "unavailable" };
        if (visits.length === 0) return { ok: true, count: 0 };

        const { count, error } = await supabase
            .from("table_visit_support_requests")
            .select("id", { count: "exact", head: true })
            .in("visit_id", visits.map(({ id }) => id))
            .eq("status", "pending");
        if (error || count === null) return { ok: false, reason: "unavailable" };
        return { ok: true, count };
    } catch {
        return { ok: false, reason: "unavailable" };
    }
}

export async function getAdminTableVisits(): Promise<AdminTableVisitsResult> {
    const access = await getAdminAccess();
    if (access.kind !== "authorized") return { ok: false, reason: "unauthorized" };
    try {
        const supabase = createPrivilegedClient();
        const notStaleSince = new Date(Date.now() - 90 * 60 * 1000).toISOString();
        const { data: visits, error: visitsError } = await supabase
            .from("table_visits")
            .select("id, table_id, started_at, order_window_expires_at, last_activity_at, support_cooldown_until")
            .is("closed_at", null)
            .gt("last_activity_at", notStaleSince)
            .order("started_at", { ascending: false })
            .limit(100);
        if (visitsError || !visits) return { ok: false, reason: "unavailable" };
        if (visits.length === 0) return { ok: true, data: [] };

        const visitIds = visits.map((visit) => visit.id);
        const tableIds = [...new Set(visits.map((visit) => visit.table_id))];
        const [
            { data: tables, error: tableError },
            { data: requests, error: requestError },
            { data: messages, error: messageError },
        ] = await Promise.all([
            supabase.from("restaurant_tables").select("id, table_number, table_name").in("id", tableIds),
            supabase.from("table_visit_support_requests")
                .select("id, visit_id, request_type, customer_message, status, created_at")
                .in("visit_id", visitIds)
                .order("created_at", { ascending: false })
                .limit(150),
            supabase.from("table_visit_messages")
                .select("id, visit_id, sender_type, sender_name, body, created_at")
                .in("visit_id", visitIds)
                .order("created_at", { ascending: true })
                .limit(500),
        ]);
        if (tableError || requestError || messageError || !tables || !requests || !messages) {
            return { ok: false, reason: "unavailable" };
        }
        const tableLabels = new Map(tables.map((table) => [
            table.id,
            table.table_name || `Table ${table.table_number}`,
        ]));
        return {
            ok: true,
            data: visits.map((visit) => ({
                id: visit.id,
                tableId: visit.table_id,
                tableLabel: tableLabels.get(visit.table_id) || "Table",
                startedAt: visit.started_at,
                orderWindowExpiresAt: visit.order_window_expires_at,
                lastActivityAt: visit.last_activity_at,
                supportCooldownUntil: visit.support_cooldown_until,
                requests: requests
                    .filter((request) => request.visit_id === visit.id)
                    .slice(0, 15)
                    .reverse()
                    .map(({ id, request_type, customer_message, status, created_at }) => ({
                        id,
                        request_type,
                        customer_message,
                        status,
                        created_at,
                    })),
                messages: messages
                    .filter((message) => message.visit_id === visit.id)
                    .slice(-50)
                    .map(({ id, sender_type, sender_name, body, created_at }) => ({
                        id,
                        sender_type,
                        sender_name,
                        body,
                        created_at,
                    })),
            })),
        };
    } catch {
        return { ok: false, reason: "unavailable" };
    }
}
