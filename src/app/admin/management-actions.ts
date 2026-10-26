"use server";

import { revalidatePath } from "next/cache";

import { getAdminAccess, hasAdminRole, isUuid } from "@/lib/admin-auth";
import { getPreparationEstimateRange } from "@/lib/admin-data";
import { deleteRestaurantAssetIfUnused } from "@/lib/admin-assets";
import { getAdminCategories, getAdminMenuItems, getAdminRestaurantTables, getMenuPreparationMinutesLimit } from "@/lib/admin-management-data";
import { generateQrToken } from "@/lib/table-management";
import { createPrivilegedClient } from "@/lib/supabase/privileged-server";
import type { Database, Json } from "@/types/database";

type ActionResult = { ok: true; id?: string } | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength: number, required = false) {
    if (typeof value !== "string") return null;
    const cleaned = value.trim();
    if (
        (required && !cleaned)
        || cleaned.length > maxLength
        || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(cleaned)
    ) return null;
    return cleaned;
}

function validSlug(value: unknown): value is string {
    return typeof value === "string"
        && value.length <= 80
        && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function validImageUrl(value: unknown): value is string | null {
    if (value === null || value === "") return true;
    if (typeof value !== "string" || value.length > 2048) return false;
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
    } catch {
        return false;
    }
}

function integerInRange(value: unknown, min: number, max: number): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function parsePrice(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 99_999_999.99) return null;
    return Number(value.toFixed(2)) === value ? value : null;
}

function duplicateReason(error: { code?: string } | null | undefined, field: string) {
    return error?.code === "23505" ? `${field} is already in use.` : "The change could not be saved. Please try again.";
}

function revalidatePublicContent() {
    for (const path of ["/", "/menu", "/about", "/contact", "/admin", "/admin/orders", "/admin/customers", "/admin/menu-items", "/admin/categories", "/admin/settings", "/admin/tables"]) {
        revalidatePath(path);
    }
}

async function authorized() {
    const access = await getAdminAccess();
    return hasAdminRole(access, "owner", "full_admin");
}

export async function saveAdminMenuItemAction(input: unknown): Promise<ActionResult> {
    if (!(await authorized())) return { ok: false, reason: "You are not authorized to manage menu items." };
    if (!isRecord(input)) return { ok: false, reason: "Invalid menu item details." };

    const id = input.id === null || input.id === undefined || input.id === "" ? null : input.id;
    const name = cleanText(input.name, 200, true);
    const slug = validSlug(input.slug) ? input.slug : null;
    const description = cleanText(input.description ?? "", 2000);
    const categoryId = input.categoryId;
    const price = parsePrice(input.price);
    const discountPrice = input.discountPrice === null || input.discountPrice === "" ? null : parsePrice(input.discountPrice);
    const maxPreparation = getMenuPreparationMinutesLimit();
    const preparationTime = input.preparationTime;
    const displayOrder = input.displayOrder;
    const imageUrl = input.imageUrl === "" ? null : input.imageUrl;

    if (
        (id !== null && !isUuid(id))
        || !name
        || description === null
        || !slug
        || !isUuid(categoryId)
        || price === null
        || (input.discountPrice !== null && input.discountPrice !== "" && discountPrice === null)
        || (discountPrice !== null && discountPrice >= price)
        || !integerInRange(preparationTime, 0, maxPreparation)
        || !integerInRange(displayOrder, 0, 100000)
        || !validImageUrl(imageUrl)
        || typeof input.isAvailable !== "boolean"
        || typeof input.isFeatured !== "boolean"
    ) return { ok: false, reason: `Check the fields. Prices must be valid, discounts lower than regular price, and preparation time no more than ${maxPreparation} minutes.` };

    try {
        const supabase = createPrivilegedClient();
        let oldImageUrl: string | null = null;
        if (id) {
            const { data: current, error: readError } = await supabase.from("menu_items").select("image_url").eq("id", id).maybeSingle();
            if (readError || !current) return { ok: false, reason: "The menu item could not be found." };
            oldImageUrl = current.image_url;
        }
        const { data: category, error: categoryError } = await supabase
            .from("menu_categories")
            .select("id")
            .eq("id", categoryId)
            .maybeSingle();
        if (categoryError || !category) return { ok: false, reason: "Choose an existing category." };

        const changes: Database["public"]["Tables"]["menu_items"]["Insert"] = {
            category_id: categoryId,
            name,
            slug,
            description: description || null,
            image_url: imageUrl,
            price,
            discount_price: discountPrice,
            preparation_time_minutes: preparationTime,
            display_order: displayOrder,
            is_available: input.isAvailable,
            is_featured: input.isFeatured,
        };
        const query = id
            ? await supabase.from("menu_items").update(changes).eq("id", id).select("id").maybeSingle()
            : await supabase.from("menu_items").insert(changes).select("id").single();
        if (query.error || !query.data) return { ok: false, reason: duplicateReason(query.error, "This menu slug") };
        if (oldImageUrl && oldImageUrl !== imageUrl) await deleteRestaurantAssetIfUnused(oldImageUrl);
        revalidatePublicContent();
        return { ok: true, id: query.data.id };
    } catch {
        return { ok: false, reason: "The menu item could not be saved. Please try again." };
    }
}

export async function setAdminMenuItemAvailabilityAction(input: unknown): Promise<ActionResult> {
    if (!(await authorized())) return { ok: false, reason: "You are not authorized to manage menu items." };
    if (!isRecord(input) || !isUuid(input.id) || typeof input.isAvailable !== "boolean") {
        return { ok: false, reason: "Invalid availability change." };
    }
    try {
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase.from("menu_items")
            .update({ is_available: input.isAvailable })
            .eq("id", input.id)
            .select("id")
            .maybeSingle();
        if (error || !data) return { ok: false, reason: "Availability could not be changed." };
        revalidatePublicContent();
        return { ok: true, id: data.id };
    } catch {
        return { ok: false, reason: "Availability could not be changed." };
    }
}

export async function saveAdminCategoryAction(input: unknown): Promise<ActionResult> {
    if (!(await authorized())) return { ok: false, reason: "You are not authorized to manage categories." };
    if (!isRecord(input)) return { ok: false, reason: "Invalid category details." };

    const id = input.id === null || input.id === undefined || input.id === "" ? null : input.id;
    const name = cleanText(input.name, 120, true);
    const slug = validSlug(input.slug) ? input.slug : null;
    const description = cleanText(input.description ?? "", 1000);
    const imageUrl = input.imageUrl === "" ? null : input.imageUrl;
    if (
        (id !== null && !isUuid(id))
        || !name
        || description === null
        || !slug
        || !integerInRange(input.displayOrder, 0, 100000)
        || !validImageUrl(imageUrl)
        || typeof input.isActive !== "boolean"
    ) return { ok: false, reason: "Check the category name, slug, image, and display order." };

    try {
        const supabase = createPrivilegedClient();
        let oldImageUrl: string | null = null;
        if (id) {
            const { data: current, error: readError } = await supabase.from("menu_categories").select("image_url").eq("id", id).maybeSingle();
            if (readError || !current) return { ok: false, reason: "The category could not be found." };
            oldImageUrl = current.image_url;
        }
        const changes: Database["public"]["Tables"]["menu_categories"]["Insert"] = {
            name,
            slug,
            description: description || null,
            image_url: imageUrl,
            display_order: input.displayOrder,
            is_active: input.isActive,
        };
        const query = id
            ? await supabase.from("menu_categories").update(changes).eq("id", id).select("id").maybeSingle()
            : await supabase.from("menu_categories").insert(changes).select("id").single();
        if (query.error || !query.data) return { ok: false, reason: duplicateReason(query.error, "This category slug") };
        if (oldImageUrl && oldImageUrl !== imageUrl) await deleteRestaurantAssetIfUnused(oldImageUrl);
        revalidatePublicContent();
        return { ok: true, id: query.data.id };
    } catch {
        return { ok: false, reason: "The category could not be saved. Please try again." };
    }
}

export async function setAdminCategoryActiveAction(input: unknown): Promise<ActionResult> {
    if (!(await authorized())) return { ok: false, reason: "You are not authorized to manage categories." };
    if (!isRecord(input) || !isUuid(input.id) || typeof input.isActive !== "boolean") {
        return { ok: false, reason: "Invalid category status change." };
    }
    try {
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase.from("menu_categories")
            .update({ is_active: input.isActive })
            .eq("id", input.id)
            .select("id")
            .maybeSingle();
        if (error || !data) return { ok: false, reason: "Category status could not be changed." };
        revalidatePublicContent();
        return { ok: true, id: data.id };
    } catch {
        return { ok: false, reason: "Category status could not be changed." };
    }
}

export async function deleteAdminCategoryAction(categoryId: string): Promise<ActionResult> {
    if (!(await authorized())) return { ok: false, reason: "You are not authorized to manage categories." };
    if (!isUuid(categoryId)) return { ok: false, reason: "Invalid category." };
    try {
        const supabase = createPrivilegedClient();
        const { count, error: itemError } = await supabase.from("menu_items")
            .select("id", { count: "exact", head: true })
            .eq("category_id", categoryId);
        if (itemError) return { ok: false, reason: "Could not verify whether this category is in use." };
        if ((count ?? 0) > 0) return { ok: false, reason: "This category contains menu items. Reassign them or deactivate the category instead." };
        const { data, error } = await supabase.from("menu_categories")
            .delete()
            .eq("id", categoryId)
            .select("id")
            .maybeSingle();
        if (error || !data) return { ok: false, reason: "The category could not be deleted." };
        revalidatePublicContent();
        return { ok: true, id: data.id };
    } catch {
        return { ok: false, reason: "The category could not be deleted." };
    }
}

function parseDayHours(value: unknown): Record<string, Json> | null {
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    const validTime = (time: unknown): time is string =>
        typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
    if (!isRecord(value) || Object.keys(value).some((day) => !days.includes(day))) return null;
    const output: Record<string, Json> = {};
    for (const day of days) {
        const hours = value[day];
        if (!isRecord(hours) || typeof hours.closed !== "boolean") return null;

        if (hours.closed) {
            output[day] = {
                closed: true,
                open: validTime(hours.open) ? hours.open : "09:00",
                close: validTime(hours.close) ? hours.close : "22:00",
            };
            continue;
        }
        if (!validTime(hours.open) || !validTime(hours.close)) return null;
        output[day] = { closed: false, open: hours.open, close: hours.close };
    }
    return output;
}

function parseSocialLinks(value: unknown): Record<string, Json> | null {
    const labels = ["website", "facebook", "instagram", "tiktok", "x", "youtube"];
    if (!isRecord(value) || Object.keys(value).some((label) => !labels.includes(label))) return null;
    const output: Record<string, Json> = {};
    for (const label of labels) {
        const rawUrl = value[label] ?? "";
        if (typeof rawUrl !== "string" || rawUrl.length > 2048) return null;
        if (!rawUrl.trim()) continue;
        try {
            const url = new URL(rawUrl.trim());
            if (url.protocol !== "https:") return null;
            output[label] = url.toString();
        } catch {
            return null;
        }
    }
    return output;
}

export async function saveAdminRestaurantSettingsAction(input: unknown): Promise<ActionResult> {
    const access = await getAdminAccess();
    if (!hasAdminRole(access, "owner", "full_admin")) return { ok: false, reason: "You are not authorized to manage restaurant settings." };
    if (!isRecord(input)) return { ok: false, reason: "Invalid restaurant settings." };

    const name = cleanText(input.name, 120, true);
    const description = cleanText(input.description ?? "", 2000);
    const aboutText = cleanText(input.aboutText ?? "", 4000);
    const address = cleanText(input.address ?? "", 300);
    const phone = cleanText(input.phone ?? "", 32);
    const email = cleanText(input.email ?? "", 254);
    const logoUrl = input.logoUrl === "" ? null : input.logoUrl;
    const coverImageUrl = input.coverImageUrl === "" ? null : input.coverImageUrl;
    const openingHours = parseDayHours(input.openingHours);
    const socialLinks = parseSocialLinks(input.socialLinks);
    const estimateRange = getPreparationEstimateRange();
    const orderingMessage = cleanText(input.orderingDisabledMessage ?? "", 300);
    const timeZone = cleanText(input.timeZone, 80, true);
    let validTimeZone = false;
    if (timeZone) {
        try {
            new Intl.DateTimeFormat("en", { timeZone }).format(new Date());
            validTimeZone = true;
        } catch {
            validTimeZone = false;
        }
    }
    if (!name) return { ok: false, reason: "Enter a restaurant name of 120 characters or fewer." };
    if (description === null || aboutText === null) return { ok: false, reason: "Check the description and about text lengths." };
    if (address === null) return { ok: false, reason: "Check the address; it must be 300 characters or fewer." };
    if (phone === null || (phone && !/^[0-9+().\-\s]{7,32}$/.test(phone))) {
        return { ok: false, reason: "Enter a valid phone number using 7–32 digits or common phone punctuation." };
    }
    if (email === null || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
        return { ok: false, reason: "Enter a valid email address of 254 characters or fewer." };
    }
    if (!validImageUrl(logoUrl) || !validImageUrl(coverImageUrl)) {
        return { ok: false, reason: "Logo and cover image URLs must use HTTP or HTTPS." };
    }
    if (!openingHours) return { ok: false, reason: "Check the opening hours; open days need valid 24-hour times." };
    if (!socialLinks) return { ok: false, reason: "Social links must be valid HTTPS URLs." };
    if (orderingMessage === null) return { ok: false, reason: "The ordering-disabled message must be 300 characters or fewer." };
    if (!validTimeZone) return { ok: false, reason: "Enter a valid IANA time zone, such as UTC or Asia/Dhaka." };
    if (
        typeof input.isOrderingEnabled !== "boolean"
        || typeof input.dineInEnabled !== "boolean"
        || typeof input.allowCustomerCancellation !== "boolean"
    ) return { ok: false, reason: "Check the restaurant ordering options." };
    if (!integerInRange(input.defaultPreparationMinutes, estimateRange.min, estimateRange.max)) {
        return { ok: false, reason: `Default preparation time must be between ${estimateRange.min} and ${estimateRange.max} minutes.` };
    }
    if (typeof input.currency !== "string" || !/^[A-Z]{3}$/.test(input.currency)) {
        return { ok: false, reason: "Currency must be a three-letter uppercase ISO code, such as BDT." };
    }
    if (typeof input.isPublished !== "boolean") return { ok: false, reason: "Check the profile publishing option." };

    try {
        const supabase = createPrivilegedClient();
        const { data: current, error: readError } = await supabase.from("restaurant_settings")
            .select("logo_url, cover_image_url")
            .eq("id", 1)
            .maybeSingle();
        if (readError) return { ok: false, reason: "Restaurant settings could not be loaded." };
        const { error } = await supabase.from("restaurant_settings").upsert({
            id: 1,
            name,
            description: description || null,
            about_text: aboutText || null,
            address: address || null,
            phone: phone || null,
            email: email || null,
            logo_url: logoUrl,
            cover_image_url: coverImageUrl,
            opening_hours: openingHours,
            social_links: socialLinks,
            currency: input.currency,
            is_published: input.isPublished,
            is_ordering_enabled: input.isOrderingEnabled,
            ordering_disabled_message: orderingMessage || null,
            dine_in_enabled: input.dineInEnabled,
            allow_customer_cancellation: input.allowCustomerCancellation,
            default_preparation_minutes: input.defaultPreparationMinutes,
            time_zone: timeZone || "UTC",
        }, { onConflict: "id" });
        if (error) return { ok: false, reason: "Restaurant settings could not be saved." };
        const { error: auditError } = await supabase.from("restaurant_admin_audit_log").insert({
            restaurant_id: 1,
            actor_id: access.user.id,
            action: "restaurant_settings_changed",
            metadata: { changedFields: ["profile", "contact", "opening_hours", "social_links", "ordering", "publishing"] },
        });
        if (auditError) return { ok: false, reason: "Settings were saved, but the security audit event could not be recorded. Contact the Owner." };
        if (current?.logo_url && current.logo_url !== logoUrl) await deleteRestaurantAssetIfUnused(current.logo_url);
        if (current?.cover_image_url && current.cover_image_url !== coverImageUrl) await deleteRestaurantAssetIfUnused(current.cover_image_url);
        revalidatePublicContent();
        return { ok: true, id: "1" };
    } catch {
        return { ok: false, reason: "Restaurant settings could not be saved." };
    }
}

function parseTableInput(input: Record<string, unknown>) {
    const tableNumber = cleanText(input.tableNumber, 64, true);
    const tableName = cleanText(input.tableName ?? "", 120);
    if (
        !tableNumber
        || /[\u0000-\u001f\u007f]/.test(tableNumber)
        || tableName === null
        || (tableName !== null && /[\u0000-\u001f\u007f]/.test(tableName))
    ) return null;
    return { table_number: tableNumber, table_name: tableName || null };
}

function isUniqueConflict(error: { code?: string } | null | undefined) {
    return error?.code === "23505";
}

export async function saveAdminTableAction(input: unknown): Promise<ActionResult> {
    if (!(await authorized())) return { ok: false, reason: "You are not authorized to manage tables." };
    if (!isRecord(input)) return { ok: false, reason: "Invalid table details." };
    const id = input.id === null || input.id === undefined || input.id === "" ? null : input.id;
    const table = parseTableInput(input);
    if ((id !== null && !isUuid(id)) || !table) return { ok: false, reason: "Enter a valid table number and display name." };

    try {
        const supabase = createPrivilegedClient();
        const query = id
            ? await supabase.from("restaurant_tables").update(table).eq("id", id).select("id").maybeSingle()
            : await supabase.from("restaurant_tables").insert({ ...table, qr_token: generateQrToken() }).select("id").single();
        if (query.error || !query.data) {
            return { ok: false, reason: isUniqueConflict(query.error) ? "That table number is already in use." : "The table could not be saved." };
        }
        revalidatePath("/admin/tables");
        revalidatePath("/menu");
        return { ok: true, id: query.data.id };
    } catch {
        return { ok: false, reason: "The table could not be saved." };
    }
}

export async function setAdminTableActiveAction(input: unknown): Promise<ActionResult> {
    if (!(await authorized())) return { ok: false, reason: "You are not authorized to manage tables." };
    if (!isRecord(input) || !isUuid(input.id) || typeof input.isActive !== "boolean") {
        return { ok: false, reason: "Invalid table status change." };
    }
    try {
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase.from("restaurant_tables")
            .update({ is_active: input.isActive })
            .eq("id", input.id)
            .select("id")
            .maybeSingle();
        if (error || !data) return { ok: false, reason: "The table status could not be changed." };
        revalidatePath("/admin/tables");
        revalidatePath("/menu");
        return { ok: true, id: data.id };
    } catch {
        return { ok: false, reason: "The table status could not be changed." };
    }
}

export async function loadAdminMenuItemsAction(search: unknown, offset: unknown, filter: unknown) {
    if (!(await authorized())) return { ok: false as const, reason: "unauthorized" as const };
    return getAdminMenuItems(search, offset, filter);
}

export async function loadAdminCategoriesAction() {
    if (!(await authorized())) return { ok: false as const, reason: "unauthorized" as const };
    return getAdminCategories();
}

export async function loadAdminRestaurantTablesAction() {
    if (!(await authorized())) return { ok: false as const, reason: "unauthorized" as const };
    return getAdminRestaurantTables();
}

export async function setAdminMenuItemFeaturedAction(input: unknown): Promise<ActionResult> {
    if (!(await authorized())) return { ok: false, reason: "You are not authorized to manage menu items." };
    if (!isRecord(input) || !isUuid(input.id) || typeof input.isFeatured !== "boolean") {
        return { ok: false, reason: "Invalid featured status." };
    }
    try {
        const supabase = createPrivilegedClient();
        const { data, error } = await supabase.from("menu_items")
            .update({ is_featured: input.isFeatured })
            .eq("id", input.id)
            .select("id")
            .maybeSingle();
        if (error || !data) return { ok: false, reason: "Featured status could not be changed." };
        revalidatePublicContent();
        return { ok: true, id: data.id };
    } catch {
        return { ok: false, reason: "Featured status could not be changed." };
    }
}