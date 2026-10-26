"use client";

import Image from "next/image";
import { Utensils } from "lucide-react";
import { useState } from "react";

const supabaseOrigin = (() => {
    const value = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if (!value) return null;

    try {
        return new URL(value).origin;
    } catch {
        return null;
    }
})();

function isOptimizableRestaurantAsset(src: string) {
    try {
        const url = new URL(src);
        const isSupabaseAsset = supabaseOrigin !== null
            && url.origin === supabaseOrigin
            && url.search === ""
            && /^\/storage\/v1\/object\/public\/restaurant-assets\/(?:dish|category|logo|cover)\/[0-9a-f-]{36}\.(?:jpg|png|webp|avif)$/i.test(url.pathname);
        const isUnsplashAsset = url.protocol === "https:"
            && url.hostname === "images.unsplash.com"
            && /^\/photo-[\w-]+$/.test(url.pathname);
        return isSupabaseAsset || isUnsplashAsset;
    } catch {
        return false;
    }
}

export function RestaurantImage({
    src,
    alt,
    className = "",
    fill = false,
    fit = "cover",
    loading = "lazy",
    sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
}: {
    src: string | null;
    alt: string;
    className?: string;
    fill?: boolean;
    fit?: "cover" | "contain";
    loading?: "eager" | "lazy";
    sizes?: string;
}) {
    const [failed, setFailed] = useState(false);
    const positioning = fill ? "absolute inset-0 h-full w-full" : "h-full w-full";
    const fitClass = fit === "contain" ? "object-contain" : "object-cover";

    if (!src || failed) {
        return (
            <span
                className={`${positioning} flex items-center justify-center bg-[#dcebf3] text-[#6e91a8] ${className}`}
                role={alt ? "img" : undefined}
                aria-label={alt ? `${alt} unavailable` : undefined}
                aria-hidden={alt ? undefined : true}
            >
                <Utensils className="h-7 w-7" aria-hidden="true" />
            </span>
        );
    }

    if (isOptimizableRestaurantAsset(src)) {
        return (
            <Image
                src={src}
                alt={alt}
                fill={fill}
                width={fill ? undefined : 256}
                height={fill ? undefined : 256}
                sizes={sizes}
                loading={loading}
                fetchPriority={loading === "eager" ? "high" : undefined}
                quality={75}
                onError={() => setFailed(true)}
                className={`${positioning} ${fitClass} ${className}`}
            />
        );
    }

    return (
        // Database image hosts are configurable, so use the browser loader instead of restricting URLs to a fixed host list.
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={src}
            alt={alt}
            loading={loading}
            decoding="async"
            onError={() => setFailed(true)}
            className={`${positioning} ${fitClass} ${className}`}
        />
    );
}