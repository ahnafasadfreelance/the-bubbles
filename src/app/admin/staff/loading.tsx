export default function StaffLoading() {
    return (
        <main aria-label="Loading staff access" aria-busy="true" className="mx-auto max-w-375 space-y-4 px-3 py-4 sm:px-5 sm:py-5 lg:px-8">
            <div className="h-12 animate-pulse rounded-md bg-[#0b2e50]" />
            <div className="h-64 animate-pulse rounded-xl border border-[#143958] bg-[#041b33]" />
        </main>
    );
}
