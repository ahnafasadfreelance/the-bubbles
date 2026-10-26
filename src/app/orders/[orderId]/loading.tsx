export default function OrderLoading() {
    return (
        <main className="min-h-screen bg-[#020b16] px-4 py-8 text-[#f5faff] sm:py-12">
            <section aria-label="Loading order details" className="mx-auto w-full max-w-5xl">
                <p className="sr-only" role="status">Loading your order details…</p>
                <div aria-hidden="true" className="animate-pulse space-y-5">
                    <div className="h-48 rounded-3xl border border-[#17435a] bg-[#071827]" />
                    <div className="rounded-3xl border border-[#17435a] bg-[#071827] p-6">
                        <div className="h-5 w-40 rounded bg-[#123247]" />
                        <div className="mt-8 grid gap-5 sm:grid-cols-5">
                            {Array.from({ length: 5 }, (_, index) => (
                                <div key={index} className="flex items-center gap-3 sm:flex-col">
                                    <div className="h-9 w-9 rounded-full bg-[#123247]" />
                                    <div className="h-3 w-20 rounded bg-[#123247]" />
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="grid gap-5 lg:grid-cols-2">
                        <div className="h-72 rounded-3xl border border-[#17435a] bg-[#071827]" />
                        <div className="h-72 rounded-3xl border border-[#17435a] bg-[#071827]" />
                    </div>
                </div>
            </section>
        </main>
    );
}
