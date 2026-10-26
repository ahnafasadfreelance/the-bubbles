"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useMemo } from "react";

import { useCart } from "@/components/cart-provider";
import { useOrderingSession } from "@/components/ordering-session";
import type { PublicMenuItem } from "@/lib/restaurant-data";
import { formatPrice } from "@/lib/format-price";

type MenuItemPricing = Pick<PublicMenuItem, "id" | "price" | "discount_price">;

export function FloatingCartButton({
    menuItems,
    currency,
    sessionRequired,
}: {
    menuItems: MenuItemPricing[];
    currency: string;
    sessionRequired: boolean;
}) {
    const { cart, hydrated, itemCount } = useCart();
    const orderingSession = useOrderingSession();
    const menuById = useMemo(() => new Map(menuItems.map((item) => [item.id, item])), [menuItems]);
    const total = cart.items.reduce((sum, item) => {
        const menuItem = menuById.get(item.menuItemId);
        const currentPrice = menuItem
            ? menuItem.discount_price !== null && menuItem.discount_price >= 0 && menuItem.discount_price < menuItem.price
                ? menuItem.discount_price
                : menuItem.price
            : item.observedUnitPrice;
        return sum + currentPrice * item.quantity;
    }, 0);

    if (!hydrated || itemCount === 0) return null;

    const canOrder = !sessionRequired || orderingSession?.active === true;
    return (
        <Link
            href="/cart"
            data-tour="cart"
            aria-label={`View cart, ${itemCount} ${itemCount === 1 ? "item" : "items"}, ${formatPrice(total, currency)}${canOrder ? "" : ", ordering session expired"}`}
            className="floating-cart-enter fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-3 z-30 inline-flex min-h-13 items-center gap-2 rounded-full border border-white/15 bg-[#062a4a] px-4 py-2 text-white shadow-[0_12px_35px_rgba(2,20,38,0.35)] transition-[transform,background-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-[#075084] hover:shadow-[0_16px_40px_rgba(2,20,38,0.45)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#50d7f5] sm:bottom-6 sm:right-6"
        >
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#08afe0] text-[#04243e]">
                <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                <span key={itemCount} className="cart-count-badge absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#062a4a] bg-white px-1 text-[9px] font-extrabold tabular-nums text-[#0759a8]">
                    {itemCount > 99 ? "99+" : itemCount}
                </span>
            </span>
            <span className="flex flex-col items-start leading-tight">
                <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#a7dded]">{canOrder ? "View Cart" : "Cart saved"}</span>
                <span key={total} className="cart-total-value text-xs font-bold tabular-nums">{itemCount} {itemCount === 1 ? "item" : "items"} · {formatPrice(total, currency)}</span>
            </span>
        </Link>
    );
}
