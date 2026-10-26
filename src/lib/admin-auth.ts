import "server-only";

import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/supabase/auth-server";
import { createPrivilegedClient } from "@/lib/supabase/privileged-server";
import { hasAdminRole, type AdminRole } from "@/lib/admin-role-policy";

export { hasAdminRole, type AdminRole };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdminAccess =
    | { kind: "unauthenticated" }
    | { kind: "forbidden"; user: User }
    | { kind: "unavailable"; user: User }
    | { kind: "authorized"; user: User; role: AdminRole; membershipId: string };

export const getAdminAccess = cache(async (): Promise<AdminAccess> => {
    const user = await getCurrentUser();
    if (!user) return { kind: "unauthenticated" };

    try {
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase
            .from("restaurant_staff_memberships")
            .select("id, role")
            .eq("restaurant_id", 1)
            .eq("user_id", user.id)
            .eq("status", "active")
            .maybeSingle();
        if (error) return { kind: "unavailable", user };
        if (!data) return { kind: "forbidden", user };
        if (data.role !== "owner" && data.role !== "full_admin" && data.role !== "order_management") {
            return { kind: "unavailable", user };
        }
        return { kind: "authorized", user, role: data.role, membershipId: data.id };
    } catch {
        return { kind: "unavailable", user };
    }
});

export async function requireAdminRole(...roles: AdminRole[]) {
    const access = await getAdminAccess();
    if (access.kind === "unauthenticated") redirect("/login?next=%2Fadmin");
    if (access.kind !== "authorized") redirect("/");
    if (!roles.includes(access.role)) redirect("/admin/orders");
    return access;
}

export function isUuid(value: unknown): value is string {
    return typeof value === "string" && UUID_PATTERN.test(value);
}