export default function AdminSettingsLoading() {
    return (
        <main aria-label="Loading restaurant settings" aria-busy="true" className="mx-auto max-w-300 space-y-3 px-3 py-4 sm:px-5 lg:px-7">
            <div className="h-12 animate-pulse border-b border-[#163b5a] bg-[#0b2e50]" />
            <div className="grid gap-3 lg:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-72 animate-pulse rounded-md border border-[#16466d] bg-white" />)}</div>
        </main>
    );
}
