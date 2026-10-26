import type { Metadata } from "next";
import { ShoppingCart } from "lucide-react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { CartView } from "@/app/cart/cart-view";
import { OrderingSessionNotice, OrderingSessionProvider } from "@/components/ordering-session";
import { getMenuCatalog, getRestaurantSettings } from "@/lib/restaurant-data";
import { getCurrentOrderingSession } from "@/lib/ordering-session";
import { getCurrentTableContext } from "@/lib/table-context";
import { getCurrentCustomer } from "@/lib/supabase/auth-server";

export const metadata: Metadata = {
    title: "Your Cart",
    robots: { index: false, follow: false },
};

export default async function CartPage() {
    const [settings, catalog, tableContext, customer] = await Promise.all([
        getRestaurantSettings(),
        getMenuCatalog(),
        getCurrentTableContext(),
        getCurrentCustomer(),
    ]);
    const orderingSession = tableContext
        ? await getCurrentOrderingSession(tableContext.tableId)
        : null;
    const menuReady = catalog.itemStatus === "ready" || catalog.itemStatus === "empty";

    return (
        <OrderingSessionProvider key={orderingSession?.createdAt ?? "no-session"} session={orderingSession}>
        <div className="public-mobile-shell min-h-screen bg-[#f7faff] pb-[calc(5rem+env(safe-area-inset-bottom))] text-[#09294d] sm:pb-0">
            <SiteHeader restaurant={settings.restaurant} />
            <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:space-y-8 sm:px-8 sm:py-10 lg:px-10">
                <header className="flex items-center gap-4 rounded-2xl border border-[#d9e5ef] bg-white p-4 shadow-[0_8px_28px_rgba(9,41,77,0.05)] sm:gap-5 sm:p-6">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0b3b5b] text-[#12b8df] sm:h-14 sm:w-14">
                        <ShoppingCart className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden="true" />
                    </span>
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0879be]">Dine-in ordering</p>
                        <h1 className="display-heading mt-0.5 text-2xl font-bold sm:text-3xl">Your Cart</h1>
                        <p className="mt-1 text-xs text-[#617991] sm:text-sm">Review your dishes before placing your order.</p>
                    </div>
                </header>
                {tableContext ? <OrderingSessionNotice /> : null}
                <CartView
                    menuItems={catalog.items}
                    currency={settings.restaurant.currency}
                    table={tableContext ? {
                        tableId: tableContext.tableId,
                        tableLabel: tableContext.tableName || `Table ${tableContext.tableNumber}`,
                    } : null}
                    authenticated={Boolean(customer)}
                    menuError={!menuReady}
                />
            </main>
            <SiteFooter restaurant={settings.restaurant} />
        </div>
        </OrderingSessionProvider>
    );
}