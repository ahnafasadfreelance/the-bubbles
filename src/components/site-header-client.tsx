"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, ClipboardList, Home, Info, LayoutDashboard, LogIn, LogOut, Menu, ShoppingCart, Utensils, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { RestaurantImage } from "@/components/restaurant-image";
import type { RestaurantSettings } from "@/lib/restaurant-data";
import type { CustomerIdentity } from "@/lib/supabase/identity";
import { customerIdentityFromUser } from "@/lib/supabase/identity";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { restaurantConfig } from "@/lib/site";
import { useCart } from "@/components/cart-provider";

type SiteHeaderClientProps = {
    restaurant: RestaurantSettings;
    initialCustomer: CustomerIdentity | null;
    initialAdminUserId: string | null;
};

function AccountActions({
    customer,
    signingOut,
    signOutError,
    onSignOut,
    mobile = false,
}: {
    customer: CustomerIdentity | null;
    signingOut: boolean;
    signOutError: string | null;
    onSignOut: () => void;
    mobile?: boolean;
}) {
    if (!customer) {
        return (
            <Link
                href="/login"
                className={`inline-flex items-center justify-center gap-2 rounded-full border border-white/25 px-4 py-2 text-xs font-semibold text-white transition-colors hover:border-[#38c9ef] hover:text-[#8de7ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93e7ff] ${mobile ? "w-full" : ""}`}
            >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Sign in
            </Link>
        );
    }

    const label = customer.displayName ?? customer.email ?? "Google account";
    const accountDetails = customer.email ? `${label} (${customer.email})` : label;

    return (
        <div className={`flex items-center gap-2 ${mobile ? "flex-wrap" : ""}`}>
            {customer.avatarUrl ? (
                <Image
                    src={customer.avatarUrl}
                    alt=""
                    width={32}
                    height={32}
                    unoptimized
                    className="h-8 w-8 rounded-full border border-white/25 object-cover"
                />
            ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-white/10 text-[#8de7ff]">
                    <UserRound className="h-4 w-4" aria-hidden="true" />
                </span>
            )}
            <span className="flex max-w-24 flex-col truncate text-xs font-medium leading-tight text-white" title={accountDetails} aria-label={accountDetails}>
                <span className="truncate">{label}</span>
                {customer.displayName && customer.email ? (
                    <span className={`truncate text-[9px] font-normal text-white/65 ${mobile ? "" : "hidden lg:block"}`}>
                        {customer.email}
                    </span>
                ) : null}
            </span>
            <button
                type="button"
                onClick={onSignOut}
                disabled={signingOut}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/25 px-3 py-2 text-xs font-semibold text-white transition-colors hover:border-[#38c9ef] hover:text-[#8de7ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93e7ff] disabled:cursor-wait disabled:opacity-60"
            >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                {signingOut ? "Signing out" : "Sign out"}
            </button>
            {signOutError ? <p role="alert" className="basis-full text-xs text-[#ffc7c7]">{signOutError}</p> : null}
        </div>
    );
}

export function SiteHeaderClient({ restaurant, initialCustomer, initialAdminUserId }: SiteHeaderClientProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [customer, setCustomer] = useState(initialCustomer);
    const [signingOut, setSigningOut] = useState(false);
    const [signOutError, setSignOutError] = useState<string | null>(null);
    const pathname = usePathname();
    const router = useRouter();
    const { itemCount } = useCart();
    const isAdmin = Boolean(initialAdminUserId && customer?.id === initialAdminUserId);
    const orderNavigation = pathname === "/cart" || pathname === "/my-orders" || pathname === "/login" || pathname.startsWith("/orders/") || pathname.startsWith("/menu/");
    const mobileTabs = pathname === "/cart"
        ? [
            { href: "/", label: "Home", icon: Home },
            { href: "/cart", label: "Cart", icon: ShoppingCart },
            { href: "/my-orders", label: "Orders", icon: ClipboardList },
            { label: "Profile", icon: UserRound },
        ]
        : orderNavigation
            ? [
                { href: "/", label: "Home", icon: Home },
                { href: "/menu", label: "Menu", icon: Utensils },
                { href: "/my-orders", label: "Orders", icon: ClipboardList },
                { label: "Profile", icon: UserRound },
            ]
            : [
                { href: "/", label: "Home", icon: Home },
                { href: "/menu", label: "Menu", icon: Utensils },
                { href: "/about", label: "About", icon: Info },
                { href: "/turf/book", label: "Book Turf", icon: CalendarDays },
            ];

    useEffect(() => {
        if (!isSupabaseConfigured()) return;

        const supabase = createClient();
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setCustomer(session?.user ? customerIdentityFromUser(session.user) : null);

            if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
                router.refresh();
            }
        });

        return () => subscription.unsubscribe();
    }, [router]);

    async function signOut() {
        setSigningOut(true);
        setSignOutError(null);

        try {
            const { error } = await createClient().auth.signOut();
            if (error) setSignOutError("We could not sign you out. Please try again.");
        } catch {
            setSignOutError("We could not sign you out. Please try again.");
        } finally {
            setSigningOut(false);
        }
    }

    return (
        <header className="sticky top-0 z-50 border-b border-white/10 bg-[#041d37] text-white shadow-lg shadow-[#041d37]/15">
            <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:h-17 sm:px-6 lg:px-8">
                <Link href="/" className="flex min-w-0 shrink items-center gap-2.5 sm:gap-2" aria-label={`${restaurant.name} home`}>
                    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden text-[#39c9f0] sm:h-10 sm:w-10">
                        {restaurant.logoUrl ? (
                            <RestaurantImage src={restaurant.logoUrl} alt={`${restaurant.name} logo`} fill sizes="40px" className="object-contain" />
                        ) : (
                            <Utensils className="h-6 w-6 sm:h-6 sm:w-6" strokeWidth={1.7} aria-hidden="true" />
                        )}
                    </span>
                    <span className="min-w-0">
                        <span className="display-heading block truncate text-base font-bold leading-5 text-white sm:text-base">{restaurant.name}</span>
                        <span className="block text-[9px] font-medium uppercase tracking-[0.1em] text-[#b5c9dc] sm:text-[9px] sm:tracking-[0.12em]">Good food · great mood</span>
                    </span>
                </Link>

                <nav className="hidden h-full items-center gap-4 md:flex lg:gap-7" aria-label="Main navigation">
                    {restaurantConfig.navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            aria-current={pathname === item.href ? "page" : undefined}
                            className={`relative flex h-full items-center text-xs font-medium transition-colors hover:text-[#38c9ef] ${pathname === item.href ? "text-[#38c9ef] after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:bg-[#38c9ef]" : "text-white/85"}`}
                        >
                            {item.label}
                        </Link>
                    ))}
                    <Link href="/turf/book" className="text-xs font-medium text-white/85 transition-colors hover:text-[#8de7ff]">
                        Book Turf
                    </Link>
                </nav>

                <div className="hidden items-center gap-3 md:flex">
                    <AccountActions customer={customer} signingOut={signingOut} signOutError={signOutError} onSignOut={signOut} />
                    {isAdmin ? (
                        <Link href="/admin" aria-label="Admin dashboard" title="Admin dashboard" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#38c9ef]/60 px-3 text-xs font-semibold text-[#8de7ff] transition-colors hover:bg-[#0b4162] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93e7ff]">
                            <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                            Admin
                        </Link>
                    ) : null}
                    {customer ? (
                        <Link href="/my-orders" aria-label="My orders" title="My orders" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/25 text-white hover:border-[#38c9ef] hover:text-[#8de7ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93e7ff]">
                            <ClipboardList className="h-4 w-4" aria-hidden="true" />
                        </Link>
                    ) : null}
                    <Link href="/cart" aria-label={`Cart, ${itemCount} items`} className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/25 text-white hover:border-[#38c9ef] hover:text-[#8de7ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93e7ff]">
                        <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                        {itemCount > 0 ? <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#14b8df] px-1 text-[10px] font-bold text-white">{itemCount}</span> : null}
                    </Link>
                    <Link
                        href="/menu"
                        className="inline-flex items-center gap-2 rounded-full bg-[#08afe0] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0096ca] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93e7ff]"
                    >
                        Browse Menu
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                </div>

                <button
                    type="button"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/5 text-white transition-[background-color,transform] duration-200 hover:bg-white/10 motion-reduce:transition-none md:hidden"
                    aria-label={isOpen ? "Close menu" : "Open menu"}
                    aria-expanded={isOpen}
                    aria-controls="mobile-navigation"
                    onClick={() => setIsOpen((current) => !current)}
                >
                    <span className="relative flex h-6 w-6 items-center justify-center">
                        <Menu className={`absolute h-6 w-6 transition-all duration-200 ease-out motion-reduce:transition-none ${isOpen ? "rotate-90 scale-75 opacity-0" : "rotate-0 scale-100 opacity-100"}`} aria-hidden="true" />
                        <X className={`absolute h-6 w-6 transition-all duration-200 ease-out motion-reduce:transition-none ${isOpen ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-75 opacity-0"}`} aria-hidden="true" />
                    </span>
                </button>
            </div>

            <div
                id="mobile-navigation"
                aria-hidden={!isOpen}
                inert={!isOpen}
                className={`mobile-menu-panel absolute inset-x-0 top-full z-40 max-h-[calc(100dvh-3rem)] overflow-y-auto border-t border-white/10 bg-[#041d37]/98 shadow-[0_18px_36px_rgba(0,0,0,0.42)] backdrop-blur-md md:hidden ${isOpen ? "is-open" : ""}`}
            >
                    <nav className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 sm:px-6" aria-label="Mobile navigation">
                        {restaurantConfig.navItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className="rounded px-3 py-2 text-sm font-medium text-white/85 transition-colors hover:bg-white/5 hover:text-[#38c9ef]"
                                onClick={() => setIsOpen(false)}
                            >
                                {item.label}
                            </Link>
                        ))}
                        <Link
                            href="/turf/book"
                            className="rounded px-3 py-2 text-sm font-semibold text-[#8de7ff] transition-colors hover:bg-white/5"
                            onClick={() => setIsOpen(false)}
                        >
                            Book the Turf
                        </Link>
                        <div className="mt-2 border-t border-white/10 pt-4">
                            <AccountActions customer={customer} signingOut={signingOut} signOutError={signOutError} onSignOut={signOut} mobile />
                            {isAdmin ? (
                                <Link href="/admin" className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#38c9ef]/60 px-5 py-3 text-sm font-semibold text-[#8de7ff] hover:bg-[#0b4162]" onClick={() => setIsOpen(false)}>
                                    <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                                    Admin dashboard
                                </Link>
                            ) : null}
                            {customer ? (
                                <Link href="/my-orders" className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/25 px-5 py-3 text-sm font-semibold text-white" onClick={() => setIsOpen(false)}>
                                    <ClipboardList className="h-4 w-4" aria-hidden="true" />
                                    My orders
                                </Link>
                            ) : null}
                        </div>
                        <Link
                            href="/cart"
                            className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 px-5 py-3 text-sm font-semibold text-white"
                            onClick={() => setIsOpen(false)}
                        >
                            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                            Cart{itemCount > 0 ? ` (${itemCount})` : ""}
                        </Link>
                        <Link
                            href="/menu"
                            className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-[#08afe0] px-5 py-3 text-sm font-semibold text-white"
                            onClick={() => setIsOpen(false)}
                        >
                            Browse Menu
                            <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                    </nav>
            </div>

            <nav aria-label="Quick navigation" className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-[#17415f] bg-[#03182b]/95 px-2 pt-1.5 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
                {mobileTabs.map((tab) => {
                    const Icon = tab.icon;
                    const active = "href" in tab && tab.href
                        ? tab.href === "/" ? pathname === "/" : pathname === tab.href || pathname.startsWith(`${tab.href}/`)
                        : tab.label === "Profile" && pathname === "/login";
                    const className = `relative flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-md text-[10px] font-medium transition-colors ${active ? "text-[#19c4eb]" : "text-[#829bb0] hover:text-white"}`;
                    if (!tab.href) {
                        return <button key={tab.label} type="button" aria-expanded={isOpen} onClick={() => setIsOpen((current) => !current)} className={className}><Icon className="h-5 w-5" aria-hidden="true" />{tab.label}</button>;
                    }
                    return <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined} className={className}><Icon className="h-5 w-5" aria-hidden="true" />{tab.label}{tab.href === "/cart" && itemCount > 0 ? <span className="absolute right-3 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#08afe0] px-1 text-[8px] font-bold text-white">{itemCount}</span> : null}</Link>;
                })}
            </nav>
        </header>
    );
}