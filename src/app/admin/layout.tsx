import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Bell, LogOut, Utensils } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { adminSignOutAction } from "@/app/admin/actions";
import { AdminMobileMenu } from "@/components/admin-mobile-menu";
import { AdminShellLoading } from "@/components/admin-loading";
import { AdminNavigation } from "@/components/admin-navigation";
import { AdminTableVisitNotificationProvider } from "@/components/admin-table-visit-notifications";
import { getAdminAccess } from "@/lib/admin-auth";
import { getAdminTableVisitRequestCount } from "@/lib/table-visit-admin";
import { customerIdentityFromUser } from "@/lib/supabase/identity";
import { getRestaurantSettings } from "@/lib/restaurant-data";

export const metadata: Metadata = {
    robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
    return (
        <Suspense fallback={<AdminShellLoading />}>
            <AdminLayoutContent>{children}</AdminLayoutContent>
        </Suspense>
    );
}

async function AdminLayoutContent({ children }: { children: ReactNode }) {
    const access = await getAdminAccess();
    if (access.kind === "unauthenticated") redirect("/login?next=%2Fadmin");
    if (access.kind === "forbidden") redirect("/");

    const [settings, initialRequestCount] = await Promise.all([
        getRestaurantSettings(),
        access.kind === "authorized" ? getAdminTableVisitRequestCount() : Promise.resolve(null),
    ]);
    const { restaurant } = settings;
    const adminIdentity = customerIdentityFromUser(access.user);
    const adminName = adminIdentity.displayName || adminIdentity.email || "Administrator";

    return (
        <div className="admin-shell min-h-screen bg-[#061d36] text-[#f5f9ff] lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
            <AdminTableVisitNotificationProvider enabled={access.kind === "authorized"} initialResult={initialRequestCount}>
            <aside className="hidden border-b border-[#143958] bg-[#031a31] text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:min-h-screen lg:flex-col lg:border-b-0 lg:border-r lg:border-[#143958]">
                <Link href="/admin" className="flex min-h-[76px] items-center gap-3 border-b border-[#143958] px-5 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#36adff]">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#078cf0] text-white">
                        <Utensils className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                        <span className="block truncate text-[13px] font-bold leading-5">{restaurant.name}</span>
                        <span className="block truncate text-[10px] font-medium leading-4 text-[#91a9c2]">Restaurant Admin</span>
                    </span>
                </Link>

                {access.kind === "unavailable" ? (
                    <div className="mx-3 my-4 border border-[#245477] bg-[#092746] p-3 text-[11px] leading-5 text-[#d5e5f4] lg:mt-6">
                        <h1 className="font-bold text-white">Staff access could not be verified</h1>
                        <p className="mt-2">Administrative access is unavailable. Contact the restaurant Owner or try again later.</p>
                    </div>
                ) : (
                    <>
                        <AdminNavigation role={access.role} />
                        <div className="hidden flex-1 lg:block" />
                        <div className="hidden border-t border-[#123552] px-4 py-4 lg:block">
                            <div className="flex min-w-0 items-center gap-2">
                                {adminIdentity.avatarUrl ? <Image src={adminIdentity.avatarUrl} alt="" width={32} height={32} unoptimized className="h-8 w-8 rounded-full object-cover" /> : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#15517d] text-[11px] font-bold text-white">{adminName.slice(0, 1).toUpperCase()}</span>}
                                <span className="min-w-0"><span className="block truncate text-[11px] font-semibold text-white">{adminName}</span><span className="block truncate text-[10px] text-[#91a9c2]">{adminIdentity.email || "Administrator"}</span></span>
                            </div>
                            <form action={adminSignOutAction} className="mt-2">
                                <button type="submit" className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[#91a9c2] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff]"><LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Sign Out</button>
                            </form>
                        </div>
                    </>
                )}
            </aside>

            <div className="admin-content min-w-0 bg-[#061d36] pt-14 pb-24 lg:pt-16 lg:pb-0">
                <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-[#103253] bg-[#041b33] px-4 sm:px-6 lg:left-[232px] lg:right-0 lg:h-16 lg:justify-end lg:bg-[#061d36] lg:px-8">
                    <Link href="/admin" className="flex min-w-0 items-center gap-2.5 lg:hidden">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#078cf0] text-white"><Utensils className="h-4 w-4" aria-hidden="true" /></span>
                        <span className="min-w-0"><span className="block truncate text-xs font-bold leading-4 text-white">{restaurant.name}</span><span className="block text-[9px] leading-3 text-[#91a9c2]">Restaurant Admin</span></span>
                    </Link>
                    <div className="flex shrink-0 items-center gap-1.5">
                        {access.kind === "authorized" ? <AdminMobileMenu restaurantName={restaurant.name} adminName={adminName} adminEmail={adminIdentity.email} avatarUrl={adminIdentity.avatarUrl} role={access.role} /> : null}
                        <Link href="/admin/orders" aria-label="View orders and notifications" title="Orders and notifications" className="relative flex h-9 w-9 items-center justify-center rounded-md text-[#91a9c2] hover:bg-[#0b2e50] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff]"><Bell className="h-4 w-4" aria-hidden="true" /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#0795f5]" aria-hidden="true" /></Link>
                        <div className="hidden min-w-0 items-center gap-2 lg:flex">
                            {adminIdentity.avatarUrl ? <Image src={adminIdentity.avatarUrl} alt="" width={30} height={30} unoptimized className="h-7 w-7 rounded-full object-cover" /> : <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#15517d] text-[10px] font-bold text-white">{adminName.slice(0, 1).toUpperCase()}</span>}
                            <span className="max-w-48 truncate text-[11px] font-semibold text-white">{adminName}</span>
                        </div>
                        <form action={adminSignOutAction} className="lg:hidden">
                            <button type="submit" aria-label="Sign out" title="Sign out" className="flex h-9 w-9 items-center justify-center rounded-md text-[#91a9c2] hover:bg-[#0b2e50] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff]"><LogOut className="h-4 w-4" aria-hidden="true" /></button>
                        </form>
                    </div>
                </header>
                {access.kind === "authorized" ? children : (
                    <main className="mx-auto max-w-3xl px-4 py-8 text-[#f5f9ff] sm:px-7 lg:px-9">
                        <p className="border-l-4 border-[#00a6d8] bg-white p-5 text-sm leading-6 text-[#37566f]">
                            Staff membership could not be verified. Access remains blocked until the database is available and your active membership can be checked.
                        </p>
                    </main>
                )}
            </div>
            </AdminTableVisitNotificationProvider>
        </div>
    );
}