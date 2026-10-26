export const PAYMENT_METHODS = ["card", "bkash", "cash"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type PaymentStatus = "unpaid" | "partially_paid" | "paid" | "refunded";

export function isPaymentMethod(value: unknown): value is PaymentMethod {
    return typeof value === "string" && PAYMENT_METHODS.some((method) => method === value);
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
    card: "Card",
    bkash: "bKash",
    cash: "Cash",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
    unpaid: "Unpaid",
    partially_paid: "Partially paid",
    paid: "Paid",
    refunded: "Refunded",
};
