"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, Banknote, CheckCircle2, CreditCard, Minus, Plus, ShoppingBag, Wallet, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { RestaurantImage } from "@/components/restaurant-image";
import { useCart, type CartTable } from "@/components/cart-provider";
import { useOrderingSession } from "@/components/ordering-session";
import type { PublicMenuItem } from "@/lib/restaurant-data";
import { formatPrice } from "@/lib/format-price";
import { activateNotificationAudio, playNotificationSound } from "@/lib/notification-sound";
import { placeOrderAction } from "@/app/cart/actions";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/payment";

const errorMessages = {
    table_required: "Scan a current table QR code before placing a dine-in order.",
    ordering_session_expired: "Your ordering session has expired. Scan the table QR code again to continue; your cart is saved.",
    invalid_cart: "Review your cart and try again.",
    item_unavailable: "One or more dishes are no longer available. Remove them to continue.",
    price_changed: "A dish price changed. Review and acknowledge the updated prices before placing your order.",
    menu_unavailable: "The menu is temporarily unavailable. Please try again shortly.",
    ordering_unavailable: "Ordering is temporarily unavailable. Your cart is saved; please try again later.",
    restaurant_closed: "The restaurant is currently closed. Your cart is saved for when ordering reopens.",
    dine_in_unavailable: "Dine-in ordering is temporarily unavailable.",
    error: "We could not place the order. Your cart is saved; please try again.",
} as const;

export function CartView({
    menuItems,
    currency,
    table,
    authenticated,
    menuError,
}: {
    menuItems: PublicMenuItem[];
    currency: string;
    table: CartTable | null;
    authenticated: boolean;
    menuError: boolean;
}) {
    const {
        cart,
        hydrated,
        setQuantity,
        removeItem,
        setInstructions,
        setCustomerNote,
        acknowledgePrices,
        clearAndBindTable,
        getIdempotencyKey,
        clearCart,
    } = useCart();
    const orderingSession = useOrderingSession();
    const router = useRouter();
    const latestCart = useRef(cart);
    const [preferredPaymentMethod, setPreferredPaymentMethod] = useState<PaymentMethod | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [placedOrder, setPlacedOrder] = useState<{ id: string; number: string } | null>(null);

    const currentCartKey = JSON.stringify([cart.items, cart.customerNote, cart.tableId]);
    useEffect(() => {
        latestCart.current = cart;
    }, [cart]);

    const menuById = useMemo(() => new Map(menuItems.map((item) => [item.id, item])), [menuItems]);
    const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    const unavailable = cart.items.filter((item) => !menuById.has(item.menuItemId));
    const changedPrices = cart.items.filter((cartItem) => {
        const menuItem = menuById.get(cartItem.menuItemId);
        if (!menuItem) return false;
        const currentPrice = menuItem.discount_price !== null
            && menuItem.discount_price >= 0
            && menuItem.discount_price < menuItem.price
            ? menuItem.discount_price
            : menuItem.price;
        return currentPrice !== cartItem.observedUnitPrice;
    });
    const tableMismatch = cart.items.length > 0
        && cart.tableId !== (table?.tableId ?? null);
    const orderingSessionActive = orderingSession?.active === true;

    const subtotal = cart.items.reduce((total, cartItem) => {
        const menuItem = menuById.get(cartItem.menuItemId);
        return total + (menuItem?.price ?? cartItem.observedUnitPrice) * cartItem.quantity;
    }, 0);
    const total = cart.items.reduce((sum, cartItem) => {
        const menuItem = menuById.get(cartItem.menuItemId);
        if (!menuItem) return sum + cartItem.observedUnitPrice * cartItem.quantity;
        const unitPrice = menuItem.discount_price !== null
            && menuItem.discount_price >= 0
            && menuItem.discount_price < menuItem.price
            ? menuItem.discount_price
            : menuItem.price;
        return sum + unitPrice * cartItem.quantity;
    }, 0);
    const discount = subtotal - total;
    const cartTable = tableMismatch ? cart.tableLabel : table?.tableLabel ?? cart.tableLabel;
    const canSubmit = hydrated
        && cart.items.length > 0
        && !tableMismatch
        && table !== null
        && orderingSessionActive
        && unavailable.length === 0
        && changedPrices.length === 0
        && !menuError
        && !submitting;

    function acknowledgeCurrentPrices() {
        const updates = new Map<string, number>();
        for (const item of cart.items) {
            const menuItem = menuById.get(item.menuItemId);
            if (!menuItem) continue;
            updates.set(item.menuItemId, menuItem.discount_price !== null
                && menuItem.discount_price >= 0
                && menuItem.discount_price < menuItem.price
                ? menuItem.discount_price
                : menuItem.price);
        }
        acknowledgePrices(updates);
    }

    async function submitOrder() {
        if (!authenticated || !canSubmit || !preferredPaymentMethod) return;
        const audioReady = activateNotificationAudio().catch(() => null);
        setSubmitting(true);
        setError(null);
        const submittedCartKey = currentCartKey;
        try {
            const result = await placeOrderAction({
                items: cart.items,
                customerNote: cart.customerNote,
                idempotencyKey: getIdempotencyKey(),
                boundTableId: cart.tableId,
                preferredPaymentMethod,
            });
            if (!result.ok) {
                setError(errorMessages[result.reason]);
                if (result.reason === "price_changed" || result.reason === "item_unavailable" || result.reason === "ordering_session_expired") router.refresh();
                setSubmitting(false);
                return;
            }
            const latestCartKey = JSON.stringify([
                latestCart.current.items,
                latestCart.current.customerNote,
                latestCart.current.tableId,
            ]);
            if (latestCartKey === submittedCartKey) clearCart();
            window.dispatchEvent(new Event("blue-table:order-placed"));
            void audioReady.then((context) => {
                if (context) playNotificationSound("orderPlaced");
            });
            setPlacedOrder({ id: result.orderId, number: result.orderNumber });
        } catch {
            setError(errorMessages.error);
            setSubmitting(false);
        }
    }

    if (placedOrder) {
        return (
            <div className="order-celebration-backdrop fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#020b16]/95 px-4 py-8" role="status" aria-live="polite">
                <div className="order-celebration-panel relative w-full max-w-md overflow-hidden rounded-3xl border border-[#17435a] bg-[#071827] px-6 py-8 text-center text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:px-9 sm:py-10">
                    <div className="order-celebration-confetti" aria-hidden="true">
                        {Array.from({ length: 8 }, (_, index) => <span key={index} />)}
                    </div>
                    <div className="order-celebration-check mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#00dfa5]/40 bg-[#062b27] text-[#00dfa5] shadow-[0_0_36px_rgba(0,223,165,0.2)]">
                        <CheckCircle2 className="h-10 w-10" aria-hidden="true" />
                    </div>
                    <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.18em] text-[#00d9ee]">Order successfully received</p>
                    <h1 className="mt-2 text-3xl font-bold text-[#f5faff]">Order Placed!</h1>
                    <p className="mt-2 text-sm leading-6 text-[#a8bed2]">Your order was successfully submitted. You can follow its progress here.</p>
                    <div className="mt-6 rounded-2xl border border-[#17435a] bg-[#061521] px-4 py-4 text-left">
                        <p className="text-xs font-semibold text-[#a8bed2]">Order reference</p>
                        <p className="mt-1 text-lg font-bold tracking-wide text-white">#{placedOrder.number}</p>
                        {table?.tableLabel ? <p className="mt-2 text-xs text-[#a8bed2]">{table.tableLabel}</p> : null}
                    </div>
                    <div className="mt-6 grid gap-3">
                        <Link href={`/orders/${placedOrder.id}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#00d8df] px-5 text-sm font-bold text-[#031821] transition-colors hover:bg-[#55f0ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5ff]">
                            Track Order <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                        <Link href={`/orders/${placedOrder.id}#order-details`} className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#315066] px-5 text-sm font-bold text-[#d7e6ef] transition-colors hover:border-[#00e5ff]/60 hover:text-[#00e5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00e5ff]">
                            View Order Details
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    if (!hydrated) {
        return <p role="status" className="rounded-2xl border border-[#d8e3ed] bg-white p-6 text-sm text-[#617991] shadow-sm">Loading your cart…</p>;
    }

    if (cart.items.length === 0) {
        return (
            <section className="relative isolate overflow-hidden rounded-3xl border border-[#d8e3ed] bg-white px-5 py-10 text-center shadow-[0_12px_40px_rgba(9,41,77,0.07)] sm:px-10 sm:py-16">
                <div className="pointer-events-none absolute -right-20 -top-24 -z-10 h-64 w-64 rounded-full bg-[#eaf8fc] blur-3xl" aria-hidden="true" />
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.75rem] border border-[#155078] bg-[#0b3b5b] text-[#12b8df] shadow-inner sm:h-24 sm:w-24">
                    <ShoppingBag className="h-9 w-9 sm:h-10 sm:w-10" strokeWidth={1.5} aria-hidden="true" />
                </div>
                <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.18em] text-[#0879be]">A good meal is just a few taps away</p>
                <h2 className="display-heading mt-2 text-2xl font-bold text-[#09294d] sm:text-3xl">Your cart is waiting</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#617991]">Explore the menu and add something delicious. Your picks will be ready here when you are.</p>
                <Link href="/menu" className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#087bc1] px-6 text-sm font-bold text-white shadow-lg shadow-[#087bc1]/20 transition hover:-translate-y-0.5 hover:bg-[#0567a4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12b8df]">
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Explore the menu
                </Link>
            </section>
        );
    }

    return (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
            <section className="min-w-0 space-y-4">
                {tableMismatch ? (
                    <aside role="alert" className="rounded-2xl border border-[#efd9ad] border-l-4 border-l-[#d58a18] bg-[#fff8e8] p-5 shadow-sm">
                        <h2 className="text-sm font-bold text-[#68450a]">Your cart belongs to another table.</h2>
                        <p className="mt-1 text-sm leading-5 text-[#765b2a]">
                            {table && cart.tableLabel
                                ? `It was started at ${cart.tableLabel}, but this session is now ${table.tableLabel}. Changing tables clears the cart.`
                                : "The original table context is no longer active. Scan a valid table QR code again; changing tables clears the cart."}
                        </p>
                        {table ? (
                            <button type="button" onClick={() => clearAndBindTable(table)} className="mt-3 rounded-full bg-[#8a5a09] px-4 py-2 text-xs font-bold text-white hover:bg-[#704805]">
                                Clear cart and use {table.tableLabel}
                            </button>
                        ) : (
                            <button type="button" onClick={() => clearAndBindTable(null)} className="mt-3 rounded-full bg-[#8a5a09] px-4 py-2 text-xs font-bold text-white hover:bg-[#704805]">
                                Clear cart
                            </button>
                        )}
                    </aside>
                ) : null}

                {!table ? (
                    <aside className="rounded-2xl border border-[#d8e3ed] border-l-4 border-l-[#8ba7bc] bg-white p-5 text-sm leading-6 text-[#617991] shadow-sm">
                        Dine-in checkout requires a valid table QR code. You can keep browsing; scan the code at your table before ordering.
                    </aside>
                ) : null}

                {table && !orderingSessionActive ? (
                    <aside role="alert" className="rounded-2xl border border-[#f2caca] border-l-4 border-l-[#b74646] bg-[#fff0f0] p-5 shadow-sm">
                        <h2 className="text-sm font-bold text-[#7c2626]">Ordering is paused for this cart.</h2>
                        <p className="mt-1 text-sm leading-5 text-[#7c3b3b]">Your selections are saved. Scan the table QR code again to start a new 10-minute ordering session before checkout.</p>
                    </aside>
                ) : null}

                {menuError ? (
                    <aside role="alert" className="rounded-2xl border border-[#f2caca] border-l-4 border-l-[#a33a3a] bg-[#fff3f3] p-4 text-sm text-[#7a2929]">We couldn’t verify the current menu. Please refresh before placing your order.</aside>
                ) : null}

                {unavailable.length > 0 ? (
                    <aside role="alert" className="rounded-2xl border border-[#f2caca] border-l-4 border-l-[#a33a3a] bg-[#fff3f3] p-4 text-sm text-[#7a2929]">
                        Some dishes are no longer available. Remove them to continue with your order.
                    </aside>
                ) : null}

                {changedPrices.length > 0 ? (
                    <aside role="status" className="rounded-2xl border border-[#efd9ad] border-l-4 border-l-[#d58a18] bg-[#fff8e8] p-4">
                        <p className="flex items-center gap-2 text-sm font-bold text-[#68450a]"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> Menu prices changed</p>
                        <p className="mt-1 text-sm text-[#765b2a]">Review the updated prices below and acknowledge them before continuing.</p>
                        <button type="button" onClick={acknowledgeCurrentPrices} className="mt-3 rounded-full border border-[#c49239] px-4 py-2 text-xs font-bold text-[#68450a] hover:bg-white">
                            Review updated prices
                        </button>
                    </aside>
                ) : null}

                {cart.items.map((cartItem) => {
                    const menuItem = menuById.get(cartItem.menuItemId);
                    const currentPrice = menuItem
                        ? menuItem.discount_price !== null && menuItem.discount_price >= 0 && menuItem.discount_price < menuItem.price
                            ? menuItem.discount_price
                            : menuItem.price
                        : cartItem.observedUnitPrice;
                    const isPriceChanged = currentPrice !== cartItem.observedUnitPrice;

                    return (
                        <article key={cartItem.menuItemId} className={`rounded-2xl border bg-white p-4 shadow-[0_6px_24px_rgba(9,41,77,0.05)] sm:p-5 ${isPriceChanged ? "border-[#e0b24b]" : "border-[#d8e3ed]"}`}>
                            <div className="flex items-start gap-3">
                                {menuItem ? <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#e6f0f6] p-1.5 sm:h-24 sm:w-24"><RestaurantImage src={menuItem.image_url} alt={menuItem.name} fill fit="contain" sizes="96px" /></div> : null}
                                <div className="min-w-0 flex-1">
                                    <h2 className="text-sm font-bold text-[#09294d] sm:text-lg">{menuItem?.name ?? "Unavailable dish"}</h2>
                                    {menuItem ? (
                                        <p className="mt-1 text-xs text-[#617991]">{formatPrice(currentPrice, currency)} each</p>
                                    ) : <p className="mt-1 text-xs text-[#a32929]">No longer available</p>}
                                    {isPriceChanged ? <p className="mt-1 text-xs font-semibold text-[#8a5a09]">Previously {formatPrice(cartItem.observedUnitPrice, currency)}</p> : null}
                                </div>
                                <button type="button" onClick={() => removeItem(cartItem.menuItemId)} aria-label={`Remove ${menuItem?.name ?? "unavailable dish"}`} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#d8e3ed] text-[#617991] transition hover:border-[#bd4d4d] hover:bg-[#fff5f5] hover:text-[#a32929] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087bc1]">
                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </div>
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                                <div className="inline-flex items-center rounded-full border border-[#cbd9e4] bg-[#f8fbfd] p-1" aria-label={`Quantity ${cartItem.quantity}`}>
                                    <button type="button" disabled={cartItem.quantity <= 1} onClick={() => setQuantity(cartItem.menuItemId, cartItem.quantity - 1)} aria-label="Decrease quantity" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#0759a8] transition hover:bg-[#eaf5ff] disabled:cursor-not-allowed disabled:opacity-35">
                                        <Minus className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                    <span className="min-w-10 text-center text-sm font-bold tabular-nums text-[#09294d]">{cartItem.quantity}</span>
                                    <button type="button" disabled={cartItem.quantity >= 20} onClick={() => setQuantity(cartItem.menuItemId, cartItem.quantity + 1)} aria-label="Increase quantity" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#0759a8] transition hover:bg-[#eaf5ff] disabled:cursor-not-allowed disabled:opacity-35">
                                        <Plus className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                </div>
                                <p className="text-sm font-bold tabular-nums text-[#09294d]">{formatPrice(currentPrice * cartItem.quantity, currency)}</p>
                            </div>
                            <label className="mt-4 block text-xs font-semibold text-[#37566f]">
                                Special instructions <span className="font-normal text-[#71869a]">(optional, up to 500 characters)</span>
                                <textarea value={cartItem.specialInstructions} maxLength={500} rows={2} onChange={(event) => setInstructions(cartItem.menuItemId, event.target.value)} className="mt-1.5 w-full resize-y rounded-md border border-[#cbd9e4] bg-white px-3 py-2 text-sm font-normal text-[#09294d] outline-none focus:border-[#087bc1] focus:ring-2 focus:ring-[#bfe7f6]" />
                            </label>
                        </article>
                    );
                })}

                <label className="block rounded-2xl border border-[#d8e3ed] bg-white p-4 text-xs font-semibold text-[#37566f] shadow-sm sm:p-5">
                    Note for the restaurant <span className="font-normal text-[#71869a]">(optional, up to 1000 characters)</span>
                    <textarea value={cart.customerNote} maxLength={1000} rows={3} onChange={(event) => setCustomerNote(event.target.value)} className="mt-1.5 w-full resize-y rounded-md border border-[#cbd9e4] bg-white px-3 py-2 text-sm font-normal text-[#09294d] outline-none focus:border-[#087bc1] focus:ring-2 focus:ring-[#bfe7f6]" />
                </label>
                <Link href="/menu" className="inline-flex items-center gap-2 rounded-full px-2 py-2 text-xs font-semibold text-[#0759a8] transition hover:bg-[#eaf5ff] hover:text-[#063f78]"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Continue browsing</Link>
            </section>

            <aside data-tour="order-summary" className="rounded-2xl border border-[#d8e3ed] bg-white p-5 shadow-[0_10px_34px_rgba(9,41,77,0.08)] sm:p-6 lg:sticky lg:top-24">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0879be]">Order summary</p>
                <h2 className="display-heading mt-1 text-xl font-bold text-[#09294d]">{itemCount} {itemCount === 1 ? "item" : "items"}</h2>
                {cartTable ? <p className="mt-3 border-l-2 border-[#14a6d1] bg-[#e9f8fd] px-3 py-2 text-xs font-semibold text-[#0759a8]">Dine in · {cartTable}</p> : null}
                <dl className="mt-5 space-y-3 border-t border-[#e1eaf1] pt-4 text-sm">
                    <div className="flex justify-between gap-3 text-[#617991]"><dt>Subtotal</dt><dd className="tabular-nums">{formatPrice(subtotal, currency)}</dd></div>
                    <div className="flex justify-between gap-3 text-[#617991]"><dt>Discount</dt><dd className="tabular-nums">−{formatPrice(discount, currency)}</dd></div>
                    <div className="flex justify-between gap-3 border-t border-[#e1eaf1] pt-3 text-lg font-bold text-[#09294d]"><dt>Total</dt><dd className="tabular-nums">{formatPrice(total, currency)}</dd></div>
                </dl>
                <fieldset data-tour="payment-methods" className="mt-5 border-t border-[#e1eaf1] pt-4">
                    <legend className="text-sm font-bold text-[#09294d]">How would you like to pay at the restaurant?</legend>
                    <p className="mt-1 text-xs leading-5 text-[#617991]">Choose a preference. You won’t be charged online.</p>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                        {([
                            { method: "card", Icon: CreditCard },
                            { method: "bkash", Icon: Wallet },
                            { method: "cash", Icon: Banknote },
                        ] as const).map(({ method, Icon }) => {
                            const selected = preferredPaymentMethod === method;
                            return (
                                <label key={method} className={`flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border px-1.5 py-3 text-xs font-semibold transition-colors focus-within:ring-2 focus-within:ring-[#087bc1] ${selected ? "border-[#087bc1] bg-[#e9f8fd] text-[#0759a8] shadow-[0_0_0_1px_#087bc1]" : "border-[#cbdbe7] bg-white text-[#37566f] hover:border-[#087bc1] hover:bg-[#f5fbff]"}`}>
                                    <input
                                        type="radio"
                                        name="preferred-payment-method"
                                        value={method}
                                        checked={selected}
                                        onChange={() => {
                                            setPreferredPaymentMethod(method);
                                            window.dispatchEvent(new Event("blue-table:payment-selected"));
                                        }}
                                        className="sr-only"
                                    />
                                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                                    <span>{PAYMENT_METHOD_LABELS[method]}</span>
                                </label>
                            );
                        })}
                    </div>
                    <p className="mt-3 border-l-2 border-[#14a6d1] bg-[#eef9fd] px-3 py-2 text-[11px] leading-5 text-[#37566f]">Restaurant staff will collect and verify payment at your table. Selecting a method does not mark the order as paid.</p>
                </fieldset>

                {error ? <p role="alert" className="mt-4 border-l-2 border-[#a32929] bg-[#fff3f3] px-3 py-2 text-xs leading-5 text-[#7a2929]">{error}</p> : null}

                {authenticated ? (
                    <button
                        type="button"
                        data-tour="place-order"
                        onClick={() => void submitOrder()}
                        disabled={!canSubmit || !preferredPaymentMethod}
                        className="mt-5 min-h-12 w-full rounded-full bg-[#0759a8] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#064987] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087bc1] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {submitting ? "Placing order…" : "Place dine-in order"}
                    </button>
                ) : (
                    <div className="mt-5 space-y-2">
                        <p className="text-[11px] leading-5 text-[#617991]">Sign in with Google to place this dine-in order. Your cart and table will be saved.</p>
                        <Link href="/login?next=%2Fcart" data-tour="place-order" aria-disabled={!canSubmit || !preferredPaymentMethod} tabIndex={!canSubmit || !preferredPaymentMethod ? -1 : undefined} className={`flex min-h-12 w-full items-center justify-center rounded-full px-5 text-sm font-bold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087bc1] ${canSubmit && preferredPaymentMethod ? "bg-[#0759a8] hover:bg-[#064987]" : "pointer-events-none bg-[#0759a8] opacity-50"}`}>
                            Continue with Google
                        </Link>
                    </div>
                )}
                {!preferredPaymentMethod ? <p className="mt-2 text-center text-[11px] text-[#617991]">Choose a payment preference to continue.</p> : null}
                {!table && !tableMismatch ? <p className="mt-2 text-center text-[11px] text-[#617991]">Scan a table QR code to continue.</p> : null}
            </aside>
        </div>
    );
}