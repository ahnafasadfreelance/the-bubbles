"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardList, Headset, LayoutDashboard, MessageSquareText, QrCode, Settings2, Tags, Utensils, Users } from "lucide-react";
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

const RESTRICTED_LINKS = new Set(["/admin", "/admin/customers", "/admin/reviews", "/admin/menu-items", "/admin/categories", "/admin/settings", "/admin/tables"]);

export function AdminNavigation({ role }: { role: AdminRole }) {
    const pathname = usePathname();
    const { count, refreshFailed } = useAdminTableVisitNotifications();
    const activeLink = (href: string) => pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
    const links = ADMIN_LINKS.filter(({ href }) =>
        role !== "order_management" || !RESTRICTED_LINKS.has(href),
    ).filter(({ href }) =>
        role === "owner" || href !== "/admin/staff" || role === "full_admin",
    );

    return (
        <nav aria-label="Admin navigation" className="hidden flex-col gap-1 px-3 py-6 lg:flex">
            {links.map(({ href, label, icon: Icon }) => {
                const active = activeLink(href);
                return (
                    <Link
                        key={href}
                        href={href}
                        aria-current={active ? "page" : undefined}
                        aria-label={href === "/admin/table-visits" ? `${label}: ${count === null ? (refreshFailed ? "request count unavailable" : "loading request count") : `${count} pending ${count === 1 ? "request" : "requests"}`}${refreshFailed ? "; count may be out of date" : ""}` : undefined}
                        className={`flex min-h-10 items-center gap-3 rounded-md px-3 text-left text-[13px] leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff] ${active ? "bg-[#078cf0] font-semibold text-white shadow-[0_2px_8px_rgba(7,149,245,0.18)]" : "font-medium text-[#a7bfd4] hover:bg-[#092746] hover:text-white"}`}
                    >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> <span className="truncate">{label}</span>
                        {href === "/admin/table-visits" ? <AdminTableVisitRequestBadge count={count} /> : null}
                    </Link>
                );
            })}
        </nav>
    );
}