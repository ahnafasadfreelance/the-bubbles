import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

import { getAdminAccess, hasAdminRole } from "@/lib/admin-auth";
import { deleteRestaurantAssetIfUnused, identifyImage, RESTAURANT_ASSET_BUCKET } from "@/lib/admin-assets";
import { createPrivilegedClient } from "@/lib/supabase/privileged-server";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const IMAGE_ROLES = new Set(["dish", "category", "logo", "cover"]);
const ERROR_RESPONSE = { ok: false, error: "The image could not be uploaded. Check the file and try again." };

function sameOriginRequest(request: Request) {
    const originValue = request.headers.get("origin");
    const requestHost = (request.headers.get("x-forwarded-host") ?? request.headers.get("host"))?.split(",")[0].trim();
    if (!originValue || !requestHost) return false;
    try {
        const origin = new URL(originValue);
        return (origin.protocol === "https:" || origin.protocol === "http:") && origin.host === requestHost;
    } catch {
        return false;
    }
}

export async function POST(request: Request) {
    if (!sameOriginRequest(request)) return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
    const access = await getAdminAccess();
    if (!hasAdminRole(access, "owner", "full_admin")) return NextResponse.json({ ok: false, error: "Administrator access is required." }, { status: 403 });

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_FILE_SIZE + 64 * 1024) {
        return NextResponse.json({ ok: false, error: "Images must be 5 MB or smaller." }, { status: 413 });
    }

    try {
        const form = await request.formData();
        const file = form.get("file");
        const role = form.get("role");
        if (!(file instanceof File) || typeof role !== "string" || !IMAGE_ROLES.has(role)) {
            return NextResponse.json(ERROR_RESPONSE, { status: 400 });
        }
        if (!file.size || file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ ok: false, error: "Images must be between 1 byte and 5 MB." }, { status: 413 });
        }

        const source = new Uint8Array(await file.arrayBuffer());
        const identified = identifyImage(source);
        if (!identified) return NextResponse.json({ ok: false, error: "Use a valid JPEG, PNG, WebP, or AVIF image." }, { status: 415 });
        if (file.type && file.type !== identified.mimeType) {
            return NextResponse.json({ ok: false, error: "The file contents do not match the declared image type." }, { status: 415 });
        }

        const maxDimension = role === "logo" ? 512 : role === "category" ? 1200 : 1600;
        const optimizedImage = await sharp(source, { limitInputPixels: 40_000_000 })
            .rotate()
            .resize(maxDimension, maxDimension, { fit: "inside", withoutEnlargement: true })
            .webp({ quality: 78, effort: 4 })
            .toBuffer();
        const path = `${role}/${randomUUID()}.webp`;
        const supabase = createPrivilegedClient();
        const { error } = await supabase.storage.from(RESTAURANT_ASSET_BUCKET).upload(path, optimizedImage, {
            cacheControl: "31536000",
            contentType: "image/webp",
            upsert: false,
        });
        if (error) return NextResponse.json(ERROR_RESPONSE, { status: 503 });

        const { data } = supabase.storage.from(RESTAURANT_ASSET_BUCKET).getPublicUrl(path);
        return NextResponse.json({ ok: true, url: data.publicUrl }, { status: 201 });
    } catch {
        return NextResponse.json(ERROR_RESPONSE, { status: 400 });
    }
}

export async function DELETE(request: Request) {
    if (!sameOriginRequest(request)) return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
    const access = await getAdminAccess();
    if (!hasAdminRole(access, "owner", "full_admin")) return NextResponse.json({ ok: false, error: "Administrator access is required." }, { status: 403 });

    try {
        const input: unknown = await request.json();
        if (!input || typeof input !== "object" || Array.isArray(input) || typeof (input as { url?: unknown }).url !== "string") {
            return NextResponse.json({ ok: false, error: "Invalid image reference." }, { status: 400 });
        }
        await deleteRestaurantAssetIfUnused((input as { url: string }).url);
        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ ok: false, error: "The image cleanup could not be completed." }, { status: 400 });
    }
}