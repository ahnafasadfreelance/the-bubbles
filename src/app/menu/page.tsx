import Link from "next/link";
import type { Metadata } from "next";

import { DataNotice } from "@/components/data-notice";
import { FloatingCartButton } from "@/components/floating-cart-button";
import { MenuCatalog } from "@/components/menu-catalog";
import { OrderingSessionNotice, OrderingSessionProvider } from "@/components/ordering-session";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getMenuCatalog, getRestaurantSettings, type PublicMenuItem } from "@/lib/restaurant-data";
import { getCurrentOrderingSession } from "@/lib/ordering-session";
import { getCurrentTableContext } from "@/lib/table-context";

export async function generateMetadata(): Promise<Metadata> {
    const { restaurant } = await getRestaurantSettings();
    const description = `Explore the dishes currently available at ${restaurant.name}.`;

    return {
        title: "Menu",
        description,
        alternates: { canonical: "/menu" },
        openGraph: {
            title: `${restaurant.name} Menu`,
            description,
            url: "/menu",
        },
    };
}

function isDiscounted(item: PublicMenuItem): item is PublicMenuItem & { discount_price: number } {
    return item.discount_price !== null
        && Number.isFinite(item.discount_price)
        && item.discount_price >= 0
        && item.discount_price < item.price;
}

export default async function MenuPage({
    searchParams,
}: {
    searchParams: Promise<{ ordering_session?: string | string[]; offers?: string | string[] }>;
}) {
    const [settings, catalog, tableContext, query] = await Promise.all([
        getRestaurantSettings(),
        getMenuCatalog(),
        getCurrentTableContext(),
        searchParams,
    ]);
    const orderingSession = tableContext
        ? await getCurrentOrderingSession(tableContext.tableId)
        : null;
    const { restaurant } = settings;
    const isOffersView = query.offers === "1";
    const hasOffers = catalog.items.some(isDiscounted);

    return (
        <OrderingSessionProvider key={orderingSession?.createdAt ?? "no-session"} session={orderingSession}>
            <div className="public-mobile-shell min-h-screen bg-[#f7faff] text-[#09294d]">
                <SiteHeader restaurant={restaurant} />

                <main className="mx-auto max-w-7xl space-y-6 px-4 py-5 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:space-y-8 sm:px-8 sm:py-8 sm:pb-24 lg:px-10">
                <DataNotice status={settings.status} subject="Restaurant information" />
                {restaurant.orderingAvailabilityMessage !== "Restaurant is currently accepting orders" ? (
                    <aside role="status" className="border-l-4 border-[#c58a2b] bg-[#fff7e7] px-4 py-3 text-sm text-[#805312]">{restaurant.orderingAvailabilityMessage}. You can still browse the menu.</aside>
                ) : null}
                {query.ordering_session === "unavailable" ? (
                    <aside role="alert" className="border-l-4 border-[#b74646] bg-[#fff0f0] px-4 py-3 text-sm text-[#7c2626]">
                        We couldn’t start an ordering session for this table. Your menu is still available; please try scanning the table QR code again or ask restaurant staff for help.
                    </aside>
                ) : null}
                {tableContext ? (
                    <aside aria-label="Dine-in table context" className="flex flex-col gap-1 border-l-4 border-[#14a6d1] bg-[#e9f8fd] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0879be]">Dine in</p>
                        <p className="text-sm font-semibold text-[#09294d]">
                            {tableContext.tableName || `Table ${tableContext.tableNumber}`}
                        </p>
                    </aside>
                ) : (
                    <aside className="border-l-4 border-[#8ba7bc] bg-white px-5 py-4 text-sm leading-6 text-[#617991]">
                        To place a dine-in order when ordering is available, scan a valid QR code at your table first.
                    </aside>
                )}
                {tableContext ? <OrderingSessionNotice /> : null}
                {catalog.categoryStatus !== "ready" ? (
                    <div className="mx-auto max-w-3xl"><DataNotice status={catalog.categoryStatus} subject="Menu categories" /></div>
                ) : (
                    <MenuCatalog
                        categories={catalog.categories}
                        items={catalog.items}
                        currency={restaurant.currency}
                        table={tableContext ? {
                            tableId: tableContext.tableId,
                            tableLabel: tableContext.tableName || `Table ${tableContext.tableNumber}`,
                        } : null}
                        offersView={isOffersView}
                        hasOffers={hasOffers}
                        itemStatus={catalog.itemStatus}
                    />
                )}
                <div className="flex justify-center gap-3">
                    <Link href="/" className="inline-flex items-center justify-center rounded-full bg-[#087bc1] px-5 py-2.5 text-xs font-bold text-white transition-colors hover:bg-[#0567a4]">Return home</Link>
                    <Link href="/about" className="inline-flex items-center justify-center rounded-full border border-[#b9d0e1] bg-white px-5 py-2.5 text-xs font-bold text-[#0759a8] transition-colors hover:bg-[#edf8ff]">Our story</Link>
                </div>
            </main>

                <SiteFooter restaurant={restaurant} />
                <FloatingCartButton
                    menuItems={catalog.items.map(({ id, price, discount_price }) => ({ id, price, discount_price }))}
                    currency={restaurant.currency}
                    sessionRequired={Boolean(tableContext)}
                />
            </div>
        </OrderingSessionProvider>
    );
}
