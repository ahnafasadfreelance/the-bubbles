export const restaurantConfig = {
    fallbackName: "Restaurant",
    navItems: [
        { label: "Home", href: "/" },
        { label: "Menu", href: "/menu" },
        { label: "About", href: "/about" },
        { label: "Contact", href: "/contact" },
    ],
} as const;

export const siteBranding = {
    primary: "#123c6d",
    accent: "#5ec8e5",
    background: "#f4f8ff",
};

export function getMetadataBase() {
    const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
    const deploymentHost = process.env.VERCEL_URL?.trim();
    const baseUrl = configuredUrl || (deploymentHost ? `https://${deploymentHost}` : null);
    if (!baseUrl) return undefined;

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(baseUrl);
    } catch {
        throw new Error("NEXT_PUBLIC_APP_URL must be a valid absolute URL.");
    }
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
        throw new Error("NEXT_PUBLIC_APP_URL must use HTTP or HTTPS.");
    }

    return new URL(parsedUrl.origin);
}
