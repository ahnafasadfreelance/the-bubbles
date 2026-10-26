"use client";

import Link from "next/link";
import { BadgePercent, Clock3, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AddToCartButton } from "@/components/add-to-cart-button";
import { DataNotice } from "@/components/data-notice";
import { RestaurantImage } from "@/components/restaurant-image";
import { FoodCard } from "@/components/ui";
import { formatPrice } from "@/lib/format-price";
import type { DataStatus, PublicMenuCategory, PublicMenuItem } from "@/lib/restaurant-data";

function isDiscounted(item: PublicMenuItem): item is PublicMenuItem & { discount_price: number } {
    return item.discount_price !== null
        && Number.isFinite(item.discount_price)
        && item.discount_price >= 0
        && item.discount_price < item.price;
}

export function MenuCatalog({
    categories,
    items,
    currency,
    table,
    offersView,
    hasOffers,
    itemStatus,
}: {
    categories: PublicMenuCategory[];
    items: PublicMenuItem[];
    currency: string;
    table: { tableId: string; tableLabel: string } | null;
    offersView: boolean;
    hasOffers: boolean;
    itemStatus: DataStatus;
}) {
    const [search, setSearch] = useState("");
    const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
    const query = search.trim().toLocaleLowerCase();
    const visibleItems = useMemo(() => {
        const offerItems = offersView ? items.filter(isDiscounted) : items;
        if (!query) return offerItems;

        return offerItems.filter((item) =>
            [item.name, item.category_name, item.description ?? ""]
                .some((value) => value.toLocaleLowerCase().includes(query)),
        );
    }, [items, offersView, query]);
    const visibleCategories = useMemo(
        () => categories.filter((category) =>
            visibleItems.some((item) => item.category_id === category.id),
        ),
        [categories, visibleItems],
    );
    const selectedCategoryId = visibleCategories.some((category) => category.id === activeCategoryId)
        ? activeCategoryId
        : visibleCategories[0]?.id ?? null;

    useEffect(() => {
        if (visibleCategories.length === 0) return;

        const categoryIds = visibleCategories.map((category) => category.id);

        let frame = 0;
        function updateActiveCategory() {
            window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(() => {
                const activationLine = window.innerWidth < 768 ? 120 : 136;
                const sections = visibleCategories
                    .map((category) => document.getElementById(category.slug))
                    .filter((section): section is HTMLElement => section !== null);
                const activeSection = sections.reduce<HTMLElement | null>((active, section) => {
                    return section.getBoundingClientRect().top <= activationLine ? section : active;
                }, null);

                setActiveCategoryId(activeSection?.dataset.categoryId ?? categoryIds[0]);
            });
        }

        window.addEventListener("scroll", updateActiveCategory, { passive: true });
        window.addEventListener("resize", updateActiveCategory);
        updateActiveCategory();

        return () => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener("scroll", updateActiveCategory);
            window.removeEventListener("resize", updateActiveCategory);
        };
    }, [visibleCategories]);

    return (
        <div id="menu" className="scroll-mt-28 space-y-4">
            <label htmlFor="menu-search" className="sr-only">Search menu items by name, ingredient, or category</label>
            <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-[#d8e3ed] bg-white px-4 shadow-[0_4px_18px_rgba(9,41,77,0.045)] transition focus-within:border-[#56b6d5] focus-within:ring-4 focus-within:ring-[#12b8df]/10">
                <Search className="h-5 w-5 shrink-0 text-[#0879be]" aria-hidden="true" />
                <input
                    id="menu-search"
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    maxLength={100}
                    placeholder="Search dishes, ingredients, or categories..."
                    className="min-w-0 flex-1 bg-transparent text-sm text-[#09294d] outline-none placeholder:text-[#8aa0b2] sm:text-base"
                />
                {search ? (
                    <button
                        type="button"
                        onClick={() => setSearch("")}
                        aria-label="Clear menu search"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#617991] transition hover:bg-[#edf5fa] hover:text-[#09294d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087bc1]"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                ) : null}
            </div>

            <nav data-tour="categories" aria-label="Menu filters and categories" className="sticky top-14 z-20 -mx-4 flex gap-2 overflow-x-auto border-y border-[#d9e5ef] bg-[#f7faff]/95 px-4 py-3 backdrop-blur-md sm:top-[68px] sm:mx-0 sm:flex-wrap sm:rounded-2xl sm:border sm:bg-white/90 sm:px-3 sm:py-3 sm:shadow-sm">
                <Link
                    href="/menu"
                    aria-current={!offersView ? "page" : undefined}
                    className={`inline-flex min-h-10 shrink-0 items-center rounded-full px-4 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17c5eb] ${!offersView && !selectedCategoryId ? "bg-[#06284b] text-white shadow-sm" : "border border-[#d8e3ed] bg-white text-[#0759a8] hover:border-[#8bcbe2] hover:bg-[#edf8ff]"}`}
                >
                    All
                </Link>
                {hasOffers ? (
                    <Link
                        href="/menu?offers=1"
                        aria-current={offersView ? "page" : undefined}
                        className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17c5eb] ${offersView ? "bg-[#06284b] text-white shadow-sm" : "border border-[#d8e3ed] bg-white text-[#0759a8] hover:border-[#8bcbe2] hover:bg-[#edf8ff]"}`}
                    >
                        <BadgePercent className="h-4 w-4" aria-hidden="true" />
                        Offers
                    </Link>
                ) : null}
                {visibleCategories.map((category) => (
                    <a
                        key={category.id}
                        data-tour-action="category"
                        href={`#${category.slug}`}
                        aria-current={selectedCategoryId === category.id ? "location" : undefined}
                        onClick={() => setActiveCategoryId(category.id)}
                        className={`inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087bc1] ${selectedCategoryId === category.id ? "border-[#12b8df] bg-[#12b8df] text-[#06223d] shadow-sm" : "border-[#d8e3ed] bg-white text-[#0759a8] hover:border-[#8bcbe2] hover:bg-[#edf8ff]"}`}
                    >
                        {category.name}
                    </a>
                ))}
            </nav>

            {itemStatus === "error" ? <DataNotice status={itemStatus} subject="Menu dishes" /> : null}

            {itemStatus !== "error" && visibleItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#b9d0e1] bg-white px-5 py-12 text-center">
                    {query ? (
                        <>
                            <Search className="mx-auto h-8 w-8 text-[#087bc1]" aria-hidden="true" />
                            <h2 className="display-heading mt-3 text-xl font-bold text-[#09294d]">No dishes found</h2>
                            <p className="mt-1 text-sm text-[#617991]">Try another dish, ingredient, or category.</p>
                            <button type="button" onClick={() => setSearch("")} className="mt-4 rounded-full bg-[#06284b] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#087bc1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12b8df]">
                                Clear search
                            </button>
                        </>
                    ) : offersView ? (
                        <>
                            <BadgePercent className="mx-auto h-9 w-9 text-[#087bc1]" aria-hidden="true" />
                            <h2 className="display-heading mt-3 text-xl font-bold text-[#09294d]">No offers available right now</h2>
                            <p className="mt-1 text-sm text-[#617991]">Check back soon for special prices on our menu.</p>
                        </>
                    ) : (
                        <>
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0879be]">Menu update</p>
                            <h2 className="display-heading mt-2 text-2xl font-bold text-[#09294d]">No dishes are available right now.</h2>
                        </>
                    )}
                </div>
            ) : null}

            {itemStatus !== "error" && visibleItems.length > 0 ? (
                <div className="space-y-10 sm:space-y-14">
                    {visibleCategories.map((category, categoryIndex) => {
                        const categoryItems = visibleItems.filter((item) => item.category_id === category.id);
                        return (
                            <section key={category.id} id={category.slug} data-category-id={category.id} className="scroll-mt-32">
                                <div className="mb-4 flex items-end justify-between gap-4 border-b border-[#d9e5ef] pb-3 sm:mb-6 sm:pb-4">
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0879be]">Category {String(categoryIndex + 1).padStart(2, "0")}</p>
                                        <h2 className="display-heading mt-1 text-2xl font-bold text-[#09294d] sm:text-3xl">{category.name}</h2>
                                        {category.description ? <p className="mt-1 max-w-2xl text-sm text-[#617991]">{category.description}</p> : null}
                                    </div>
                                    <span className="shrink-0 rounded-full bg-[#0b3b5b] px-3 py-1.5 text-[10px] font-bold text-[#e9f5ff]">{categoryItems.length} {categoryItems.length === 1 ? "dish" : "dishes"}</span>
                                </div>
                                <div className="space-y-3 md:hidden">
                                    {categoryItems.map((item) => {
                                        const discounted = isDiscounted(item);
                                        const price = discounted ? item.discount_price : item.price;
                                        return (
                                            <article key={item.id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-[#e0e9f0] bg-white p-3 shadow-[0_4px_18px_rgba(9,41,77,0.045)] transition hover:border-[#b9d9e8] sm:gap-4 sm:p-4">
                                                <Link href={`/menu/${item.slug}`} aria-label={`View ${item.name}`} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[#e6f0f6] p-1 sm:h-28 sm:w-28 sm:p-1.5">
                                                    <RestaurantImage src={item.image_url} alt={item.name} fill fit="contain" sizes="112px" className="transition-transform duration-500 hover:scale-105" />
                                                    {item.is_featured ? <span className="absolute left-1.5 top-1.5 rounded-full bg-[#06284b]/90 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-white">Popular</span> : null}
                                                </Link>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#0879be]">{item.category_name}</p>
                                                    <h3 className="mt-0.5 line-clamp-2 text-sm font-bold leading-5 text-[#09294d]"><Link href={`/menu/${item.slug}`} className="transition-colors hover:text-[#087bc1]">{item.name}</Link></h3>
                                                    {item.description ? <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-[#536d82]">{item.description}</p> : null}
                                                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#536d82]">
                                                        <span className="font-bold tabular-nums text-[#0759a8]">{formatPrice(price, currency)}</span>
                                                        {discounted ? <del className="tabular-nums text-[#617991]">{formatPrice(item.price, currency)}</del> : null}
                                                        {item.preparation_time_minutes > 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-[#f1f6fa] px-2 py-0.5"><Clock3 className="h-3 w-3 text-[#087bc1]" aria-hidden="true" />{item.preparation_time_minutes} min</span> : null}
                                                    </div>
                                                </div>
                                                <AddToCartButton item={item} table={table} sessionRequired={Boolean(table)} compact guideTarget />
                                            </article>
                                        );
                                    })}
                                </div>
                                <div className="hidden gap-4 md:grid md:grid-cols-2 lg:grid-cols-3">
                                    {categoryItems.map((item) => (
                                        <FoodCard key={item.id} item={item} currency={currency} table={table} sessionRequired={Boolean(table)} guideTarget />
                                    ))}
                                </div>
                            </section>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
