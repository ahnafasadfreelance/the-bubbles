import type { ComponentPropsWithoutRef } from "react";
import Link from "next/link";
import { Clock3, Utensils } from "lucide-react";

import { RestaurantImage } from "@/components/restaurant-image";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { formatPrice } from "@/lib/format-price";
import type { PublicMenuCategory, PublicMenuItem } from "@/lib/restaurant-data";

export function SectionHeading({
    eyebrow,
    title,
    description,
    align = "left",
    tone = "dark",
}: {
    eyebrow?: string;
    title: string;
    description?: string;
    align?: "left" | "center";
    tone?: "dark" | "light";
}) {
    const alignment = align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-xl";
    const titleColor = tone === "light" ? "text-white" : "text-[#09294d]";
    const detailColor = tone === "light" ? "text-white/70" : "text-[#617991]";

    return (
        <div className={alignment}>
            {eyebrow ? (
                <p className={`mb-2 text-[10px] font-bold uppercase tracking-[0.16em] ${tone === "light" ? "text-[#62d8f4]" : "text-[#0879be]"}`}>
                    {eyebrow}
                </p>
            ) : null}
            <h2 className={`display-heading text-3xl font-bold sm:text-4xl ${titleColor}`}>
                {title}
            </h2>
            {description ? (
                <p className={`mt-2 text-sm leading-6 ${detailColor}`}>{description}</p>
            ) : null}
        </div>
    );
}

export function PageBanner({
    eyebrow,
    title,
    description,
    coverImageUrl,
}: {
    eyebrow: string;
    title: string;
    description: string;
    coverImageUrl?: string | null;
}) {
    return (
        <section className="page-banner-photo relative isolate flex min-h-32 items-center justify-center overflow-hidden px-4 py-6 text-center text-white sm:min-h-56 sm:px-5 sm:py-10">
            <RestaurantImage src={coverImageUrl ?? null} alt="" fill sizes="100vw" className="-z-20" />
            <div className="absolute inset-0 -z-10 bg-linear-to-r from-[#031b34]/85 to-[#031b34]/60" />
            <div className="max-w-2xl">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#62d8f4]">{eyebrow}</p>
                <h1 className="display-heading mt-1 text-2xl font-bold sm:mt-2 sm:text-4xl">{title}</h1>
                <p className="mx-auto mt-1 max-w-xl text-[10px] leading-4 text-white/85 sm:mt-2 sm:text-sm sm:leading-6">{description}</p>
            </div>
        </section>
    );
}

export function FoodCard({
    item,
    currency,
    table = null,
    sessionRequired = false,
    guideTarget = false,
}: {
    item: PublicMenuItem;
    currency: string;
    table?: { tableId: string; tableLabel: string } | null;
    sessionRequired?: boolean;
    guideTarget?: boolean;
}) {
    const hasDiscount = item.discount_price !== null
        && Number.isFinite(item.discount_price)
        && item.discount_price >= 0
        && item.discount_price < item.price;

    return (
        <article className="group overflow-hidden rounded-2xl border border-[#e0e9f0] bg-white shadow-[0_6px_24px_rgba(9,41,77,0.055)] transition-all duration-300 hover:-translate-y-1 hover:border-[#b9d9e8] hover:shadow-[0_16px_36px_rgba(9,41,77,0.12)]">
            <Link href={`/menu/${item.slug}`} aria-label={`View ${item.name}`} className="relative block aspect-[1.24] overflow-hidden bg-[#e6f0f6] p-3 sm:p-4">
                <RestaurantImage
                    src={item.image_url}
                    alt={item.name}
                    fill
                    fit="contain"
                    className="transition-transform duration-500 group-hover:scale-[1.03]"
                />
                <div className="absolute inset-0 bg-linear-to-t from-[#041d37]/35 via-transparent to-transparent opacity-80" />
                {item.is_featured ? (
                    <span className="absolute left-3 top-3 rounded-full border border-white/30 bg-[#06284b]/85 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white shadow-sm backdrop-blur-sm">
                        Guest favorite
                    </span>
                ) : null}
                {hasDiscount ? (
                    <span className="absolute right-3 top-3 rounded-full bg-[#12b8df] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#06223d] shadow-sm">
                        Special price
                    </span>
                ) : null}
            </Link>
            <div className="flex min-h-[220px] flex-col p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#0879be]">{item.category_name}</p>
                        <h3 className="display-heading mt-1.5 text-lg font-bold leading-snug text-[#09294d]"><Link href={`/menu/${item.slug}`} className="transition-colors hover:text-[#087bc1]">{item.name}</Link></h3>
                    </div>
                    <div className="shrink-0 rounded-xl bg-[#f1f7fb] px-2.5 py-2 text-right text-sm font-bold leading-tight text-[#0759a8]">
                        {hasDiscount ? (
                            <>
                                <del className="mb-0.5 block text-[9px] font-medium text-[#8093a4]">{formatPrice(item.price, currency)}</del>
                                <span>{formatPrice(item.discount_price!, currency)}</span>
                            </>
                        ) : <span>{formatPrice(item.price, currency)}</span>}
                    </div>
                </div>
                {item.description ? <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-[#617991]">{item.description}</p> : <div className="mt-2 min-h-10" />}
                {item.preparation_time_minutes > 0 ? (
                    <p className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-[#f1f6fa] px-2.5 py-1 text-[10px] font-medium text-[#617991]">
                        <Clock3 className="h-3.5 w-3.5 text-[#087bc1]" aria-hidden="true" />
                        {item.preparation_time_minutes} min preparation
                    </p>
                ) : <div className="mt-2 min-h-7" />}
                <div className="mt-auto border-t border-[#edf1f5] pt-3">
                    <AddToCartButton item={item} table={table} sessionRequired={sessionRequired} guideTarget={guideTarget} />
                </div>
            </div>
        </article>
    );
}

export function CategoryCard({ item }: { item: PublicMenuCategory }) {
    return (
        <Link href={`/menu#${item.slug}`} className="group block overflow-hidden border border-[#d8e3ed] bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087bc1]">
            <div className="relative aspect-[1.35] overflow-hidden">
                <RestaurantImage src={item.image_url} alt={item.name} fill className="transition-transform duration-400 group-hover:scale-105" />
                <div className="absolute inset-0 bg-linear-to-t from-[#0b2a4c]/60 via-transparent to-[#0b2a4c]/10" />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-linear-to-t from-[#041d37]/90 to-transparent px-4 pb-3 pt-10 text-white">
                    <h3 className="display-heading text-lg font-bold">{item.name}</h3>
                    <Utensils className="h-4 w-4" aria-hidden="true" />
                </div>
            </div>
            <div className="space-y-1 p-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0879be]">
                    {item.display_order > 0 ? `Category ${item.display_order}` : "Menu category"}
                </p>
                <p className="text-xs leading-5 text-[#617991]">{item.description ?? "Explore available dishes in this category."}</p>
            </div>
        </Link>
    );
}

export function ButtonLink({
    href,
    variant = "primary",
    children,
    className,
    ...props
}: {
    href: string;
    variant?: "primary" | "secondary";
    children: React.ReactNode;
    className?: string;
} & ComponentPropsWithoutRef<"a">) {
    const variantClasses =
        variant === "primary"
            ? "bg-[#087bc1] text-white hover:bg-[#0567a4]"
            : "border border-[#b9d0e1] bg-white text-[#0759a8] hover:border-[#70bde0] hover:bg-[#edf8ff]";

    return (
        <a
            href={href}
            className={`inline-flex items-center justify-center rounded-full px-5 py-2.5 text-xs font-bold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#bfe7f6] ${variantClasses} ${className ?? ""}`}
            {...props}
        >
            {children}
        </a>
    );
}
