"use client";

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "blue-table-cart-v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CartItem = {
    menuItemId: string;
    quantity: number;
    specialInstructions: string;
    observedUnitPrice: number;
};

export type CartState = {
    items: CartItem[];
    tableId: string | null;
    tableLabel: string | null;
    customerNote: string;
    idempotencyKey: string | null;
};

export type CartTable = { tableId: string; tableLabel: string };

type CartContextValue = {
    cart: CartState;
    hydrated: boolean;
    itemCount: number;
    addItem: (item: CartItem, table: CartTable | null) => "added" | "table_conflict" | "quantity_limit";
    setQuantity: (menuItemId: string, quantity: number) => void;
    removeItem: (menuItemId: string) => void;
    setInstructions: (menuItemId: string, instructions: string) => void;
    setCustomerNote: (note: string) => void;
    acknowledgePrices: (prices: Map<string, number>) => void;
    bindTable: (table: CartTable) => void;
    clearAndBindTable: (table: CartTable | null) => void;
    clearCart: () => void;
    getIdempotencyKey: () => string;
};

const CartContext = createContext<CartContextValue | null>(null);

function emptyCart(): CartState {
    return {
        items: [],
        tableId: null,
        tableLabel: null,
        customerNote: "",
        idempotencyKey: null,
    };
}

type CartStoreSnapshot = { cart: CartState; hydrated: boolean };

const serverSnapshot: CartStoreSnapshot = { cart: emptyCart(), hydrated: false };
let clientSnapshot = serverSnapshot;
const subscribers = new Set<() => void>();

function subscribeCart(listener: () => void) {
    subscribers.add(listener);
    return () => subscribers.delete(listener);
}

function getCartSnapshot() {
    return clientSnapshot;
}

function getServerCartSnapshot() {
    return serverSnapshot;
}

function publishCart(cart: CartState, hydrated = clientSnapshot.hydrated, persist = true) {
    clientSnapshot = { cart, hydrated };
    if (hydrated && persist) {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
        } catch {
            // Storage can be unavailable in private browsing or restricted contexts.
        }
    }
    subscribers.forEach((subscriber) => subscriber());
}

function parseCart(value: string): CartState {
    try {
        const parsed: unknown = JSON.parse(value);
        if (!parsed || typeof parsed !== "object") return emptyCart();
        const candidate = parsed as Partial<CartState>;
        if (!Array.isArray(candidate.items) || candidate.items.length > 30) return emptyCart();
        const items = candidate.items.filter((item): item is CartItem =>
            Boolean(item)
            && UUID_PATTERN.test(item.menuItemId)
            && Number.isInteger(item.quantity)
            && item.quantity >= 1
            && item.quantity <= 20
            && typeof item.specialInstructions === "string"
            && item.specialInstructions.length <= 500
            && Number.isFinite(item.observedUnitPrice)
            && item.observedUnitPrice >= 0,
        );
        if (items.length !== candidate.items.length) return emptyCart();
        return {
            items,
            tableId: typeof candidate.tableId === "string" && UUID_PATTERN.test(candidate.tableId)
                ? candidate.tableId
                : null,
            tableLabel: typeof candidate.tableLabel === "string" ? candidate.tableLabel.slice(0, 200) : null,
            customerNote: typeof candidate.customerNote === "string" ? candidate.customerNote.slice(0, 1000) : "",
            idempotencyKey: typeof candidate.idempotencyKey === "string" && UUID_PATTERN.test(candidate.idempotencyKey)
                ? candidate.idempotencyKey
                : null,
        };
    } catch {
        return emptyCart();
    }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
    const store = useSyncExternalStore(subscribeCart, getCartSnapshot, getServerCartSnapshot);

    useEffect(() => {
        let restored = emptyCart();
        try {
            const stored = window.localStorage.getItem(STORAGE_KEY);
            restored = stored ? parseCart(stored) : emptyCart();
        } catch {
            restored = emptyCart();
        }
        publishCart(restored, true);
    }, []);

    useEffect(() => {
        function syncCart(event: StorageEvent) {
            if (event.key !== STORAGE_KEY && event.key !== null) return;
            publishCart(event.newValue ? parseCart(event.newValue) : emptyCart(), true, false);
        }
        window.addEventListener("storage", syncCart);
        return () => window.removeEventListener("storage", syncCart);
    }, []);

    function update(next: CartState) {
        publishCart(next);
    }

    function addItem(item: CartItem, table: CartTable | null) {
        const current = clientSnapshot.cart;
        if (current.items.length && current.tableId !== (table?.tableId ?? null)) {
            return "table_conflict" as const;
        }

        const existing = current.items.find((entry) => entry.menuItemId === item.menuItemId);
        if (existing && existing.quantity >= 20) return "quantity_limit" as const;

        const items = existing
            ? current.items.map((entry) => entry.menuItemId === item.menuItemId
                ? { ...entry, quantity: Math.min(20, entry.quantity + item.quantity) }
                : entry)
            : [...current.items, item];
        update({
            ...current,
            items,
            tableId: current.tableId ?? table?.tableId ?? null,
            tableLabel: current.tableId ? current.tableLabel : table?.tableLabel ?? null,
            idempotencyKey: null,
        });
        return "added" as const;
    }

    function setQuantity(menuItemId: string, quantity: number) {
        const current = clientSnapshot.cart;
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return;
        update({
            ...current,
            items: current.items.map((item) => item.menuItemId === menuItemId ? { ...item, quantity } : item),
            idempotencyKey: null,
        });
    }

    function removeItem(menuItemId: string) {
        const current = clientSnapshot.cart;
        const items = current.items.filter((item) => item.menuItemId !== menuItemId);
        update(items.length
            ? { ...current, items, idempotencyKey: null }
            : emptyCart());
    }

    function setInstructions(menuItemId: string, instructions: string) {
        if (instructions.length > 500) return;
        const current = clientSnapshot.cart;
        update({
            ...current,
            items: current.items.map((item) => item.menuItemId === menuItemId
                ? { ...item, specialInstructions: instructions }
                : item),
            idempotencyKey: null,
        });
    }

    function setCustomerNote(note: string) {
        if (note.length > 1000) return;
        update({ ...clientSnapshot.cart, customerNote: note, idempotencyKey: null });
    }

    function acknowledgePrices(prices: Map<string, number>) {
        const current = clientSnapshot.cart;
        update({
            ...current,
            items: current.items.map((item) => {
                const observedUnitPrice = prices.get(item.menuItemId);
                return observedUnitPrice === undefined ? item : { ...item, observedUnitPrice };
            }),
            idempotencyKey: null,
        });
    }

    function bindTable(table: CartTable) {
        const current = clientSnapshot.cart;
        if (current.tableId === null) update({ ...current, tableId: table.tableId, tableLabel: table.tableLabel });
    }

    function clearAndBindTable(table: CartTable | null) {
        update({
            ...emptyCart(),
            tableId: table?.tableId ?? null,
            tableLabel: table?.tableLabel ?? null,
        });
    }

    function getIdempotencyKey() {
        const current = clientSnapshot.cart;
        if (current.idempotencyKey) return current.idempotencyKey;
        const idempotencyKey = window.crypto.randomUUID();
        update({ ...current, idempotencyKey });
        return idempotencyKey;
    }

    const value: CartContextValue = {
        cart: store.cart,
        hydrated: store.hydrated,
        itemCount: store.cart.items.reduce((count, item) => count + item.quantity, 0),
        addItem,
        setQuantity,
        removeItem,
        setInstructions,
        setCustomerNote,
        acknowledgePrices,
        bindTable,
        clearAndBindTable,
        clearCart: () => update(emptyCart()),
        getIdempotencyKey,
    };

    return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
    const context = useContext(CartContext);
    if (!context) throw new Error("useCart must be used within CartProvider.");
    return context;
}