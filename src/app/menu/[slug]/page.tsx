import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Clock3 } from "lucide-react";
import { notFound } from "next/navigation";

import { DishDetailActions } from "@/components/dish-detail-actions";
import { FloatingCartButton } from "@/components/floating-cart-button";
import { OrderingSessionNotice, OrderingSessionProvider } from "@/components/ordering-session";
import { RestaurantImage } from "@/components/restaurant-image";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { formatPrice } from "@/lib/format-price";
import { getMenuCatalog, getRestaurantSettings } from "@/lib/restaurant-data";
import { getCurrentOrderingSession } from "@/lib/ordering-session";
import { getCurrentTableContext } from "@/lib/table-context";

type DishPageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: DishPageProps): Promise<Metadata> {
    const [{ slug }, catalog] = await Promise.all([params, getMenuCatalog()]);
    const item = catalog.items.find((menuItem) => menuItem.slug === slug);
    const description = item?.description ?? "View this dish and its current price on the restaurant menu.";
    return {
        title: item?.name ?? "Dish details",
        description,
        alternates: { canonical: `/menu/${encodeURIComponent(slug)}` },
        openGraph: {
            title: item?.name ?? "Dish details",
            description,
            url: `/menu/${encodeURIComponent(slug)}`,
        },
    };
}

export default async function DishDetailPage({ params }: DishPageProps) {
    const [{ slug }, settings, catalog, tableContext] = await Promise.all([
        params,
        getRestaurantSettings(),
        getMenuCatalog(),
        getCurrentTableContext(),
    ]);
    const orderingSession = tableContext
        ? await getCurrentOrderingSession(tableContext.tableId)
        : null;
    const item = catalog.items.find((menuItem) => menuItem.slug === slug);
    if (!item) notFound();

    const unitPrice = item.discount_price !== null && item.discount_price >= 0 && item.discount_price < item.price
        ? item.discount_price
        : item.price;
    const table = tableContext ? {
        tableId: tableContext.tableId,
        tableLabel: tableContext.tableName || `Table ${tableContext.tableNumber}`,
    } : null;

    return (
        <OrderingSessionProvider key={orderingSession?.createdAt ?? "no-session"} session={orderingSession}>
        <div className="public-mobile-shell min-h-screen bg-[#03172b] pb-20 text-white sm:pb-0">
            <SiteHeader restaurant={settings.restaurant} />
            <main className="mx-auto max-w-5xl space-y-4 px-4 py-4 sm:px-8 sm:py-8 lg:px-0">
                {table ? <OrderingSessionNotice /> : null}
                <Link href="/menu" className="mb-3 inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#91bfd7] hover:text-white sm:mb-5 sm:text-xs">
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to menu
                </Link>
                <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8">
                    <div className="relative -mx-4 aspect-[1.3] overflow-hidden bg-[#e6f0f6] p-3 sm:mx-0 sm:rounded-md sm:aspect-[1.45] sm:p-5">
                        <RestaurantImage src={item.image_url} alt={item.name} fill fit="contain" loading="eager" sizes="(max-width: 1024px) 100vw, 55vw" />
                    </div>
                    <div className="flex flex-col justify-center lg:py-5">
                        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#1ec6e9]">{item.category_name}</p>
                        <h1 className="mt-1 text-2xl font-bold leading-tight text-white sm:text-3xl">{item.name}</h1>
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                            <span className="text-lg font-bold tabular-nums text-white">{formatPrice(unitPrice, settings.restaurant.currency)}</span>
                            {unitPrice < item.price ? <del className="text-xs text-[#819bb0]">{formatPrice(item.price, settings.restaurant.currency)}</del> : null}
                            {item.preparation_time_minutes > 0 ? <span className="inline-flex items-center gap-1 text-[10px] text-[#a8bfd2]"><Clock3 className="h-3.5 w-3.5 text-[#20c6e9]" aria-hidden="true" />{item.preparation_time_minutes} min</span> : null}
                        </div>
                        {item.description ? <p className="mt-3 text-xs leading-5 text-[#b3c8d9] sm:text-sm sm:leading-6">{item.description}</p> : null}
                        <div className="mt-4 sm:mt-6">
                            <DishDetailActions item={item} currency={settings.restaurant.currency} table={table} sessionRequired={Boolean(table)} />
                        </div>
                    </div>
                </div>
            </main>
            <SiteFooter restaurant={settings.restaurant} />
            <FloatingCartButton
                menuItems={catalog.items.map(({ id, price, discount_price }) => ({ id, price, discount_price }))}
                currency={settings.restaurant.currency}
                sessionRequired={Boolean(table)}
            />
        </div>
        </OrderingSessionProvider>
    );
}