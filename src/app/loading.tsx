export default function Loading() {
    return (
        <main className="min-h-screen bg-[#f7faff] text-[#09294d]" aria-label="Loading restaurant page">
            <div className="h-17 animate-pulse bg-[#041d37]" />
            <div className="h-56 animate-pulse bg-[#0b3c66] sm:h-64" />
            <div className="mx-auto max-w-7xl space-y-5 px-5 py-10 sm:px-8 lg:px-10">
                <div className="h-5 w-36 animate-pulse bg-[#dce8f0]" />
                <div className="h-9 w-64 max-w-full animate-pulse bg-[#dce8f0]" />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }, (_, index) => (
                        <div key={index} className="overflow-hidden border border-[#d9e5ef] bg-white">
                            <div className="aspect-[1.2] animate-pulse bg-[#e5eff5]" />
                            <div className="space-y-3 p-4">
                                <div className="h-4 w-2/3 animate-pulse bg-[#e5eff5]" />
                                <div className="h-3 w-full animate-pulse bg-[#eef4f7]" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </main>
    );
}