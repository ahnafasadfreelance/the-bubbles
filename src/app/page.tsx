import Link from "next/link";
import { ArrowRight, ChefHat, Clock3, Heart, MapPin, Sparkles, Utensils } from "lucide-react";
import type { Metadata } from "next";

import { AddToCartButton } from "@/components/add-to-cart-button";
import { DataNotice } from "@/components/data-notice";
import { RestaurantImage } from "@/components/restaurant-image";
import { SiteHeader } from "@/components/site-header";
import { formatPrice } from "@/lib/format-price";
import { getMenuCatalog, getRestaurantSettings } from "@/lib/restaurant-data";

export const metadata: Metadata = {
    alternates: { canonical: "/" },
};

export default async function HomePage() {
    const [settings, catalog] = await Promise.all([
        getRestaurantSettings(),
        getMenuCatalog(),
    ]);
    const { restaurant } = settings;
    const featuredFoods = catalog.items.filter((item) => item.is_featured).slice(0, 4);
    const categories = catalog.categories.slice(0, 5);
    const heroImage = featuredFoods.find((item) => {
        const category = item.category_name.toLocaleLowerCase();
        return category !== "desserts" && category !== "drinks";
    })?.image_url ?? featuredFoods[0]?.image_url ?? restaurant.coverImageUrl;

    return (
        <div className="public-mobile-shell min-h-screen bg-[#03172b] text-white">
            <SiteHeader restaurant={restaurant} />

            <main>
                {!restaurant.isOrderingEnabled || !restaurant.dineInEnabled || restaurant.orderingAvailabilityMessage !== "Restaurant is currently accepting orders" ? (
                    <p role="status" className="border-b border-[#755b2b] bg-[#3a3020] px-4 py-3 text-center text-xs font-semibold text-[#ffe2a5]">{restaurant.orderingAvailabilityMessage}. You can still browse our menu.</p>
                ) : null}
                <section className="relative isolate min-h-75 overflow-hidden bg-[#03172b] sm:min-h-82.5 lg:min-h-69.5">
                    <RestaurantImage src={heroImage} alt="" fill loading="eager" sizes="100vw" className="object-[62%_52%]" />
                    <div className="absolute inset-0 bg-linear-to-r from-[#021426]/95 via-[#031a30]/70 to-[#031a30]/10" />
                    <div className="relative mx-auto flex min-h-75 max-w-5xl items-center px-5 py-9 sm:min-h-82.5 sm:px-8 lg:min-h-69.5 lg:px-0">
                        <div className="max-w-117.5">
                            <p className="text-[10px] font-semibold text-[#25c8eb]">Good Food <span className="px-1.5 text-white/60">·</span> Great Vibes <span className="px-1.5 text-white/60">·</span> {restaurant.name}</p>
                            <h1 className="mt-2 text-3xl font-bold leading-[1.05] text-white sm:text-4xl">
                                Fresh Flavors,<br /><span className="text-[#13c5eb]">Every Single Day</span>
                            </h1>
                            <p className="mt-3 max-w-102.5 text-[11px] leading-[1.65] text-white/85 sm:text-xs">
                                {restaurant.description ?? `Experience the perfect blend of taste, quality and atmosphere at ${restaurant.name}.`}
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2.5">
                                <Link href="/menu" className="inline-flex min-h-9 items-center gap-2 rounded-md bg-[#08afe0] px-3.5 text-[10px] font-bold text-white transition-colors hover:bg-[#0096ca] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93e7ff]">
                                    Order from the Menu <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                                </Link>
                                <Link href="/turf/book" className="inline-flex min-h-9 items-center gap-2 rounded-md bg-[#087a4a] px-3.5 text-[10px] font-bold text-white transition-colors hover:bg-[#06643d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93e7ff]">
                                    Book the Turf <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                                </Link>
                                <Link href="/about" className="inline-flex min-h-9 items-center gap-2 rounded-md border border-white/55 px-3.5 text-[10px] font-semibold text-white transition-colors hover:border-[#45d6f4] hover:text-[#8de7ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93e7ff]">
                                    Our Story <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                                </Link>
                            </div>
                        </div>
                    </div>
                    <span aria-hidden="true" className="absolute bottom-4 right-[max(1.25rem,calc((100vw-64rem)/2))] hidden items-center gap-1.5 sm:flex">
                        <span className="h-1 w-4 rounded-full bg-[#08c4e9]" />
                        <span className="h-1 w-4 rounded-full bg-white/55" />
                        <span className="h-1 w-4 rounded-full bg-white/55" />
                    </span>
                </section>

                <section aria-labelledby="home-categories" className="border-y border-[#0c3151] bg-[#06213b] py-5 sm:py-6">
                    <div className="mx-auto max-w-5xl px-5 sm:px-8 lg:px-0">
                        <div className="mb-4 text-center">
                            <h2 id="home-categories" className="text-base font-bold leading-5 text-white sm:text-lg">Our Menu Categories</h2>
                            <p className="mt-1 text-[10px] text-[#a8bfd2]">Explore delicious selections made with care.</p>
                        </div>
                        {catalog.categoryStatus === "ready" ? (
                            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
                                {categories.map((category) => (
                                    <Link key={category.id} href={`/menu#${category.slug}`} className="group relative isolate flex h-20.5 items-end overflow-hidden rounded-lg border border-[#135077] bg-[#0b2d4b] p-2.5 transition-colors hover:border-[#11bce7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#50d5f1]">
                                        <RestaurantImage src={category.image_url} alt="" fill className="-z-20 transition-transform duration-300 group-hover:scale-105" />
                                        <span className="absolute inset-0 -z-10 bg-linear-to-t from-[#031426]/95 via-[#031426]/25 to-transparent" />
                                        <span className="flex w-full items-center justify-between gap-2 text-[11px] font-semibold text-white">
                                            <span className="flex min-w-0 items-center gap-1.5"><Utensils className="h-3.5 w-3.5 shrink-0 text-[#2bc9ed]" aria-hidden="true" /><span className="truncate">{category.name}</span></span>
                                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#25c8eb] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        ) : <DataNotice status={catalog.categoryStatus} subject="Menu categories" />}
                    </div>
                </section>

                <section aria-labelledby="featured-dishes" className="relative overflow-hidden bg-[#03172b] py-6 sm:py-7">
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: "linear-gradient(135deg, transparent 49.7%, #124267 50%, transparent 50.3%)", backgroundSize: "210px 150px" }} />
                    <div className="relative mx-auto max-w-5xl px-5 sm:px-8 lg:px-0">
                        <div className="mb-4 flex items-end justify-between gap-4">
                            <div>
                                <h2 id="featured-dishes" className="text-base font-bold leading-5 text-white sm:text-lg">Featured Dishes</h2>
                                <p className="mt-1 text-[10px] text-[#a8bfd2]">Our chef&apos;s special recommendations, just for you.</p>
                            </div>
                            <Link href="/menu" className="inline-flex shrink-0 items-center gap-1 text-[9px] font-semibold text-[#27c8eb] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#50d5f1]">
                                View Full Menu <ArrowRight className="h-3 w-3" aria-hidden="true" />
                            </Link>
                        </div>

                        {catalog.itemStatus === "error" || catalog.itemStatus === "unconfigured" ? (
                            <DataNotice status={catalog.itemStatus} subject="Featured dishes" />
                        ) : featuredFoods.length ? (
                            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                                {featuredFoods.map((item) => {
                                    const price = item.discount_price !== null && item.discount_price >= 0 && item.discount_price < item.price
                                        ? item.discount_price
                                        : item.price;
                                    return (
                                        <article key={item.id} className="group overflow-hidden rounded-md border border-[#0e3b60] bg-[#06223d] transition-colors hover:border-[#1174a0]">
                                            <Link href={`/menu/${item.slug}`} className="relative block aspect-[2.1] overflow-hidden bg-[#0b2d4b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#50d5f1]">
                                                <RestaurantImage src={item.image_url} alt={item.name} fill className="transition-transform duration-300 group-hover:scale-105" />
                                                <span className="absolute left-2 top-2 rounded-sm bg-[#08afe0] px-1.5 py-0.5 text-[8px] font-bold text-white">Featured</span>
                                            </Link>
                                            <div className="p-2.5">
                                                <Link href={`/menu/${item.slug}`} className="block truncate text-[11px] font-bold text-white hover:text-[#65ddf5]">{item.name}</Link>
                                                <p className="mt-0.5 min-h-7 line-clamp-2 text-[9px] leading-[1.45] text-[#a8bfd2]">{item.description ?? item.category_name}</p>
                                                <div className="mt-2 flex items-center justify-between gap-2">
                                                    <span className="text-[11px] font-bold tabular-nums text-white">{formatPrice(price, restaurant.currency)}</span>
                                                    <span className="inline-flex items-center gap-1 text-[9px] text-[#a8bfd2]">{item.preparation_time_minutes > 0 ? <><Clock3 className="h-3 w-3 text-[#23c8eb]" aria-hidden="true" />{item.preparation_time_minutes} min</> : null}</span>
                                                    <AddToCartButton item={item} table={null} compact />
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        ) : <p className="border border-[#0e3b60] bg-[#06223d] px-4 py-6 text-center text-xs text-[#a8bfd2]">No featured dishes are available right now.</p>}
                    </div>
                </section>

                <section aria-labelledby="about-restaurant" className="border-y border-[#0e3b60] bg-[#06213b]">
                    <div className="mx-auto grid max-w-5xl lg:min-h-47.5 lg:grid-cols-[1fr_1.1fr]">
                        <div className="relative min-h-47.5 overflow-hidden bg-[#0b2d4b] sm:min-h-57.5 lg:min-h-0">
                            <RestaurantImage src={restaurant.coverImageUrl} alt={`${restaurant.name} dining room`} fill />
                            <span className="absolute inset-0 bg-linear-to-r from-transparent via-transparent to-[#06213b]/45 lg:bg-linear-to-r" />
                        </div>
                        <div className="flex flex-col justify-center px-5 py-6 sm:px-8 lg:px-10">
                            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#27c8eb]">About {restaurant.name}</p>
                            <h2 id="about-restaurant" className="mt-1 text-lg font-bold leading-6 text-white">More Than Just a Restaurant</h2>
                            <p className="mt-1.5 max-w-xl text-[10px] leading-[1.6] text-[#b5c9da]">{restaurant.aboutText ?? restaurant.description ?? `At ${restaurant.name}, every meal is a chance to slow down, enjoy fresh flavors, and share a good moment.`}</p>
                            <div className="mt-4 grid grid-cols-3 gap-2.5">
                                <div className="flex items-start gap-1.5"><Heart className="mt-0.5 h-4 w-4 shrink-0 text-[#18c4e8]" aria-hidden="true" /><span className="text-[9px] font-semibold leading-4 text-white">Fresh Ingredients<span className="block font-normal text-[#93adc2]">Always fresh & local</span></span></div>
                                <div className="flex items-start gap-1.5"><ChefHat className="mt-0.5 h-4 w-4 shrink-0 text-[#18c4e8]" aria-hidden="true" /><span className="text-[9px] font-semibold leading-4 text-white">Skilled Chefs<span className="block font-normal text-[#93adc2]">Crafted with passion</span></span></div>
                                <div className="flex items-start gap-1.5"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#18c4e8]" aria-hidden="true" /><span className="text-[9px] font-semibold leading-4 text-white">Cozy Atmosphere<span className="block font-normal text-[#93adc2]">Perfect for any occasion</span></span></div>
                            </div>
                            <Link href="/about" className="mt-4 inline-flex min-h-8 w-fit items-center gap-2 rounded-md bg-[#08afe0] px-3 text-[9px] font-bold text-white transition-colors hover:bg-[#0096ca] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93e7ff]">
                                Learn More <ArrowRight className="h-3 w-3" aria-hidden="true" />
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="border-t border-[#0d4165] bg-[#021426]">
                <div className="mx-auto grid max-w-5xl gap-4 px-5 py-4 text-[9px] text-[#a8bfd2] sm:grid-cols-[1fr_1.3fr_0.8fr_0.8fr] sm:items-center sm:px-8 lg:px-0">
                    <Link href="/" className="flex items-center gap-2 text-white" aria-label={`${restaurant.name} home`}>
                        <Utensils className="h-5 w-5 text-[#17c5eb]" aria-hidden="true" />
                        <span><span className="block text-[11px] font-bold">{restaurant.name}</span><span className="block text-[8px] text-[#8da6ba]">Restaurant & Cafe</span></span>
                    </Link>
                    <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                        {restaurant.address ? <p className="flex items-start gap-1.5"><MapPin className="mt-0.5 h-3 w-3 shrink-0 text-[#21c6e9]" aria-hidden="true" />{restaurant.address}</p> : null}
                        {restaurant.openingHours ? <p className="flex items-start gap-1.5 sm:col-span-2"><Clock3 className="mt-0.5 h-3 w-3 shrink-0 text-[#21c6e9]" aria-hidden="true" />{restaurant.openingHours}</p> : null}
                        {restaurant.phone ? <p className="truncate">{restaurant.phone}</p> : null}
                        {restaurant.email ? <a href={`mailto:${restaurant.email}`} className="truncate hover:text-white">{restaurant.email}</a> : null}
                        <Link href="/contact" className="inline-flex items-center gap-1 text-[#8de7ff] hover:text-white">Contact us <ArrowRight className="h-3 w-3" aria-hidden="true" /></Link>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {restaurant.socialLinks.length ? restaurant.socialLinks.map((social) => <a key={social.label} href={social.url} target="_blank" rel="noreferrer" className="hover:text-white">{social.label}</a>) : <span>Follow {restaurant.name}</span>}
                    </div>
                    <p className="sm:text-right">© {new Date().getFullYear()} {restaurant.name}</p>
                </div>
            </footer>
        </div>
    );
}