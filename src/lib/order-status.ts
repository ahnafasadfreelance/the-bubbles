export const ORDER_STATUSES = [
    "pending",
    "confirmed",
    "preparing",
    "ready",
    "completed",
    "rejected",
    "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
    pending: "Pending",
    confirmed: "Confirmed",
    preparing: "Preparing",
    ready: "Ready",
    completed: "Completed",
    rejected: "Rejected",
    cancelled: "Cancelled",
};

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
    pending: ["confirmed", "rejected", "cancelled"],
    confirmed: ["preparing"],
    preparing: ["ready"],
    ready: ["completed"],
    completed: [],
    rejected: [],
    cancelled: [],
};

export function isOrderStatus(value: unknown): value is OrderStatus {
    return typeof value === "string" && ORDER_STATUSES.includes(value as OrderStatus);
}

export function canTransitionOrder(from: OrderStatus, to: OrderStatus) {
    return ORDER_STATUS_TRANSITIONS[from].includes(to);
}