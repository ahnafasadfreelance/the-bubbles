import type { Metadata } from "next";
import { ArrowRight, Clock3, Mail, MapPin, Phone } from "lucide-react";

import { DataNotice } from "@/components/data-notice";
import { ContactMessageForm } from "@/components/contact-message-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ButtonLink, PageBanner } from "@/components/ui";
import { getRestaurantSettings } from "@/lib/restaurant-data";

export async function generateMetadata(): Promise<Metadata> {
    const { restaurant } = await getRestaurantSettings();
    const description = restaurant.address
        ? `Contact ${restaurant.name} and find the restaurant at ${restaurant.address}.`
        : `Contact ${restaurant.name} for restaurant and visit information.`;

    return {
        title: "Contact",
        description,
        alternates: { canonical: "/contact" },
        openGraph: {
            title: `Contact ${restaurant.name}`,
            description,
            url: "/contact",
        },
    };
}

export default async function ContactPage() {
    const settings = await getRestaurantSettings();
    const { restaurant } = settings;

    return (
        <div className="public-mobile-shell min-h-screen bg-[#f7faff] text-[#09294d]">
            <SiteHeader restaurant={restaurant} />

            <PageBanner eyebrow={restaurant.name} title="Contact Us" description="Restaurant contact details and visit information." coverImageUrl={restaurant.coverImageUrl} />

            <main className="mx-auto grid max-w-5xl gap-5 px-4 py-5 sm:gap-8 sm:px-8 sm:py-10 lg:grid-cols-[0.85fr_1.15fr] lg:px-10">
                <div className="lg:col-span-2"><DataNotice status={settings.status} subject="Restaurant information" /></div>
                <section>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0879be]">We’re here for you</p>
                    <h2 className="mt-1 text-2xl font-bold text-[#09294d] sm:mt-2 sm:text-3xl">Get in Touch</h2>
                    <p className="mt-1 max-w-md text-xs leading-5 text-[#617991] sm:mt-2 sm:text-sm sm:leading-6">Have a question or planning a visit? Reach out and we’ll be glad to help.</p>
                    <div className="mt-4 space-y-2 rounded-md border border-[#0e3b60] bg-[#06223d] p-3 sm:mt-5 sm:space-y-4 sm:border-0 sm:bg-transparent sm:p-0">
                        <div className="flex gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0a3657] text-[#19c4eb]"><MapPin className="h-4 w-4" /></span>
                            <div><h3 className="text-xs font-bold text-[#09294d]">Location</h3><p className="mt-0.5 text-xs text-[#617991]">{restaurant.address ?? "Address not provided"}</p></div>
                        </div>
                        <div className="flex gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0a3657] text-[#19c4eb]"><Phone className="h-4 w-4" /></span>
                            <div><h3 className="text-xs font-bold text-[#09294d]">Phone</h3>{restaurant.phone ? <a className="mt-0.5 block text-xs text-[#617991] hover:text-[#0759a8]" href={`tel:${restaurant.phone}`}>{restaurant.phone}</a> : <p className="mt-0.5 text-xs text-[#617991]">Phone not provided</p>}</div>
                        </div>
                        <div className="flex gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0a3657] text-[#19c4eb]"><Mail className="h-4 w-4" /></span>
                            <div><h3 className="text-xs font-bold text-[#09294d]">Email</h3>{restaurant.email ? <a className="mt-0.5 block break-all text-xs text-[#617991] hover:text-[#0759a8]" href={`mailto:${restaurant.email}`}>{restaurant.email}</a> : <p className="mt-0.5 text-xs text-[#617991]">Email not provided</p>}</div>
                        </div>
                        <div className="flex gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0a3657] text-[#19c4eb]"><Clock3 className="h-4 w-4" /></span>
                            <div><h3 className="text-xs font-bold text-[#09294d]">Opening Hours</h3><p className="mt-0.5 text-xs text-[#617991]">{restaurant.openingHours ?? "Hours not provided"}</p></div>
                        </div>
                    </div>
                    {restaurant.socialLinks.length ? (
                        <div className="mt-6">
                            <h3 className="text-xs font-bold text-[#09294d]">Social</h3>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#0759a8]">
                                {restaurant.socialLinks.map((item) => <a key={item.label} href={item.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{item.label}</a>)}
                            </div>
                        </div>
                    ) : null}
                </section>

                <ContactMessageForm email={restaurant.email} />

                <section aria-label="Location map and visit information" className="relative hidden min-h-72 overflow-hidden border border-[#d9e5ef] lg:block">
                    <div className="map-pattern absolute inset-0" />
                    <div className="absolute left-[58%] top-[38%] flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#087bc1] text-white shadow-lg ring-4 ring-white/70"><MapPin className="h-5 w-5" /></div>
                    <div className="absolute inset-x-0 bottom-0 bg-[#07315a] px-5 py-4 text-white sm:inset-x-auto sm:bottom-4 sm:left-4 sm:max-w-sm">
                        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#62d8f4]">Visit our location</p>
                        <h3 className="display-heading mt-1 text-xl font-bold">A seat is waiting.</h3>
                        <p className="mt-1 text-xs leading-5 text-white/75">{restaurant.address ?? "Location details have not been published yet."}</p>
                        <ButtonLink href="/menu" className="mt-3 gap-2">Explore Menu <ArrowRight className="h-3.5 w-3.5" /></ButtonLink>
                    </div>
                </section>
            </main>

            <SiteFooter restaurant={restaurant} />
        </div>
    );
}
