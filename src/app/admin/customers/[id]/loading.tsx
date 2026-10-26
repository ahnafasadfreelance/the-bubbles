export default function CustomerDetailsLoading() {
    return (
        <main aria-label="Loading customer details" aria-busy="true" className="mx-auto max-w-350 space-y-4 px-3 py-4 sm:px-5 lg:px-7">
            <div className="h-9 w-28 animate-pulse rounded bg-[#0b2e50]" />
            <div className="h-48 animate-pulse rounded-md border border-[#16466d] bg-white" />
            <div className="h-10 w-48 animate-pulse rounded bg-[#0b2e50]" />
            <div className="space-y-2">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-md border border-[#d7e2ec] bg-white" />)}</div>
        </main>
    );
}
