import type { ReactNode } from "react";

type AdminPageSkeletonVariant =
    | "dashboard"
    | "table-visits"
    | "menu-items"
    | "categories"
    | "tables"
    | "table-detail";

function Skeleton({ className = "" }: { className?: string }) {
    return <div aria-hidden="true" className={`animate-pulse rounded-md bg-[#0b2e50] ${className}`} />;
}

function AdminPageSkeleton({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <main aria-label={label} aria-busy="true" className="mx-auto max-w-375 space-y-4 px-3 py-4 sm:px-5 sm:py-5 lg:px-8">
            {children}
        </main>
    );
}

export function AdminRouteLoading({ variant }: { variant: AdminPageSkeletonVariant }) {
    if (variant === "dashboard") {
        return (
            <AdminPageSkeleton label="Loading admin dashboard">
                <header className="space-y-2 border-b border-[#163b5a] pb-4">
                    <Skeleton className="h-7 w-40" />
                    <Skeleton className="h-4 w-72 max-w-full" />
                </header>
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                    {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28 rounded-xl border border-[#16466d] bg-[#092746]" />)}
                </div>
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
                    <Skeleton className="h-80 rounded-xl border border-[#16466d] bg-[#092746]" />
                    <Skeleton className="h-80 rounded-xl border border-[#16466d] bg-[#092746]" />
                </div>
            </AdminPageSkeleton>
        );
    }

    if (variant === "table-visits") {
        return (
            <AdminPageSkeleton label="Loading table visits and support">
                <header className="space-y-2 border-b border-[#163b5a] pb-4">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-7 w-64 max-w-full" />
                    <Skeleton className="h-4 w-96 max-w-full" />
                </header>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-52 rounded-xl border border-[#16466d] bg-[#092746]" />)}
                </div>
            </AdminPageSkeleton>
        );
    }

    if (variant === "menu-items" || variant === "categories") {
        return (
            <AdminPageSkeleton label={`Loading ${variant === "menu-items" ? "menu items" : "categories"}`}>
                <header className="space-y-2 border-b border-[#163b5a] pb-4">
                    <Skeleton className="h-7 w-48" />
                    <Skeleton className="h-4 w-72 max-w-full" />
                </header>
                <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
                    <Skeleton className="h-96 rounded-xl border border-[#16466d] bg-[#092746]" />
                    <Skeleton className="h-80 rounded-xl border border-[#16466d] bg-[#092746]" />
                </div>
            </AdminPageSkeleton>
        );
    }

    if (variant === "tables") {
        return (
            <AdminPageSkeleton label="Loading tables and QR codes">
                <header className="space-y-2 pb-1">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-7 w-56" />
                    <Skeleton className="h-4 w-80 max-w-full" />
                </header>
                <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(270px,0.8fr)]">
                    <Skeleton className="h-96 rounded-xl border border-[#16466d] bg-[#092746]" />
                    <Skeleton className="h-96 rounded-xl border border-[#16466d] bg-[#092746]" />
                </div>
            </AdminPageSkeleton>
        );
    }

    return (
        <AdminPageSkeleton label="Loading table QR code">
            <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#163b5a] pb-5">
                <div className="space-y-3">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-8 w-56" />
                </div>
                <Skeleton className="h-7 w-20" />
            </header>
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:justify-center sm:gap-8">
                <Skeleton className="h-80 w-80 max-w-full rounded-xl border border-[#16466d] bg-[#092746]" />
                <Skeleton className="h-40 w-full max-w-sm rounded-xl border border-[#16466d] bg-[#092746]" />
            </div>
        </AdminPageSkeleton>
    );
}

export function AdminShellLoading() {
    return (
        <div aria-label="Loading admin area" aria-busy="true" className="admin-shell min-h-screen bg-[#061d36] text-[#f5f9ff] lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
            <aside aria-hidden="true" className="hidden border-r border-[#143958] bg-[#031a31] lg:flex lg:min-h-screen lg:flex-col">
                <div className="flex min-h-[76px] items-center gap-3 border-b border-[#143958] px-5">
                    <Skeleton className="h-10 w-10 rounded-lg bg-[#15517d]" />
                    <div className="space-y-2"><Skeleton className="h-3 w-28" /><Skeleton className="h-2.5 w-20" /></div>
                </div>
                <div className="space-y-2 px-3 py-6">
                    {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-10 rounded-md" />)}
                </div>
            </aside>
            <div className="min-w-0 bg-[#061d36] pt-14 pb-24 lg:pt-16 lg:pb-0">
                <header aria-hidden="true" className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-[#103253] bg-[#041b33] px-4 sm:px-6 lg:left-[232px] lg:h-16 lg:px-8">
                    <Skeleton className="h-8 w-32 lg:hidden" />
                    <Skeleton className="h-8 w-36" />
                </header>
                <AdminRouteLoading variant="dashboard" />
            </div>
        </div>
    );
}
