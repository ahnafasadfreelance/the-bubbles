import type { Metadata } from "next";
import Link from "next/link";
import { ChefHat, Heart, Sparkles } from "lucide-react";

import { DataNotice } from "@/components/data-notice";
import { RestaurantImage } from "@/components/restaurant-image";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ButtonLink, PageBanner } from "@/components/ui";
import { getRestaurantSettings } from "@/lib/restaurant-data";

export async function generateMetadata(): Promise<Metadata> {
    const { restaurant } = await getRestaurantSettings();
    const description = restaurant.aboutText ?? restaurant.description ?? `Learn about ${restaurant.name}.`;

    return {
        title: "About",
        description,
        alternates: { canonical: "/about" },
        openGraph: {
            title: `About ${restaurant.name}`,
            description,
            url: "/about",
        },
    };
}

export default async function AboutPage() {
    const settings = await getRestaurantSettings();
    const { restaurant } = settings;

    return (
        <div className="public-mobile-shell min-h-screen bg-[#f7faff] text-[#09294d]">
            <SiteHeader restaurant={restaurant} />

            <PageBanner eyebrow="Our story" title={`About ${restaurant.name}`} description={restaurant.description ?? "Restaurant story details have not been published yet."} coverImageUrl={restaurant.coverImageUrl} />

            <main>
                <div className="mx-auto max-w-7xl px-5 pt-6 sm:px-8 lg:px-10"><DataNotice status={settings.status} subject="Restaurant information" /></div>
                <section className="mx-auto grid max-w-5xl items-center gap-0 px-4 py-5 sm:gap-8 sm:px-8 sm:py-12 lg:grid-cols-2 lg:px-10">
                    <div className="relative order-1 aspect-[2.15] overflow-hidden bg-[#0b2d4b] lg:order-2 lg:aspect-[1.55]">
                        <RestaurantImage src={restaurant.coverImageUrl} alt={`${restaurant.name} restaurant`} fill sizes="(max-width: 1024px) 100vw, 50vw" />
                    </div>
                    <div className="order-2 py-5 lg:order-1">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0879be]">Our story</p>
                        <h2 className="mt-1 text-xl font-bold text-[#09294d] sm:text-3xl">More Than Just a Restaurant</h2>
                        <p className="mt-2 text-xs leading-5 text-[#617991] sm:text-sm sm:leading-6">{restaurant.description ?? "More information about the restaurant will appear here once it has been added to its profile."}</p>
                        <div className="mt-4 grid grid-cols-3 gap-2.5 sm:mt-7 sm:gap-4">
                            <div className="flex items-center gap-2 text-[9px] sm:text-xs"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0a3657] text-[#1ac5eb] sm:h-10 sm:w-10"><Heart className="h-4 w-4" aria-hidden="true" /></span><span className="font-semibold">Fresh Ingredients<span className="block font-normal text-[#829bb0]">Always fresh & local</span></span></div>
                            <div className="flex items-center gap-2 text-[9px] sm:text-xs"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0a3657] text-[#1ac5eb] sm:h-10 sm:w-10"><ChefHat className="h-4 w-4" aria-hidden="true" /></span><span className="font-semibold">Skilled Chefs<span className="block font-normal text-[#829bb0]">Crafted with passion</span></span></div>
                            <div className="flex items-center gap-2 text-[9px] sm:text-xs"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0a3657] text-[#1ac5eb] sm:h-10 sm:w-10"><Sparkles className="h-4 w-4" aria-hidden="true" /></span><span className="font-semibold">Cozy Atmosphere<span className="block font-normal text-[#829bb0]">For every occasion</span></span></div>
                        </div>
                        <div className="mt-4 sm:mt-6"><ButtonLink href="/contact">Contact the restaurant</ButtonLink></div>
                    </div>
                </section>

                <section className="mx-auto grid max-w-5xl gap-4 px-4 pb-5 sm:grid-cols-[1fr_1fr] sm:items-center sm:px-8 sm:pb-9 lg:px-10">
                    <div className="relative aspect-[2.3] overflow-hidden rounded-md bg-[#0b2d4b]">
                        <RestaurantImage src={restaurant.coverImageUrl} alt={`${restaurant.name} dining room`} fill sizes="(max-width: 1024px) 100vw, 50vw" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0879be]">Ready when you are</p>
                        <h2 className="mt-1 text-lg font-bold text-[#09294d] sm:text-2xl">Make your next meal a good one.</h2>
                        <p className="mt-2 text-xs leading-5 text-[#829bb0]">Join us for a meal, a celebration, or simply a great time.</p>
                    </div>
                    <Link href="/menu" className="inline-flex min-h-9 w-fit items-center justify-center rounded-md bg-[#08afe0] px-4 text-xs font-bold text-white transition-colors hover:bg-[#0096ca] sm:col-start-2">Explore the menu</Link>
                </section>
            </main>

            <SiteFooter restaurant={restaurant} />
        </div>
    );
}
