export default function AdminReviewsLoading() {
    return (
        <main aria-label="Loading customer reviews" aria-busy="true" className="mx-auto max-w-375 space-y-5 px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
            <div className="h-16 animate-pulse border-b border-[#163b5a] bg-[#0b2e50]" />
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl border border-[#16466d] bg-[#092746]" />)}
            </div>
            <div className="h-52 animate-pulse rounded-xl border border-[#16466d] bg-[#092746]" />
            <div className="h-24 animate-pulse rounded-xl border border-[#16466d] bg-[#092746]" />
            <div className="space-y-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-xl border border-[#16466d] bg-[#092746]" />)}</div>
        </main>
    );
}
