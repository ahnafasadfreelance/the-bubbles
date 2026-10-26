import "server-only";

import { getAdminAccess, hasAdminRole } from "@/lib/admin-auth";
import { createPrivilegedClient } from "@/lib/supabase/privileged-server";
import type { Database } from "@/types/database";

const PAGE_SIZE = 30;

export type AdminMenuItemFilter = "all" | "featured" | "available" | "unavailable";

export type AdminMenuCategory = Database["public"]["Tables"]["menu_categories"]["Row"];
export type AdminMenuItem = Database["public"]["Tables"]["menu_items"]["Row"] & { category_name: string };
export type AdminRestaurantSettings = Database["public"]["Tables"]["restaurant_settings"]["Row"];
export type AdminRestaurantTable = Database["public"]["Tables"]["restaurant_tables"]["Row"];
export type AdminRestaurantTableSummary = Omit<AdminRestaurantTable, "qr_token">;

export type AdminPageData<T> =
    | { ok: true; data: T }
    | { ok: false; reason: "unauthorized" | "unavailable" | "invalid" };

function parseListOptions(searchValue: unknown, offsetValue: unknown) {
    const search = searchValue === undefined ? "" : searchValue;
    const offset = offsetValue === undefined ? 0 : offsetValue;
    if (
        typeof search !== "string"
        || search.length > 80
        || /[\u0000-\u001f\u007f]/.test(search)
        || !Number.isInteger(offset)
        || (offset as number) < 0
        || (offset as number) > 100000
    ) return null;
    return { search: search.trim(), offset: offset as number };
}

async function isAuthorized() {
    const access = await getAdminAccess();
    return hasAdminRole(access, "owner", "full_admin");
}

export async function getAdminCategories(): Promise<AdminPageData<AdminMenuCategory[]>> {
    if (!(await isAuthorized())) return { ok: false, reason: "unauthorized" };
    try {
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase
            .from("menu_categories")
            .select("id, name, slug, description, image_url, display_order, is_active, created_at, updated_at")
            .order("display_order", { ascending: true })
            .order("name", { ascending: true })
            .limit(500);
        return error || !data
            ? { ok: false, reason: "unavailable" }
            : { ok: true, data };
    } catch {
        return { ok: false, reason: "unavailable" };
    }
}

export async function getAdminMenuItems(
    searchValue: unknown,
    offsetValue: unknown,
    filterValue: unknown = "all",
): Promise<AdminPageData<{ items: AdminMenuItem[]; categories: Pick<AdminMenuCategory, "id" | "name" | "is_active">[]; total: number; counts: Record<AdminMenuItemFilter, number> }>> {
    if (!(await isAuthorized())) return { ok: false, reason: "unauthorized" };
    const options = parseListOptions(searchValue, offsetValue);
    if (!options || (filterValue !== "all" && filterValue !== "featured" && filterValue !== "available" && filterValue !== "unavailable")) return { ok: false, reason: "invalid" };

    try {
        const supabase = createPrivilegedClient();
        const filter = filterValue as AdminMenuItemFilter;
        let query = supabase
            .from("menu_items")
            .select("id, category_id, name, slug, description, image_url, price, discount_price, preparation_time_minutes, is_available, is_featured, display_order, created_at, updated_at", { count: "exact" });
        if (options.search) {
            const escapedSearch = options.search.replace(/[\\%_]/g, "\\$&");
            query = query.ilike("name", `%${escapedSearch}%`);
        }
        if (filter === "featured") query = query.eq("is_featured", true);
        if (filter === "available") query = query.eq("is_available", true);
        if (filter === "unavailable") query = query.eq("is_available", false);

        const { data: itemRows, count, error } = await query
            .order("display_order", { ascending: true })
            .order("name", { ascending: true })
            .range(options.offset, options.offset + PAGE_SIZE - 1);
        if (error || !itemRows) return { ok: false, reason: "unavailable" };

        const categoryIds = [...new Set(itemRows.map((item) => item.category_id))];
        const { data: categoryRows, error: categoryError } = await supabase
            .from("menu_categories")
            .select("id, name, is_active")
            .order("display_order", { ascending: true })
            .limit(500);
        if (categoryError || !categoryRows) return { ok: false, reason: "unavailable" };

        const countFor = async (selectedFilter: AdminMenuItemFilter) => {
            let countQuery = supabase.from("menu_items").select("id", { count: "exact", head: true });
            if (options.search) {
                const escapedSearch = options.search.replace(/[\\%_]/g, "\\$&");
                countQuery = countQuery.ilike("name", `%${escapedSearch}%`);
            }
            if (selectedFilter === "featured") countQuery = countQuery.eq("is_featured", true);
            if (selectedFilter === "available") countQuery = countQuery.eq("is_available", true);
            if (selectedFilter === "unavailable") countQuery = countQuery.eq("is_available", false);
            return countQuery;
        };
        const countResults = await Promise.all((["all", "featured", "available", "unavailable"] as const).map(countFor));
        if (countResults.some((result) => result.error)) return { ok: false, reason: "unavailable" };
        const categoryNames = new Map(categoryRows.map((category) => [category.id, category.name]));
        const items = itemRows.map((item) => ({
            ...item,
            category_name: categoryNames.get(item.category_id) ?? "Unassigned category",
        }));

        return {
            ok: true,
            data: {
                items,
                categories: categoryRows.filter((category) => categoryIds.includes(category.id) || category.is_active),
                total: count ?? 0,
                counts: {
                    all: countResults[0].count ?? 0,
                    featured: countResults[1].count ?? 0,
                    available: countResults[2].count ?? 0,
                    unavailable: countResults[3].count ?? 0,
                },
            },
        };
    } catch {
        return { ok: false, reason: "unavailable" };
    }
}

export async function getAdminRestaurantSettings(): Promise<AdminPageData<AdminRestaurantSettings | null>> {
    if (!(await isAuthorized())) return { ok: false, reason: "unauthorized" };
    try {
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase
            .from("restaurant_settings")
            .select("id, name, logo_url, cover_image_url, description, about_text, address, phone, email, opening_hours, social_links, currency, is_published, is_ordering_enabled, ordering_disabled_message, dine_in_enabled, allow_customer_cancellation, default_preparation_minutes, time_zone, created_at, updated_at")
            .eq("id", 1)
            .maybeSingle();
        return error ? { ok: false, reason: "unavailable" } : { ok: true, data };
    } catch {
        return { ok: false, reason: "unavailable" };
    }
}

export async function getAdminRestaurantTables(): Promise<AdminPageData<AdminRestaurantTableSummary[]>> {
    if (!(await isAuthorized())) return { ok: false, reason: "unauthorized" };
    try {
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase
            .from("restaurant_tables")
            .select("id, table_number, table_name, is_active, created_at, updated_at")
            .order("table_number", { ascending: true })
            .limit(500);
        return error || !data
            ? { ok: false, reason: "unavailable" }
            : { ok: true, data };
    } catch {
        return { ok: false, reason: "unavailable" };
    }
}

export function getMenuPreparationMinutesLimit() {
    const configured = Number(process.env.MAX_MENU_PREPARATION_MINUTES ?? 480);
    return Number.isInteger(configured) && configured >= 1 && configured <= 1440 ? configured : 480;
}

export async function getAdminRestaurantTable(tableId: unknown): Promise<AdminPageData<AdminRestaurantTable>> {
    if (!(await isAuthorized())) return { ok: false, reason: "unauthorized" };
    if (typeof tableId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tableId)) {
        return { ok: false, reason: "invalid" };
    }
    try {
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase.from("restaurant_tables")
            .select("id, table_number, table_name, qr_token, is_active, created_at, updated_at")
            .eq("id", tableId)
            .maybeSingle();
        if (error) return { ok: false, reason: "unavailable" };
        return data ? { ok: true, data } : { ok: false, reason: "invalid" };
    } catch {
        return { ok: false, reason: "unavailable" };
    }
}