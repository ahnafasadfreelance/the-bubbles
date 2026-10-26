import { ChefHat, Heart, Leaf, ShieldCheck, TimerReset, Utensils } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { RestaurantImage } from "@/components/restaurant-image";
import { getMenuCatalog, getRestaurantSettings } from "@/lib/restaurant-data";
import { getCurrentCustomer } from "@/lib/supabase/auth-server";
import { safeLocalPath } from "@/lib/supabase/redirects";

type LoginPageProps = {
    searchParams: Promise<{ error?: string; next?: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
    const { restaurant } = await getRestaurantSettings();

    return {
        title: { absolute: `Sign in · ${restaurant.name}` },
        description: `Sign in to place your order and enjoy delicious food at ${restaurant.name}.`,
        robots: { index: false, follow: false },
    };
}

const authErrors: Record<string, string> = {
    cancelled: "Google sign-in was cancelled. You can try again whenever you are ready.",
    callback_failed: "We could not complete Google sign-in. Please try again.",
};

const highlights = [
    { label: "Fresh Ingredients", Icon: Leaf },
    { label: "Expert Chefs", Icon: ChefHat },
    { label: "Great Experience", Icon: Heart },
];

const benefits = [
    { label: "Secure & Safe", Icon: ShieldCheck },
    { label: "Quick Ordering", Icon: TimerReset },
    { label: "Better Experience", Icon: Heart },
];

function BrandLockup({
    compact = false,
    logoUrl,
    restaurantName,
}: {
    compact?: boolean;
    logoUrl: string | null;
    restaurantName: string;
}) {
    return (
        <div className={`flex items-center ${compact ? "justify-center gap-3" : "gap-3"}`}>
            <span className={`${compact ? "h-10 w-10" : "h-9 w-9"} relative flex shrink-0 items-center justify-center text-[#00cfff]`}>
                {logoUrl ? (
                    <RestaurantImage src={logoUrl} alt={`${restaurantName} logo`} sizes="40px" className="object-contain" />
                ) : (
                    <Utensils className="h-full w-full" strokeWidth={1.8} aria-hidden="true" />
                )}
            </span>
            <div className={compact ? "text-left" : ""}>
                <p className={`${compact ? "max-w-[min(68vw,24rem)] break-words text-2xl" : "text-xl"} font-semibold leading-tight tracking-tight text-white`}>
                    {restaurantName}
                </p>
                <p className={`${compact ? "mt-1 text-sm" : "mt-0.5 text-[11px]"} font-medium tracking-wide text-[#00cfff]`}>
                    Good Food · Great Vibes
                </p>
            </div>
        </div>
    );
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
    const [settings, catalog, customer, params] = await Promise.all([
        getRestaurantSettings(),
        getMenuCatalog(),
        getCurrentCustomer(),
        searchParams,
    ]);
    const next = safeLocalPath(params.next, "/");
    const foodImageUrl = catalog.items.find((item) => item.is_featured && item.image_url)?.image_url
        ?? catalog.items.find((item) => item.image_url)?.image_url
        ?? settings.restaurant.coverImageUrl;

    if (customer) redirect(next);

    return (
        <main className="login-page min-h-[100svh] overflow-x-hidden bg-[#04152b] text-white lg:grid lg:min-h-screen lg:grid-cols-[1.08fr_0.92fr]">
            <section className="relative hidden min-h-screen overflow-hidden bg-[#04152b] lg:flex lg:flex-col">
                <RestaurantImage
                    src={foodImageUrl}
                    alt=""
                    fill
                    loading="eager"
                    sizes="(max-width: 1023px) 100vw, 55vw"
                    className="object-cover opacity-65"
                />
                <div className="absolute inset-0 bg-linear-to-b from-[#04152b]/85 via-[#04152b]/35 to-[#04152b]/90" />
                <div className="absolute inset-0 bg-linear-to-r from-[#04152b]/35 to-transparent" />

                <div className="relative flex flex-1 flex-col px-8 py-10 xl:px-14 xl:py-12 2xl:px-20">
                    <BrandLockup logoUrl={settings.restaurant.logoUrl} restaurantName={settings.restaurant.name} />

                    <div className="my-auto max-w-xl py-14 xl:py-20">
                        <span className="mb-5 block h-1 w-10 rounded-full bg-[#00cfff]" />
                        <h1 className="text-5xl font-semibold leading-[1.08] tracking-tight xl:text-6xl 2xl:text-7xl">
                            Good Food,
                            <span className="mt-1 block text-[#00cfff]">Great Vibes</span>
                        </h1>
                        <p className="mt-6 max-w-md text-base leading-7 text-[#cfdeed] xl:text-lg xl:leading-8">
                            Delicious food, fresh ingredients, and memorable moments — all at {settings.restaurant.name}.
                        </p>
                    </div>

                    <ul className="grid max-w-lg grid-cols-3 divide-x divide-[#00cfff]/25">
                        {highlights.map(({ label, Icon }) => (
                            <li key={label} className="flex items-center gap-2.5 px-3 first:pl-0 last:pr-0 xl:gap-3 xl:px-5">
                                <Icon className="h-5 w-5 shrink-0 text-[#00cfff] xl:h-6 xl:w-6" strokeWidth={1.7} aria-hidden="true" />
                                <span className="max-w-24 text-xs font-medium leading-4 text-[#e1edf7] xl:text-sm xl:leading-5">
                                    {label}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8 lg:min-h-screen lg:justify-center lg:px-8 lg:py-10 xl:px-12 2xl:px-16">
                <div className="login-mobile-backdrop absolute inset-0 overflow-hidden lg:hidden" aria-hidden="true">
                    <RestaurantImage
                        src={foodImageUrl}
                        alt=""
                        fill
                        loading="eager"
                        sizes="100vw"
                        className="object-cover object-center"
                    />
                    <div className="login-mobile-backdrop-shade absolute inset-0" />
                    <span className="login-ambient-orb login-ambient-orb-one" />
                    <span className="login-ambient-orb login-ambient-orb-two" />
                    <span className="login-ambient-line" />
                </div>

                <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col lg:flex-none">
                    <div className="pt-2 lg:hidden">
                        <BrandLockup compact logoUrl={settings.restaurant.logoUrl} restaurantName={settings.restaurant.name} />
                    </div>

                    <div className="my-auto py-7 text-center sm:py-10 lg:my-0 lg:rounded-3xl lg:border lg:border-[#078bff]/35 lg:bg-[#061b33]/75 lg:px-8 lg:py-10 xl:px-10 xl:py-12">
                        <div className="mb-7 hidden lg:flex">
                            <BrandLockup compact logoUrl={settings.restaurant.logoUrl} restaurantName={settings.restaurant.name} />
                        </div>

                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#5d86a9] lg:hidden">
                            Your table is waiting
                        </p>
                        <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-[2.75rem] lg:mt-0 lg:text-3xl xl:text-4xl">
                            Welcome <span className="text-[#00cfff]">Back</span>
                        </h2>
                        <p className="mx-auto mt-3 max-w-sm text-base leading-6 text-[#b7cbe0] sm:text-lg sm:leading-7 lg:mt-3 lg:text-sm lg:leading-6 xl:text-base">
                            Sign in to place your order and enjoy our delicious food.
                        </p>

                        <div className="mt-7 sm:mt-9 lg:mt-7">
                            <GoogleSignInButton next={next} />
                            {params.error && authErrors[params.error] ? (
                                <p
                                    role="alert"
                                    className="mt-4 rounded-xl border border-[#00cfff]/25 bg-[#062743] px-4 py-3 text-left text-sm leading-5 text-[#d1e7f5]"
                                >
                                    {authErrors[params.error]}
                                </p>
                            ) : null}
                        </div>

                        <div className="my-7 flex items-center gap-4 sm:my-8 lg:my-7">
                            <span className="h-px flex-1 bg-linear-to-r from-transparent to-[#17608e]" />
                            <span className="h-1.5 w-1.5 rounded-full bg-[#078bff]" />
                            <span className="h-px flex-1 bg-linear-to-l from-transparent to-[#17608e]" />
                        </div>

                        <ul className="grid grid-cols-3 divide-x divide-[#17608e]/55">
                            {benefits.map(({ label, Icon }) => (
                                <li key={label} className="flex flex-col items-center gap-2 px-1.5 text-center sm:px-3">
                                    <Icon className="h-5 w-5 text-[#8bc7ed] sm:h-6 sm:w-6" strokeWidth={1.7} aria-hidden="true" />
                                    <span className="text-[10px] font-medium leading-4 text-[#a9c3d9] sm:text-xs">{label}</span>
                                </li>
                            ))}
                        </ul>

                        <p className="mt-8 hidden items-center justify-center gap-2 text-xs text-[#7895b1] lg:flex">
                            <Leaf className="h-4 w-4 text-[#00cfff]" strokeWidth={1.7} aria-hidden="true" />
                            Thank you for choosing {settings.restaurant.name}
                        </p>
                    </div>

                    <footer className="mt-5 pb-1 text-center text-xs tracking-wide text-[#7895b1] lg:mt-8">
                        <span className="lg:hidden">Good food tastes better together</span>
                        <span className="hidden lg:inline">{settings.restaurant.name} · Good Food · Great Vibes</span>
                    </footer>
                </div>
            </section>
        </main>
    );
}
