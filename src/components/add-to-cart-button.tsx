"use client";

import { Check, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useCart } from "@/components/cart-provider";
import { useOrderingSession } from "@/components/ordering-session";
import type { PublicMenuItem } from "@/lib/restaurant-data";

export function AddToCartButton({
    item,
    table,
    compact = false,
    sessionRequired = false,
    guideTarget = false,
}: {
    item: PublicMenuItem;
    table: { tableId: string; tableLabel: string } | null;
    compact?: boolean;
    sessionRequired?: boolean;
    guideTarget?: boolean;
}) {
    const { addItem, hydrated } = useCart();
    const orderingSession = useOrderingSession();
    const [message, setMessage] = useState<string | null>(null);
    const [added, setAdded] = useState(false);
    const feedbackTimer = useRef<number | null>(null);
    const unitPrice = item.discount_price !== null
        && item.discount_price >= 0
        && item.discount_price < item.price
        ? item.discount_price
        : item.price;
    const sessionExpired = sessionRequired && orderingSession?.active !== true;

    function add() {
        const result = addItem({
            menuItemId: item.id,
            quantity: 1,
            specialInstructions: "",
            observedUnitPrice: unitPrice,
        }, table);
        setMessage(result === "table_conflict"
            ? "Your cart is linked to another table. Review it before changing tables."
            : result === "quantity_limit"
                ? "The maximum quantity for this dish is 20."
                : "Added to cart.");
        setAdded(result === "added");
        if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
        if (result === "added") {
            window.dispatchEvent(new Event("blue-table:item-added"));
            feedbackTimer.current = window.setTimeout(() => setAdded(false), 1400);
        }
    }

    useEffect(() => () => {
        if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
    }, []);

    return (
        <div className={compact ? "mt-0" : "mt-3"}>
            <button
                type="button"
                onClick={add}
                disabled={!hydrated || sessionExpired}
                data-tour={guideTarget ? "add-item" : undefined}
                className={`inline-flex items-center justify-center gap-1.5 rounded-full font-bold text-white transition-[background-color,transform] duration-200 hover:bg-[#0096ca] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93e7ff] disabled:cursor-wait disabled:opacity-60 ${added ? "bg-[#15946d]" : "bg-[#08afe0]"} ${compact ? "min-h-10 px-3 py-2 text-xs" : "min-h-11 px-4 py-2.5 text-sm focus-visible:ring-[#087bc1]"}`}
            >
                {added ? <Check className={compact ? "h-3 w-3" : "h-4 w-4"} aria-hidden="true" /> : <Plus className={compact ? "h-3 w-3" : "h-4 w-4"} aria-hidden="true" />}
                {added ? "Added" : compact ? "Add" : "Add to cart"}
            </button>
            {sessionExpired ? <p role="status" className={`mt-1 leading-4 ${compact ? "text-[9px] text-[#b4c6d9]" : "text-[11px] text-[#617991]"}`}>Scan the table QR code again to order.</p> : null}
            {message ? <p role="status" className={`mt-1 leading-4 ${compact ? "text-[9px] text-[#b4c6d9]" : "text-[11px] text-[#617991]"}`}>{message}</p> : null}
        </div>
    );
}