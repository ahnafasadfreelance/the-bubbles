import Link from "next/link";
import { Clock3, Mail, MapPin, Phone, Utensils } from "lucide-react";

import { RestaurantImage } from "@/components/restaurant-image";
import type { RestaurantSettings } from "@/lib/restaurant-data";
import { restaurantConfig } from "@/lib/site";

export function SiteFooter({ restaurant }: { restaurant: RestaurantSettings }) {
    const year = new Date().getFullYear();

    return (
        <footer className="hidden border-t border-white/10 bg-[#041d37] text-white md:block">
            <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
                <div className="grid gap-10 lg:grid-cols-[1.3fr_0.8fr_0.9fr_1.1fr]">
                    <div>
                        <div className="mb-4 flex items-center gap-3">
                            <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden text-[#39c9f0]">
                                {restaurant.logoUrl ? (
                                    <RestaurantImage src={restaurant.logoUrl} alt={`${restaurant.name} logo`} fill sizes="36px" className="object-contain" />
                                ) : (
                                    <Utensils className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
                                )}
                            </span>
                            <div>
                                <p className="display-heading text-lg font-bold text-white">
                                    {restaurant.name}
                                </p>
                            </div>
                        </div>
                        <p className="max-w-sm text-sm leading-6 text-[#b3c5d7]">
                            {restaurant.description ?? "Restaurant information is being updated."}
                        </p>
                    </div>

                    <div>
                        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#55c9ed]">
                            Explore
                        </p>
                        <ul className="space-y-2.5 text-sm text-[#b3c5d7]">
                            {restaurantConfig.navItems.map((item) => (
                                <li key={item.href}>
                                    <Link href={item.href} className="transition-colors hover:text-[#55c9ed]">
                                        {item.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div>
                        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#55c9ed]">
                            Contact
                        </p>
                        <ul className="space-y-2.5 text-sm text-[#b3c5d7]">
                            <li className="flex items-start gap-3">
                                <MapPin className="mt-0.5 h-4 w-4 text-[#55c9ed]" />
                                <span>{restaurant.address ?? "Address not provided"}</span>
                            </li>
                            <li className="flex items-center gap-3">
                                <Phone className="h-4 w-4 text-[#55c9ed]" />
                                <span>{restaurant.phone ?? "Phone not provided"}</span>
                            </li>
                            <li className="flex items-center gap-3">
                                <Mail className="h-4 w-4 text-[#55c9ed]" />
                                <span>{restaurant.email ?? "Email not provided"}</span>
                            </li>
                            <li className="flex items-center gap-3">
                                <Clock3 className="h-4 w-4 text-[#55c9ed]" />
                                <span>{restaurant.openingHours ?? "Hours not provided"}</span>
                            </li>
                        </ul>
                    </div>

                    <div>
                        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#55c9ed]">
                            Follow
                        </p>
                        {restaurant.socialLinks.length ? (
                            <div className="flex flex-wrap gap-3 text-sm text-[#b3c5d7]">
                                {restaurant.socialLinks.map((item) => (
                                    <a key={item.label} href={item.url} target="_blank" rel="noreferrer" className="transition-colors hover:text-[#55c9ed]">
                                        {item.label}
                                    </a>
                                ))}
                            </div>
                        ) : <p className="text-sm text-[#91a8be]">No social links provided</p>}
                    </div>
                </div>

                <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-[#91a8be] sm:flex-row sm:items-center sm:justify-between">
                    <p>© {year} {restaurant.name}. All rights reserved.</p>
                </div>
            </div>
        </footer>
    );
}
