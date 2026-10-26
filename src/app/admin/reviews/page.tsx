import Link from "next/link";
import type { Metadata } from "next";
import { Activity, MessageSquareText, Star } from "lucide-react";

import { getAdminReviews, type AdminReviewFilters } from "@/lib/admin-reviews";
import { requireAdminRole } from "@/lib/admin-auth";
import { formatPrice } from "@/lib/format-price";

export const metadata: Metadata = { title: "Customer Reviews" };

const PAGE_SIZE = 25;
type SearchParams = Record<string, string | string[] | undefined>;

function oneParam(value: string | string[] | undefined) {
    return typeof value === "string" ? value : "";
}

function parseFilters(params: SearchParams): AdminReviewFilters {
    const search = oneParam(params.search).trim().slice(0, 80);
    const ratingValue = oneParam(params.rating);
    const parsedRating = Number(ratingValue);
    const rating = Number.isInteger(parsedRating) && parsedRating >= 1 && parsedRating <= 5 ? parsedRating : null;
    const requestedSort = oneParam(params.sort);
    const sort: AdminReviewFilters["sort"] = requestedSort === "oldest"
        || requestedSort === "highest"
        || requestedSort === "lowest"
        ? requestedSort
        : "newest";
    const parsedPage = Number(oneParam(params.page));
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 4001) : 1;
    return { search, rating, sort, offset: (page - 1) * PAGE_SIZE };
}

function queryString(filters: AdminReviewFilters, page: number) {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.rating) params.set("rating", String(filters.rating));
    if (filters.sort !== "newest") params.set("sort", filters.sort);
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return query ? `/admin/reviews?${query}` : "/admin/reviews";
}

function ReviewStars({ rating }: { rating: number }) {
    return (
        <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
            {Array.from({ length: 5 }, (_, index) => (
                <Star key={index} className={`h-4 w-4 ${index < rating ? "fill-[#ffc15c] text-[#ffc15c]" : "text-[#49627a]"}`} aria-hidden="true" />
            ))}
            <span className="sr-only">{rating} out of 5 stars</span>
        </span>
    );
}

function MetricCard({
    label,
    value,
    detail,
    icon: Icon,
}: {
    label: string;
    value: string;
    detail: string;
    icon: typeof Star;
}) {
    return (
        <article className="review-metric-enter rounded-xl border border-[#16466d] bg-[#092746] p-4 transition-colors hover:border-[#23618b] sm:p-5">
            <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-[#a8bfd2]">{label}</p>
                <Icon className="h-4 w-4 shrink-0 text-[#48c5e5]" aria-hidden="true" />
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums text-white">{value}</p>
            <p className="mt-1 text-[11px] text-[#91a9c2]">{detail}</p>
        </article>
    );
}

export default async function AdminReviewsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    await requireAdminRole("owner", "full_admin");
    const filters = parseFilters(await searchParams);
    const result = await getAdminReviews(filters);
    const page = Math.floor(filters.offset / PAGE_SIZE) + 1;

    return (
        <main className="mx-auto max-w-375 space-y-5 px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
            <header className="border-b border-[#163b5a] pb-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#48b7ff]">Guest feedback</p>
                <h1 className="mt-1 text-xl font-semibold leading-6 text-[#f5f9ff]">Customer Reviews</h1>
                <p className="mt-1 text-xs text-[#91a9c2]">See what guests are saying about their Blue Table experience.</p>
            </header>

            {!result.ok ? (
                <section role="alert" className="rounded-xl border border-[#743b47] bg-[#331f35] p-5 text-sm text-[#ffd9df]">
                    <h2 className="font-bold">Reviews could not be loaded</h2>
                    <p className="mt-1 leading-6">
                        {result.reason === "unauthorized"
                            ? "Administrator access is required to view customer reviews."
                            : result.reason === "unconfigured"
                                ? "The server-side review database connection is not configured."
                                : "The review service is temporarily unavailable. Please try again."}
                    </p>
                    <Link href={queryString(filters, page)} className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-[#a95a68] px-3 font-semibold transition-colors hover:bg-[#482936] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff9cae]">
                        Retry
                    </Link>
                </section>
            ) : (
                <>
                    <section aria-label="Review summary" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                        <MetricCard
                            label="Average rating"
                            value={result.data.metrics.total_reviews ? result.data.metrics.average_rating.toFixed(1) : "—"}
                            detail={result.data.metrics.total_reviews ? "Out of 5 stars" : "No submitted ratings yet"}
                            icon={Star}
                        />
                        <MetricCard
                            label="Total reviews"
                            value={result.data.metrics.total_reviews.toLocaleString()}
                            detail="Submitted by customers"
                            icon={MessageSquareText}
                        />
                        <MetricCard
                            label="Five-star reviews"
                            value={`${result.data.metrics.total_reviews ? Math.round((result.data.metrics.five_star_reviews / result.data.metrics.total_reviews) * 100) : 0}%`}
                            detail={`${result.data.metrics.five_star_reviews.toLocaleString()} five-star ratings`}
                            icon={Star}
                        />
                        <MetricCard
                            label="Recent activity"
                            value={result.data.metrics.recent_reviews.toLocaleString()}
                            detail="Reviews in the last 30 days"
                            icon={Activity}
                        />
                    </section>

                    <section aria-labelledby="rating-distribution-title" className="rounded-xl border border-[#16466d] bg-[#092746] p-4 sm:p-5">
                        <div>
                            <h2 id="rating-distribution-title" className="text-sm font-bold text-white">Rating distribution</h2>
                            <p className="mt-1 text-[11px] text-[#91a9c2]">Share of all submitted reviews by star rating.</p>
                        </div>
                        <div className="mt-4 grid gap-2 sm:grid-cols-2 sm:gap-x-8">
                            {result.data.distribution.map((entry) => (
                                <div key={entry.rating} className="flex items-center gap-3">
                                    <span className="inline-flex w-12 shrink-0 items-center gap-1 text-xs font-semibold text-[#d8e5ef]" aria-label={`${entry.rating} stars`}>
                                        {entry.rating} <Star className="h-3.5 w-3.5 fill-[#ffc15c] text-[#ffc15c]" aria-hidden="true" />
                                    </span>
                                    <div
                                        className="h-2 flex-1 overflow-hidden rounded-full bg-[#193b58]"
                                        role="progressbar"
                                        aria-label={`${entry.rating}-star reviews`}
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        aria-valuenow={entry.percentage}
                                    >
                                        <div className="h-full rounded-full bg-[#e9ad4e] transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${entry.percentage}%` }} />
                                    </div>
                                    <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-[#a8bfd2]">{entry.count} · {entry.percentage}%</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section aria-labelledby="review-list-title" className="space-y-3">
                        <div className="flex flex-wrap items-end justify-between gap-3">
                            <div>
                                <h2 id="review-list-title" className="text-base font-semibold text-white">All reviews</h2>
                                <p className="mt-1 text-[11px] text-[#91a9c2]">
                                    {result.data.total_filtered.toLocaleString()} {result.data.total_filtered === 1 ? "result" : "results"}
                                    {filters.search || filters.rating ? " matching your filters" : ""}
                                </p>
                            </div>
                        </div>

                        <form action="/admin/reviews" method="get" className="grid gap-2 rounded-xl border border-[#16466d] bg-[#092746] p-3 md:grid-cols-[minmax(180px,1fr)_130px_145px_auto_auto] md:items-end">
                            <label className="block text-[11px] font-semibold text-[#b4c6d9]">
                                Search order or customer
                                <input
                                    type="search"
                                    name="search"
                                    defaultValue={filters.search}
                                    maxLength={80}
                                    placeholder="Order reference or customer ID"
                                    className="mt-1.5 min-h-10 w-full rounded-lg border border-[#31536e] bg-[#041b33] px-3 text-xs text-white placeholder:text-[#8299ad] focus:border-[#36adff] focus:outline-none focus:ring-2 focus:ring-[#36adff]/25"
                                />
                            </label>
                            <label className="block text-[11px] font-semibold text-[#b4c6d9]">
                                Rating
                                <select name="rating" defaultValue={filters.rating ?? ""} className="mt-1.5 min-h-10 w-full rounded-lg border border-[#31536e] bg-[#041b33] px-3 text-xs text-white focus:border-[#36adff] focus:outline-none focus:ring-2 focus:ring-[#36adff]/25">
                                    <option value="">All ratings</option>
                                    {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} {rating === 1 ? "star" : "stars"}</option>)}
                                </select>
                            </label>
                            <label className="block text-[11px] font-semibold text-[#b4c6d9]">
                                Sort by
                                <select name="sort" defaultValue={filters.sort} className="mt-1.5 min-h-10 w-full rounded-lg border border-[#31536e] bg-[#041b33] px-3 text-xs text-white focus:border-[#36adff] focus:outline-none focus:ring-2 focus:ring-[#36adff]/25">
                                    <option value="newest">Newest first</option>
                                    <option value="oldest">Oldest first</option>
                                    <option value="highest">Highest rated</option>
                                    <option value="lowest">Lowest rated</option>
                                </select>
                            </label>
                            <button type="submit" className="min-h-10 rounded-lg bg-[#087fc7] px-4 text-xs font-bold text-white transition-colors hover:bg-[#0995df] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#70dfff]">
                                Apply
                            </button>
                            {filters.search || filters.rating || filters.sort !== "newest"
                                ? <Link href="/admin/reviews" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#31536e] px-3 text-xs font-semibold text-[#c2d5e5] transition-colors hover:bg-[#0b3558] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff]">Clear filters</Link>
                                : <span aria-hidden="true" className="hidden md:block" />}
                        </form>

                        {result.data.reviews.length ? (
                            <div className="space-y-2.5">
                                {result.data.reviews.map((review) => (
                                    <article key={review.id} className="rounded-xl border border-[#16466d] bg-[#082541] p-4 transition-colors hover:border-[#23618b] sm:p-5">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <ReviewStars rating={review.rating} />
                                                    <span className="text-xs font-bold text-white">{review.customer_name}</span>
                                                </div>
                                                <p className="mt-1 break-all text-[10px] text-[#91a9c2]">Customer ID · {review.customer_id}</p>
                                            </div>
                                            <time dateTime={review.created_at} className="shrink-0 text-[11px] text-[#a8bfd2]">
                                                {new Date(review.created_at).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}
                                            </time>
                                        </div>
                                        <p className={`mt-3 max-w-4xl whitespace-pre-wrap break-words text-sm leading-6 ${review.comment ? "text-[#d5e3ee]" : "italic text-[#91a9c2]"}`}>
                                            {review.comment || "Rating only"}
                                        </p>
                                        <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-[#173c59] pt-3 text-[10px] text-[#91a9c2]">
                                            <div className="flex gap-1.5"><dt>Order</dt><dd className="font-semibold text-[#b4dcf5]">#{review.order_number}</dd></div>
                                            <div className="flex gap-1.5"><dt>Table</dt><dd className="font-semibold text-[#d5e3ee]">{review.table_name || `Table ${review.table_number}`}</dd></div>
                                            <div className="flex gap-1.5"><dt>Order total</dt><dd className="font-semibold text-[#d5e3ee]">{formatPrice(review.order_total, review.currency)}</dd></div>
                                        </dl>
                                    </article>
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-xl border border-dashed border-[#31536e] bg-[#082541] px-5 py-10 text-center">
                                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#0b3558] text-[#48c5e5]"><MessageSquareText className="h-5 w-5" aria-hidden="true" /></span>
                                <h3 className="mt-3 text-sm font-bold text-white">{result.data.metrics.total_reviews === 0 ? "No reviews yet" : "No reviews match these filters"}</h3>
                                <p className="mt-1 text-xs leading-5 text-[#91a9c2]">
                                    {result.data.metrics.total_reviews === 0
                                        ? "Customer reviews will appear here after guests submit feedback for completed orders."
                                        : "Try changing your search or rating filter."}
                                </p>
                                {result.data.metrics.total_reviews > 0 && (filters.search || filters.rating || filters.sort !== "newest")
                                    ? <Link href="/admin/reviews" className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-[#31536e] px-3 text-xs font-semibold text-[#b4dcf5] hover:bg-[#0b3558] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff]">Clear filters</Link>
                                    : null}
                            </div>
                        )}

                        {result.data.total_filtered > PAGE_SIZE ? (
                            <nav aria-label="Review pages" className="flex items-center justify-between gap-3 rounded-xl border border-[#16466d] bg-[#092746] px-3 py-2">
                                <p className="text-[11px] text-[#a8bfd2]">Page {page} of {Math.ceil(result.data.total_filtered / PAGE_SIZE)}</p>
                                <div className="flex gap-2">
                                    {page > 1 ? <Link rel="prev" href={queryString(filters, page - 1)} className="inline-flex min-h-10 items-center rounded-lg border border-[#31536e] px-3 text-xs font-semibold text-[#d5e3ee] hover:bg-[#0b3558] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff]">Previous</Link> : null}
                                    {page < Math.ceil(result.data.total_filtered / PAGE_SIZE) && filters.offset < 100000 ? <Link rel="next" href={queryString(filters, page + 1)} className="inline-flex min-h-10 items-center rounded-lg border border-[#31536e] px-3 text-xs font-semibold text-[#d5e3ee] hover:bg-[#0b3558] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36adff]">Next</Link> : null}
                                </div>
                            </nav>
                        ) : null}
                    </section>
                </>
            )}
        </main>
    );
}
