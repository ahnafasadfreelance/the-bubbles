"use client";

import Link from "next/link";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { useState } from "react";

import { useCart, type CartTable } from "@/components/cart-provider";
import { useOrderingSession } from "@/components/ordering-session";
import type { PublicMenuItem } from "@/lib/restaurant-data";
import { formatPrice } from "@/lib/format-price";

export function DishDetailActions({
    item,
    currency,
    table,
    sessionRequired = false,
}: {
    item: PublicMenuItem;
    currency: string;
    table: CartTable | null;
    sessionRequired?: boolean;
}) {
    const { addItem, hydrated } = useCart();
    const orderingSession = useOrderingSession();
    const [quantity, setQuantity] = useState(1);
    const [instructions, setInstructions] = useState("");
    const [message, setMessage] = useState("");
    const unitPrice = item.discount_price !== null && item.discount_price >= 0 && item.discount_price < item.price
        ? item.discount_price
        : item.price;
    const sessionExpired = sessionRequired && orderingSession?.active !== true;

    function addToCart() {
        const result = addItem({
            menuItemId: item.id,
            quantity,
            specialInstructions: instructions.trim(),
            observedUnitPrice: unitPrice,
        }, table);
        setMessage(result === "added"
            ? `${quantity} ${item.name} ${quantity === 1 ? "added" : "added"} to your cart.`
            : result === "table_conflict"
                ? "Your cart is linked to another table. Review it before changing tables."
                : "The cart quantity limit for this dish has been reached.");
    }

    return (
        <section className="rounded-md border border-[#0e3b60] bg-[#06223d] p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-[#c3d6e6]">Quantity</span>
                <div className="inline-flex h-9 items-center rounded-md border border-[#155078] bg-[#041a2f]">
                    <button type="button" aria-label="Decrease quantity" disabled={quantity <= 1 || sessionExpired} onClick={() => setQuantity((current) => Math.max(1, current - 1))} className="flex h-9 w-9 items-center justify-center text-[#7fa1bb] hover:text-white disabled:opacity-40"><Minus className="h-3.5 w-3.5" aria-hidden="true" /></button>
                    <span className="min-w-8 text-center text-xs font-bold tabular-nums text-white">{quantity}</span>
                    <button type="button" aria-label="Increase quantity" disabled={quantity >= 20 || sessionExpired} onClick={() => setQuantity((current) => Math.min(20, current + 1))} className="flex h-9 w-9 items-center justify-center text-[#20c6e9] hover:text-white disabled:opacity-40"><Plus className="h-3.5 w-3.5" aria-hidden="true" /></button>
                </div>
            </div>

            <label className="mt-4 block text-xs font-semibold text-[#c3d6e6]">Special instructions <span className="font-normal text-[#819bb0]">(optional)</span>
                <textarea disabled={sessionExpired} value={instructions} onChange={(event) => setInstructions(event.target.value)} maxLength={500} rows={3} placeholder="e.g. No onions, extra sauce…" className="mt-1.5 block w-full resize-y rounded-md border border-[#155078] bg-[#041a2f] px-3 py-2 text-xs font-normal text-white outline-none placeholder:text-[#728da3] focus:border-[#12bce5] focus:ring-2 focus:ring-[#12bce5]/25 disabled:opacity-60" />
            </label>

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#124467] pt-3">
                <span className="text-xs text-[#a8bfd2]">Total</span>
                <strong className="text-base font-bold tabular-nums text-white">{formatPrice(unitPrice * quantity, currency)}</strong>
            </div>
            <button type="button" disabled={!hydrated || sessionExpired} onClick={addToCart} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#08afe0] px-4 text-xs font-bold text-white transition-colors hover:bg-[#0096ca] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93e7ff] disabled:cursor-wait disabled:opacity-60">
                <ShoppingCart className="h-4 w-4" aria-hidden="true" /> Add to Cart
            </button>
            {sessionExpired ? <p role="status" className="mt-2 text-[10px] leading-4 text-[#ffc7c7]">This ordering session has expired. Scan the table QR code again to add dishes.</p> : null}
            {message ? <p role="status" className="mt-2 text-[10px] leading-4 text-[#a8d9e6]">{message}</p> : null}
            {!table ? <p className="mt-3 text-[9px] leading-4 text-[#91a9c2]">A valid table QR code is required to submit a dine-in order.</p> : <p className="mt-3 text-[9px] text-[#91a9c2]">Dine in · {table.tableLabel}</p>}
            <p className="mt-1 text-[9px] text-[#91a9c2]">Payment is collected at the restaurant counter.</p>
            <Link href="/cart" className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold text-[#20c6e9] hover:text-white">View cart</Link>
        </section>
    );
}