export function safeLocalPath(value: string | null | undefined, fallback = "/") {
    if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
        return fallback;
    }

    try {
        const destination = new URL(value, "https://local.invalid");
        if (destination.origin !== "https://local.invalid") return fallback;
        return `${destination.pathname}${destination.search}${destination.hash}`;
    } catch {
        return fallback;
    }
}