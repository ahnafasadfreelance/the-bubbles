import { cache } from "react";

import { restaurantConfig } from "@/lib/site";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";

type RestaurantSettingsRow = Pick<
    Database["public"]["Tables"]["restaurant_settings"]["Row"],
    | "name"
    | "logo_url"
    | "cover_image_url"
    | "description"
    | "about_text"
    | "address"
    | "phone"
    | "email"
    | "opening_hours"
    | "social_links"
    | "currency"
    | "is_ordering_enabled"
    | "ordering_disabled_message"
    | "dine_in_enabled"
    | "allow_customer_cancellation"
    | "time_zone"
>;

export type PublicMenuCategory = Pick<
    Database["public"]["Tables"]["menu_categories"]["Row"],
    "id" | "name" | "slug" | "description" | "image_url" | "display_order"
>;

export type PublicMenuItem = Pick<
    Database["public"]["Tables"]["menu_items"]["Row"],
    | "id"
    | "slug"
    | "category_id"
    | "name"
    | "description"
    | "image_url"
    | "price"
    | "discount_price"
    | "preparation_time_minutes"
    | "display_order"
    | "is_featured"
> & { category_name: string };

export type DataStatus = "ready" | "empty" | "unconfigured" | "error";

export type RestaurantSettings = {
    name: string;
    logoUrl: string | null;
    coverImageUrl: string | null;
    description: string | null;
    aboutText: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    openingHours: string | null;
    socialLinks: { label: string; url: string }[];
    currency: string;
    timeZone: string;
    isOrderingEnabled: boolean;
    dineInEnabled: boolean;
    allowCustomerCancellation: boolean;
    orderingDisabledMessage: string | null;
    orderingAvailabilityMessage: string;
};

function jsonObject(value: Json): Record<string, Json | undefined> {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
}

function displayOpeningHours(value: Json) {
    if (typeof value === "string") return value.trim() || null;

    const entries = Object.entries(jsonObject(value)).flatMap(([day, hours]) => {
        if (typeof hours === "string" && hours.trim()) return [`${day}: ${hours}`];
        if (hours === null || typeof hours !== "object" || Array.isArray(hours)) return [];
        const schedule = hours as Record<string, Json | undefined>;
        if (schedule.closed === true) return [`${day}: Closed`];
        if (typeof schedule.open === "string" && typeof schedule.close === "string") return [`${day}: ${schedule.open}–${schedule.close}`];
        return [];
    });

    return entries.length
        ? entries.join(" · ")
        : null;
}

function readSocialLinks(value: Json) {
    return Object.entries(jsonObject(value)).flatMap(([label, rawUrl]) => {
        if (typeof rawUrl !== "string") return [];

        try {
            const url = new URL(rawUrl);
            if (url.protocol !== "https:" && url.protocol !== "http:") return [];
            return [{ label, url: url.toString() }];
        } catch {
            return [];
        }
    });
}

function toRestaurantSettings(row: RestaurantSettingsRow | null): RestaurantSettings {
    if (!row) {
        return {
            name: restaurantConfig.fallbackName,
            logoUrl: null,
            coverImageUrl: null,
            description: null,
            aboutText: null,
            address: null,
            phone: null,
            email: null,
            openingHours: null,
            socialLinks: [],
            currency: "BDT",
            timeZone: "UTC",
            isOrderingEnabled: false,
            dineInEnabled: true,
            allowCustomerCancellation: false,
            orderingDisabledMessage: null,
            orderingAvailabilityMessage: "Ordering availability could not be confirmed",
        };
    }

    const hours = jsonObject(row.opening_hours);
    const now = new Date();
    const localParts = new Intl.DateTimeFormat("en", {
        timeZone: row.time_zone || "UTC",
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(now);
    const localDay = (localParts.find((part) => part.type === "weekday")?.value ?? "").toLowerCase();
    const localMinute = Number(localParts.find((part) => part.type === "hour")?.value) * 60
        + Number(localParts.find((part) => part.type === "minute")?.value);
    const structuredHours = Object.values(hours).some((value) => value !== null && typeof value === "object" && !Array.isArray(value));
    let withinHours = true;
    if (structuredHours) {
        const keys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
        const today = keys.indexOf(localDay);
        const todayHours = jsonObject(hours[localDay] ?? {});
        const previousHours = jsonObject(hours[keys[(today + 6) % 7]] ?? {});
        const isScheduleOpen = (schedule: Record<string, Json | undefined>, minute: number, previousDay = false) => {
            if (schedule.closed === true || typeof schedule.open !== "string" || typeof schedule.close !== "string") return false;
            const [openHour, openMinute] = schedule.open.split(":").map(Number);
            const [closeHour, closeMinute] = schedule.close.split(":").map(Number);
            const open = openHour * 60 + openMinute;
            const close = closeHour * 60 + closeMinute;
            if (!Number.isFinite(open) || !Number.isFinite(close)) return false;
            return open < close ? (!previousDay && minute >= open && minute < close) : previousDay ? minute < close : minute >= open;
        };
        withinHours = isScheduleOpen(todayHours, localMinute) || isScheduleOpen(previousHours, localMinute, true);
    }
    const accepting = row.is_ordering_enabled && row.dine_in_enabled && withinHours;
    const availabilityMessage = !row.is_ordering_enabled
        ? row.ordering_disabled_message?.trim() || "Ordering is temporarily unavailable"
        : !row.dine_in_enabled
            ? "Dine-in ordering is temporarily unavailable"
            : !withinHours
                ? "The restaurant is currently closed"
                : "Restaurant is currently accepting orders";

    return {
        name: row.name || restaurantConfig.fallbackName,
        logoUrl: row.logo_url,
        coverImageUrl: row.cover_image_url,
        description: row.description?.trim() || null,
        aboutText: row.about_text?.trim() || null,
        address: row.address?.trim() || null,
        phone: row.phone?.trim() || null,
        email: row.email?.trim() || null,
        openingHours: displayOpeningHours(row.opening_hours),
        socialLinks: readSocialLinks(row.social_links),
        currency: row.currency || "BDT",
        timeZone: row.time_zone || "UTC",
        isOrderingEnabled: row.is_ordering_enabled,
        dineInEnabled: row.dine_in_enabled,
        allowCustomerCancellation: row.allow_customer_cancellation,
        orderingDisabledMessage: row.ordering_disabled_message,
        orderingAvailabilityMessage: accepting ? "Restaurant is currently accepting orders" : availabilityMessage,
    };
}

export const getRestaurantSettings = cache(async () => {
    if (!isSupabaseConfigured()) {
        return { restaurant: toRestaurantSettings(null), status: "unconfigured" as const };
    }

    try {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("restaurant_settings")
            .select("name, logo_url, cover_image_url, description, about_text, address, phone, email, opening_hours, social_links, currency, is_ordering_enabled, ordering_disabled_message, dine_in_enabled, allow_customer_cancellation, time_zone")
            .eq("id", 1)
            .eq("is_published", true)
            .maybeSingle();

        if (error) {
            return { restaurant: toRestaurantSettings(null), status: "error" as const };
        }

        return {
            restaurant: toRestaurantSettings(data),
            status: data ? "ready" as const : "empty" as const,
        };
    } catch {
        return { restaurant: toRestaurantSettings(null), status: "error" as const };
    }
});

export const getMenuCatalog = cache(async () => {
    const empty = {
        categories: [] as PublicMenuCategory[],
        items: [] as PublicMenuItem[],
    };

    const settings = await getRestaurantSettings();
    if (settings.status !== "ready") {
        return {
            ...empty,
            categoryStatus: settings.status,
            itemStatus: settings.status,
        };
    }

    try {
        const supabase = await createClient();
        const { data: categoryRows, error: categoryError } = await supabase
            .from("menu_categories")
            .select("id, name, slug, description, image_url, display_order")
            .eq("is_active", true)
            .order("display_order", { ascending: true })
            .order("name", { ascending: true });

        if (categoryError) {
            return { ...empty, categoryStatus: "error" as const, itemStatus: "error" as const };
        }

        const categories = categoryRows ?? [];
        if (categories.length === 0) {
            return { ...empty, categoryStatus: "empty" as const, itemStatus: "empty" as const };
        }

        const { data: itemRows, error: itemError } = await supabase
            .from("menu_items")
            .select("id, category_id, name, slug, description, image_url, price, discount_price, preparation_time_minutes, display_order, is_featured")
            .eq("is_available", true)
            .in("category_id", categories.map((category) => category.id))
            .order("display_order", { ascending: true })
            .order("name", { ascending: true });

        if (itemError) {
            return {
                categories,
                items: [],
                categoryStatus: "ready" as const,
                itemStatus: "error" as const,
            };
        }

        const categoryNames = new Map(categories.map(({ id, name }) => [id, name]));
        const items = (itemRows ?? []).flatMap((item) => {
            const categoryName = categoryNames.get(item.category_id);
            return categoryName ? [{ ...item, category_name: categoryName }] : [];
        });

        return {
            categories,
            items,
            categoryStatus: "ready" as const,
            itemStatus: items.length ? "ready" as const : "empty" as const,
        };
    } catch {
        return { ...empty, categoryStatus: "error" as const, itemStatus: "error" as const };
    }
});