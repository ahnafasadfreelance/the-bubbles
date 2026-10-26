export default function AdminOrdersLoading() {
    return (
        <main aria-label="Loading orders" aria-busy="true" className="mx-auto max-w-375 space-y-3 px-3 py-4 sm:px-5 lg:px-7">
            <div className="h-12 animate-pulse border-b border-[#163b5a] bg-[#0b2e50]" />
            <div className="flex gap-2 overflow-hidden">{Array.from({ length: 7 }, (_, index) => <div key={index} className="h-8 w-24 shrink-0 animate-pulse rounded bg-[#0b2e50]" />)}</div>
            <div className="space-y-2">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-md border border-[#16466d] bg-white" />)}</div>
        </main>
    );
}
