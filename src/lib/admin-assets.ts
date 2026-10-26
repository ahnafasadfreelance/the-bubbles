import "server-only";

import sharp from "sharp";

import { getAdminAccess } from "@/lib/admin-auth";
import { createPrivilegedClient } from "@/lib/supabase/privileged-server";

export const RESTAURANT_ASSET_BUCKET = "restaurant-assets";
const MAX_RESTAURANT_LOGO_SIZE = 5 * 1024 * 1024;

function storagePathFromPublicUrl(value: string) {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if (!base) return null;
    try {
        const assetUrl = new URL(value);
        const supabaseUrl = new URL(base);
        const prefix = `/storage/v1/object/public/${RESTAURANT_ASSET_BUCKET}/`;
        if (assetUrl.origin !== supabaseUrl.origin || !assetUrl.pathname.startsWith(prefix)) return null;
        const path = decodeURIComponent(assetUrl.pathname.slice(prefix.length));
        return /^(dish|category|logo|cover)\/[0-9a-f-]{36}\.(?:jpg|png|webp|avif)$/.test(path) ? path : null;
    } catch {
        return null;
    }
}

export async function getRestaurantLogoDataUrl(value: string) {
    const path = storagePathFromPublicUrl(value);
    if (!path?.startsWith("logo/")) {
        throw new Error("The restaurant logo URL is not a valid uploaded logo asset.");
    }

    const supabase = createPrivilegedClient();
    const { data, error } = await supabase.storage.from(RESTAURANT_ASSET_BUCKET).download(path);
    if (error || !data) throw new Error("The restaurant logo could not be downloaded from storage.");
    if (!data.size || data.size > MAX_RESTAURANT_LOGO_SIZE) {
        throw new Error("The restaurant logo must be no larger than 5 MB.");
    }

    const bytes = new Uint8Array(await data.arrayBuffer());
    const identified = identifyImage(bytes);
    if (!identified || !path.endsWith(`.${identified.extension}`)) {
        throw new Error("The restaurant logo is not a supported image.");
    }

    const optimizedLogo = await sharp(bytes, { limitInputPixels: 20_000_000 })
        .resize(256, 256, { fit: "cover", position: "attention" })
        .png({ compressionLevel: 9 })
        .toBuffer();

    return `data:image/png;base64,${optimizedLogo.toString("base64")}`;
}

export async function deleteRestaurantAssetIfUnused(value: string | null | undefined) {
    const access = await getAdminAccess();
    if (access.kind !== "authorized") return;
    if (!value) return;
    const path = storagePathFromPublicUrl(value);
    if (!path) return;

    try {
        const supabase = createPrivilegedClient();
        const references = await Promise.all([
            supabase.from("restaurant_settings").select("id", { count: "exact", head: true }).eq("logo_url", value),
            supabase.from("restaurant_settings").select("id", { count: "exact", head: true }).eq("cover_image_url", value),
            supabase.from("menu_categories").select("id", { count: "exact", head: true }).eq("image_url", value),
            supabase.from("menu_items").select("id", { count: "exact", head: true }).eq("image_url", value),
        ]);
        if (references.some((reference) => reference.error || (reference.count ?? 0) > 0)) return;
        await supabase.storage.from(RESTAURANT_ASSET_BUCKET).remove([path]);
    } catch {
        return;
    }
}

export function identifyImage(bytes: Uint8Array): { mimeType: string; extension: string } | null {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return { mimeType: "image/jpeg", extension: "jpg" };
    }
    if (
        bytes.length >= 8
        && bytes[0] === 0x89
        && bytes[1] === 0x50
        && bytes[2] === 0x4e
        && bytes[3] === 0x47
        && bytes[4] === 0x0d
        && bytes[5] === 0x0a
        && bytes[6] === 0x1a
        && bytes[7] === 0x0a
    ) return { mimeType: "image/png", extension: "png" };

    if (
        bytes.length >= 12
        && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
        && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    ) return { mimeType: "image/webp", extension: "webp" };

    if (
        bytes.length >= 12
        && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp"
        && ["avif", "avis"].includes(String.fromCharCode(...bytes.slice(8, 12)))
    ) return { mimeType: "image/avif", extension: "avif" };

    return null;
}