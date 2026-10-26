# Application Performance Audit

Audit and implementation record: 2026-10-16

## Scope and architecture

The project is a Next.js 16.3.6 App Router application using React 19, TypeScript, Tailwind CSS, Supabase SSR/client libraries, and the Next.js production image optimizer. Pages and layouts are Server Components by default; interactive cart, menu, tracking, admin, and support features use Client Components. The root layout loads restaurant settings and the current customer, and the proxy refreshes Supabase auth state. All routes in the production build are request-rendered, consistent with their cookie- and operational-data dependencies.

### Route inventory

| Area | Routes and route files |
|---|---|
| Shared | `/` (`src/app/page.tsx`), root layout and global loading UI (`src/app/layout.tsx`, `src/app/loading.tsx`) |
| Customer information | `/about`, `/contact` |
| Menu | `/menu`, `/menu/[slug]` |
| Cart and ordering | `/cart`, `/table/[token]` (QR validation and redirect), `/table-unavailable` |
| Customer identity and orders | `/login`, `/auth/callback`, `/my-orders`, `/orders/[orderId]` (including loading and not-found UI) |
| Admin API | `/api/admin/assets` |
| Admin application | `/admin`, `/admin/orders`, `/admin/categories`, `/admin/menu-items`, `/admin/customers`, `/admin/customers/[id]`, `/admin/reviews`, `/admin/settings`, `/admin/staff`, `/admin/table-visits`, `/admin/tables`, `/admin/tables/[tableId]` |
| Admin loading UI | Loading boundaries exist for orders, reviews, settings, staff, customers, and customer details. |

Server actions for cart/order reviews and table support are defined in `src/app/cart/actions.ts`, `src/app/orders/review-actions.ts`, and `src/app/table-visit/actions.ts`; these action modules do not add URL routes.

### Data, assets, and behavior reviewed

- Public restaurant settings and menu queries select explicit columns. The menu fetch reads active categories and available items, and React `cache()` deduplicates settings/catalog reads within a render.
- Customer order reads select explicit order/item columns and filter order history by customer ID. Order tracking subscribes to the current order, removes its Realtime channel on cleanup, and has a fallback refresh.
- Admin reads use server-only privileged access, role checks, paginated order/menu/review data, and database RPCs for dashboard, payment, and review aggregates. Admin order updates also reconcile through Realtime and polling.
- QR sessions, table context, customer ownership checks, payment and status transitions remain on their existing server-side paths. No cache is introduced for this operational data.
- The cart's existing browser persistence remains unchanged. No order, payment, or staff data was moved into browser storage.
- Restaurant images already used Next Image for recognized Supabase asset paths. Other hosts used plain `<img>`. Seed menu images use `images.unsplash.com`.
- Geist and Geist Mono are self-hosted by `next/font`. Mono styles are used on admin, tracking, and support surfaces. CSS animation and `motion-safe` behavior were left unchanged.
- No service worker was found. Public data reads were not moved to a cross-request cache. No database migration or index was added; live query plans and the deployed schema were not available for inspection.

## Baseline

The baseline was taken before application edits with `npm run build`, followed by `npm start` and the integrated browser on the local production server. The mobile sample used a 390 x 844 viewport. These are local lab observations, not field data; browser cache state and remote Supabase/image service latency varied between navigations.

| Route/sample | TTFB | FCP | Requests | Encoded resource bytes | Image bytes | Unique JS bytes |
|---|---:|---:|---:|---:|---:|---:|
| `/` mobile baseline | 45 ms | 936 ms | 41 | 976,079 | 623,609 across 11 image resources | 225,131 |
| `/menu` mobile baseline | 32 ms | 692 ms | 39 | 740,154 | — | 229,595 |
| `/cart` initial production sample | 27 ms | — | 28 | 316,373 | — | — |

The browser did not retain a baseline LCP entry, and INP was not available from this lab run. CLS readings from `getEntriesByType("layout-shift")` are not reliable in this browser; no CLS result is claimed. No Lighthouse installation, throttled network profile, production monitoring, or representative admin/customer credentials were available.

## Prioritized findings and disposition

| Priority | Finding and evidence | Risk / effort | Disposition |
|---|---|---|---|
| High | Seeded Unsplash photos bypassed responsive image optimization. The mobile homepage loaded 623,609 image bytes over 11 image resources; individual source images were commonly around 75–141 KB. | Low–medium / small. Restricting optimization to a known host and photo path limits remote-source risk; responsive variants can reduce bytes without changing layout or crop behavior. | Added a strict `images.unsplash.com/photo-*` remote pattern and routed matching HTTPS images through the existing Next Image component. Unrecognized hosts retain the existing `<img>` fallback. |
| High | Both owner/full-admin and order-management dashboard loaders fetched status counts only after their dashboard RPC returned, adding a sequential database round trip. The status-count result is independent of dashboard filters. | Low / small. Read-only RPCs are parallelized; result validation remains required. | Run status counts concurrently with the relevant dashboard RPCs (and payment overview where applicable). This removes one serial wait; runtime gain is estimated, not measured against an authenticated database. |
| Medium | Admin layout, page, and data helpers can request the same staff membership more than once during a single server render. `getCurrentUser()` was already request-cached, but the membership lookup was not. | Low / small. Request-scoped role snapshot only; caching across requests would be unsafe. | Wrapped `getAdminAccess()` in React `cache()`. It does not persist across requests or users. |
| Medium | The floating cart received full menu item descriptions, image URLs, and other fields although it only needs item ID and prices. This duplicated menu data into a client boundary, notably on dish details. | Low / small. The same pricing fields and fallback calculations are retained. | Pass only `id`, `price`, and `discount_price`; memoize the client-side lookup map. |
| Low | Geist Mono was preloaded on pages where no monospaced text was rendered. The homepage emitted a preload warning and downloaded the unused font. | Low / small. Pages using `font-mono` still resolve the configured font on demand; visual font definitions remain unchanged. | Set `preload: false` only for Geist Mono. The homepage now emits one font preload instead of two. |

### Findings reviewed but not changed

- All pages are dynamic. Their Supabase auth, table/session, order, and admin authorization requirements make broad static or cross-user caching inappropriate. No persistent cache was added.
- Public menu fetching has a category-to-item dependency; changing the query shape without schema/RLS verification could fetch unavailable-category items or change visibility. It was left intact.
- Customer and admin Realtime/polling paths are operationally important. Existing order-specific cleanup/fallbacks and admin reconciliation were preserved rather than suppressed.
- Query/index recommendations require deployed schema and query plans. The repository did not provide a live query-plan view, so no speculative indexes were created.
- The remaining primary Geist preload warning was not suppressed because Geist is the site body font. Page transitions in the browser harness also abort speculative RSC prefetches when the harness immediately navigates away; these cancellations were not server/page failures.

## Changes and measured results

After the changes, the production build was served again and sampled on the same local browser. The final mobile homepage sample was warm; separate cold/first-hit samples were slower, so the FCP/TTFB samples should not be read as a guaranteed production improvement.

| Measurement | Baseline | Final sample | Interpretation |
|---|---:|---:|---|
| Homepage image bytes, mobile | 623,609 bytes / 11 resources | 94,546 bytes / 10 resources; all 10 used the optimizer | About 84.8% fewer image bytes in the sampled runs. Resource counts differ slightly due to lazy loading and timing. No broken images were observed. |
| Homepage unique JavaScript bytes, mobile | 225,131 bytes | 225,179 bytes across 10 unique script files | Essentially unchanged (+48 bytes); this work did not claim a JS bundle reduction. |
| Homepage FCP / TTFB, mobile | 936 ms / 45 ms | 708 ms / 27 ms in a warmed final sample | Improvement in this sample only. Other cold samples were slower (FCP 1,488 ms), so no causal or field-performance claim is made. |
| Homepage LCP | Not captured at baseline | 708 ms in the final buffered-observer sample | No before/after LCP comparison is possible. |
| Menu detail HTML response (`/menu/stack-beef-burger`) | 13,020 bytes before narrowing the cart props | 12,427 bytes after | 593 bytes (about 4.6%) smaller in this local sample. |
| Font preload count, homepage | 2 | 1 | Mono is no longer preloaded on pages that do not use it; the primary Geist font remains. |
| Admin dashboard / RPC latency | Not measured | Not measured | Code removes one serial RPC wait per dashboard loader; expected gain is one status-count RPC latency, but credentials/production data were unavailable. |

Desktop smoke testing at 1440 x 900 loaded the homepage without broken images; its warmed FCP sample was 588 ms. It is not compared with the mobile baseline. The browser could not supply a meaningful INP or throttled-network result.

## Regression checks and limitations

- Baseline and final `npm run build`: passed. The route inventory in the build output remained intact and request-rendered.
- Final `npm test`: passed, 4 tests. Existing Node experimental/type-module warnings remain.
- Final `npm run lint`: passed.
- Final `npm run typecheck`: passed.
- Final `git diff --check`: passed.
- Production browser smoke tests loaded `/`, `/menu`, a real menu detail, `/about`, `/contact`, `/cart`, `/login`, and `/table-unavailable`. Menu search for “burger” still showed the expected dish.
- Unauthenticated `/my-orders`, `/orders/[orderId]`, and `/admin` redirected to login. An invalid QR token redirected to `/table-unavailable`. These checks do not validate authenticated workflows.
- The browser saw no broken images. Sequential navigation generated expected `ERR_ABORTED` events for in-flight Next RSC prefetches. The browser also reported a remaining preload warning for the primary Geist font; no app error or hydration failure was observed in the tested pages.
- Customer sign-in, valid QR issuance/expiry, cart submission, order ownership, live authenticated tracking, cancellation, support submission, reviews, admin CRUD, permissions, payment collection, and admin Realtime behavior still require credentialed/manual regression testing.
- Production Supabase latency, database query counts/plans/indexes, cross-tenant isolation, mobile network throttling, field LCP/INP/CLS, and authenticated admin before/after timings remain unverified in this environment.
