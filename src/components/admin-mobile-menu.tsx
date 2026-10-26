"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardList, Headset, LayoutDashboard, Menu, MessageSquareText, QrCode, Settings2, Tags, Utensils, Users, X } from "lucide-react";
import type { AdminRole } from "@/lib/admin-auth";
import { AdminTableVisitRequestBadge, useAdminTableVisitNotifications } from "@/components/admin-table-visit-notifications";

const ADMIN_LINKS = [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/orders", label: "Orders", icon: ClipboardList },
    { href: "/admin/table-visits", label: "Table Visits & Support", icon: Headset },
    { href: "/admin/customers", label: "Customers", icon: Users },
    { href: "/admin/reviews", label: "Reviews", icon: MessageSquareText },
    { href: "/admin/menu-items", label: "Menu Items", icon: Utensils },
    { href: "/admin/categories", label: "Categories", icon: Tags },
    { href: "/admin/settings", label: "Restaurant Settings", icon: Settings2 },
    { href: "/admin/tables", label: "Tables & QR Codes", icon: QrCode },
    { href: "/admin/staff", label: "Staff & Access", icon: Users },
    { href: "/turf/manage", label: "Turf Bookings", icon: CalendarDays },
] as const;

export function AdminMobileMenu({
    restaurantName,
    adminName,
    adminEmail,
    avatarUrl,
    role,
}: {
    restaurantName: string;
    adminName: string;
    adminEmail: string | null;
    avatarUrl: string | null;
    role: AdminRole;
}) {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const { count, refreshFailed } = useAdminTableVisitNotifications();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const links = ADMIN_LINKS.filter(({ href }) =>
        role !== "order_management" || !["/admin", "/admin/customers", "/admin/reviews", "/admin/menu-items", "/admin/categories", "/admin/settings", "/admin/tables"].includes(href),
    ).filter(({ href }) =>
        href !== "/admin/staff" || role === "owner" || role === "full_admin",
    );

    useEffect(() => {
        if (!open) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        closeRef.current?.focus();
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setOpen(false);
                triggerRef.current?.focus();
            }
        }
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [open]);

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                aria-label="Open admin navigation"
                aria-expanded={open}
                aria-controls="admin-mobile-drawer"
                onClick={() => setOpen(true)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#c0d1df] hover:bg-[#0b2e50] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff] lg:hidden"
            >
                <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            {open ? (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <button
                        type="button"
                        aria-label="Close admin navigation"
                        onClick={() => {
                            setOpen(false);
                            triggerRef.current?.focus();
                        }}
                        className="absolute inset-0 h-full w-full bg-[#020d19]/70 backdrop-blur-[2px]"
                    />
                    <aside
                        id="admin-mobile-drawer"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Admin navigation"
                        className="absolute inset-y-0 left-0 flex w-[min(86vw,320px)] flex-col border-r border-[#1a4465] bg-[#031a31] text-white shadow-2xl"
                    >
                        <header className="flex min-h-[76px] items-center justify-between gap-3 border-b border-[#143958] px-4">
                            <div className="flex min-w-0 items-center gap-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#078cf0] text-white"><Utensils className="h-4 w-4" aria-hidden="true" /></span>
                                <span className="min-w-0"><span className="block truncate text-sm font-bold">{restaurantName}</span><span className="block text-[10px] text-[#91a9c2]">Restaurant Admin</span></span>
                            </div>
                            <button ref={closeRef} type="button" aria-label="Close admin navigation" onClick={() => { setOpen(false); triggerRef.current?.focus(); }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#a7bfd4] hover:bg-[#0b2e50] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff]">
                                <X className="h-5 w-5" aria-hidden="true" />
                            </button>
                        </header>
                        <nav aria-label="Admin navigation links" className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
                            {links.map(({ href, label, icon: Icon }) => {
                                const active = pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
                                return <Link key={href} href={href} aria-current={active ? "page" : undefined} aria-label={href === "/admin/table-visits" ? `${label}: ${count === null ? (refreshFailed ? "request count unavailable" : "loading request count") : `${count} pending ${count === 1 ? "request" : "requests"}`}${refreshFailed ? "; count may be out of date" : ""}` : undefined} onClick={() => setOpen(false)} className={`flex min-h-12 items-center gap-3 rounded-md px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff] ${active ? "bg-[#078cf0] font-semibold text-white shadow-[0_2px_8px_rgba(7,149,245,0.18)]" : "font-medium text-[#a7bfd4] hover:bg-[#092746] hover:text-white"}`}><Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" /><span>{label}</span>{href === "/admin/table-visits" ? <AdminTableVisitRequestBadge count={count} /> : null}</Link>;
                            })}
                        </nav>
                        <footer className="border-t border-[#143958] px-4 py-4">
                            <div className="flex min-w-0 items-center gap-3">
                                {avatarUrl ? <Image src={avatarUrl} alt="" width={36} height={36} unoptimized className="h-9 w-9 rounded-full object-cover" /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#15517d] text-xs font-bold text-white">{adminName.slice(0, 1).toUpperCase()}</span>}
                                <span className="min-w-0"><span className="block truncate text-xs font-semibold">{adminName}</span><span className="block truncate text-[10px] text-[#91a9c2]">{adminEmail || "Administrator"}</span></span>
                            </div>
                        </footer>
                    </aside>
                </div>
            ) : null}
        </>
    );
}
