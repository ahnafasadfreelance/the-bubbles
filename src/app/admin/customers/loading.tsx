export default function CustomersLoading() {
    return (
        <main aria-label="Loading customers" aria-busy="true" className="mx-auto max-w-350 space-y-4 px-3 py-4 sm:px-5 lg:px-7">
            <div className="h-12 animate-pulse border-b border-[#163b5a] bg-[#0b2e50]" />
            <div className="h-16 animate-pulse rounded-md border border-[#16466d] bg-[#0b2e50]" />
            <div className="space-y-2 md:hidden">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-md border border-[#16466d] bg-[#0b2e50]" />)}</div>
            <div className="hidden h-80 animate-pulse rounded-md border border-[#16466d] bg-[#0b2e50] md:block" />
        </main>
    );
}
