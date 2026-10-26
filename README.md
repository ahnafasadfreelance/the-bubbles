# Restaurant Ordering

A dine-in restaurant ordering application built with Next.js App Router, TypeScript, Tailwind CSS, and Supabase.

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and fill in the Supabase project URL and publishable/anon key.
3. Start the app with `npm run dev`.

The app can be typechecked with `npm run typecheck`, linted with `npm run lint`, and built with `npm run build`.

## Public restaurant data

Set these public project values in `.env.local` (the site remains buildable without them and displays a Supabase setup notice):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

Apply `supabase/migrations/20260929000000_restaurant_settings_and_menu.sql` to the Supabase project, then run `supabase/seed.sql` only when sample records are useful. The seed intentionally uses demo restaurant/menu content and leaves restaurant settings unpublished. Replace the sample profile, categories, dishes, and image URLs with the restaurant's real information, then set `restaurant_settings.is_published` to `true` before publishing the site. Run the seed before customizing those records; its upserts restore the sample values if run again.

Public settings are read only when published. Active categories and available dishes are read through the public policies in the migration. If the migration is missing, the project values are invalid, or a query fails, the site shows a non-sensitive setup or availability message instead of substituting sample menu data. Public reads are server-rendered and deduplicated during a request; subsequent requests fetch current values without rebuilding the site.

The typed database schema is in `src/types/database.ts`; reusable public data queries live in `src/lib/restaurant-data.ts`. Browser and server Supabase clients live in `src/lib/supabase`. Never expose a service-role key in browser code or commit `.env.local`.

## Permanent dine-in table QR codes

Apply `supabase/migrations/20260930000000_restaurant_tables.sql` after the existing migrations. The migration enables RLS, creates no public policies, and grants table privileges only to Supabase's `service_role`. Anonymous and authenticated customer roles cannot query the table dataset. This migration has not been applied automatically by the app.

Configure `NEXT_PUBLIC_APP_URL` to the canonical app origin (or use Vercel's `VERCEL_URL` in a deployment), `SUPABASE_SERVICE_ROLE_KEY` with the server-only Supabase service-role key, and `TABLE_CONTEXT_SECRET` with a unique random secret of at least 32 bytes. Never add the service-role key or context secret to a `NEXT_PUBLIC_` variable or client code. The app can still serve its public menu without these table-system values; table resolution fails closed until configured.

Table creation generates a 256-bit token with Node's cryptographic random generator. The token remains stable through table detail updates; `rotateRestaurantTableQrToken` is a separate operation. QR exports use high error correction, a four-module quiet zone, a white background, and 1024-pixel PNG output. Set the canonical base URL before generating print assets. The QR identifies a table only: it is not a customer identity, an administration credential, or proof of an order.

`src/lib/table-management.ts` and its privileged client remain server-only foundations, not public endpoints or Server Actions. They are not exposed by the admin dashboard. Any future table-management endpoint must call the same server-verified admin authorization before accessing these utilities; Google sign-in by itself is not sufficient. QR resolution returns only active table display data and a signed, HttpOnly table-ID cookie; the `/menu` page rechecks that signature and active database state on every request. The cookie survives the same-site Google OAuth round trip and refresh without trusting a browser-supplied table number. The public menu remains available without table context.

## Shared table visits and staff support

Apply `supabase/migrations/20261012000000_shared_table_visits.sql` after the existing QR, ordering-session, and payment migrations. The first scan opens one visit for the table and starts a shared 10-minute ordering window. Further scans join that visit; they do not reset the window until it has expired, when a later scan opens a fresh shared ordering window. Orders retain their own independent order statuses.

Apply subsequent migrations in timestamp order as well. In particular, if `20261012000000_shared_table_visits.sql` was applied before its QR-session cleanup query qualified `expires_at`, apply `20261012010000_fix_shared_table_visit_qr_session.sql` to replace the function with the corrected version.

The customer support button is available from the QR menu and provides waiter, bill, water/cutlery, and message requests. Each successful customer request or message starts a shared 90-second table cooldown. The authenticated admin dashboard's **Table Visits & Support** page lists active table activity, lets staff acknowledge or resolve support requests and reply to customer messages; only Full Admins and the Owner can close visits. Closing a visit immediately disables that visit's ordering and support actions.

Meaningful activity (placing an order, sending a customer request/message, or a staff response/update) resets the 90-minute inactivity period; QR scans alone do not. Expiry is enforced by database functions whenever a QR scan, visit read, order, or support action occurs, so stale visits cannot be used and the next scan opens a fresh visit. This is request-driven expiry rather than a scheduled background job; a deployment requiring stale rows to be physically marked closed while the app is idle should also schedule `private.expire_stale_table_visits()` in Supabase.

## Customer dine-in orders

Apply `supabase/migrations/20260930010000_dine_in_orders.sql` after the table migration. Customers have RLS-scoped read access only to their own orders and order items, with column grants omitting the internal idempotency key. Inserts and cancellations are available only through server-only actions using the privileged client and service-role-only SQL functions; authenticated and anonymous clients have no order write grants. Order and item creation is one PostgreSQL transaction. Menu prices and names are snapshotted; a valid `discount_price` (non-null, non-negative, less than the regular price) is charged, otherwise the regular price applies. Client-observed prices detect changes and require review; they never calculate order totals.

Allowed status transitions are `pending` to `confirmed`, `rejected`, or `cancelled`; `confirmed` to `preparing`; `preparing` to `ready`; and `ready` to `completed`. Customer cancellation uses an atomic update conditioned on both order ownership and `pending` status. Orders begin `pending` with `counter` payment method and `unpaid` status. Table records are restricted from deletion while referenced, and menu dish deletion nulls the foreign key while retaining ordered name/price snapshots.

The customer cart stores item IDs, quantities, notes, client-observed prices, and a retry idempotency key in local storage. These values are untrusted; order submission reauthenticates the customer, verifies the expiring signed table cookie and active table, then delegates validation, pricing, and insertion to the database transaction. If table context changes while a cart has items, the customer must explicitly clear and rebind it. After successful placement the cart is cleared. Google sign-in returns to `/cart`; the table cookie is independent of customer identity and is not an order or admin credential.

Ordering requires the table and order migrations to be applied, `SUPABASE_SERVICE_ROLE_KEY` and `TABLE_CONTEXT_SECRET` configured server-side, published restaurant settings, active categories/items, an active table, and configured Google OAuth. Live database isolation, transaction, cancellation-race, and end-to-end OAuth tests require a configured Supabase project and have not been run as part of local build checks.

## Google customer sign-in

Apply all SQL migrations in `supabase/migrations/`, including `20260929010000_customer_profiles.sql`, to create the self-only customer profile foundation.

Configure Google OAuth manually:

1. In Supabase, open **Authentication > Sign In / Providers > Google** and enable Google.
2. In Google Cloud Console, create an **OAuth 2.0 Client ID** with application type **Web application**. Add the app's deployed domain to **Authorized JavaScript origins** when required by your Google consent setup.
3. Copy the Google client ID and client secret into the Google provider fields in Supabase. Do not add the client secret to this app's environment or source code.
4. In Google Cloud's **Authorized redirect URIs**, add the Supabase callback URI shown on that provider's Supabase page. It normally has this form: `https://<project-ref>.supabase.co/auth/v1/callback`. Find the project ref in the Supabase project URL under **Project Settings > API**; use the displayed callback URI as the source of truth, especially when using a custom Supabase domain.
5. In Supabase **Authentication > URL Configuration**, set **Site URL** to the app's canonical base URL and add each allowed app callback URL, for example `http://localhost:3000/auth/callback` and `https://your-domain.example/auth/callback`. Add only the local, production, and explicitly needed preview URLs.

The app requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or the project's publishable key) in `.env.local`; these are public client configuration values, not secrets. Google credentials belong in Supabase Auth. OAuth and self-only profile access do not need a service-role key; order submission, customer cancellation, and admin operations use one server-side and it must never use a `NEXT_PUBLIC_` prefix. Until the provider, callback URI, allowed app URLs, and database migration are configured in the live project, OAuth and profile persistence have not been live-tested.

## Restaurant admin dashboard

Apply `supabase/migrations/20260930020000_admin_order_management.sql` after the customer order migration. It adds optional rejection reasons and server-only RPCs for bounded admin order reads, atomic status transitions, and preparation estimates. The status trigger permits only `pending` to `confirmed`, `rejected`, or `cancelled`; `confirmed` to `preparing`; `preparing` to `ready`; and `ready` to `completed`. Admin order actions lock the row and compare its current status before changing it, so customer cancellation and staff acceptance cannot both win.

Set these server environment values before using `/admin`:

```env
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
NEXT_PUBLIC_APP_URL=https://your-domain.example
```

Before deploying the database-backed access change, apply all migrations and establish the Owner by following [docs/staff-access-setup.md](./docs/staff-access-setup.md). Do not deploy the new app before the verified Owner membership is in place; `ADMIN_USER_IDS` is no longer an authorization source. The server validates the Supabase Auth user and then checks the current active database membership for each protected request. Keep the service-role key only in server environment configuration, never in a `NEXT_PUBLIC_` variable or browser code. The dashboard also requires the public Supabase URL and anon/publishable key so it can verify the user's session.

The admin RPCs are executable only by Supabase `service_role`; customer RLS policies and customer order reads are unchanged. Owner and Full Admin order views retain the existing dashboard and payment-record workflow. Order Management staff receive a separate operational view with customer display name, item names/quantities, table, order notes, workflow status, and payment status only; no email, payment collection history, or reports are returned. Its server refresh runs every 10 seconds because the existing migrations do not configure an authorized staff Realtime publication. Preparation estimates and payment collection remain Full Admin/Owner functions.

Optional server-only `ORDER_PREPARATION_MIN_MINUTES` and `ORDER_PREPARATION_MAX_MINUTES` set the allowed estimate range; they must be integers from `1` to `1440`, with the minimum lower than the maximum. Defaults are `5` and `240` minutes. `.env.example` lists all public and server-only variables used by the app and contains placeholders only.

The current migrations do not configure an authorized Supabase Realtime publication. `/admin` therefore polls through the protected server action every 30 seconds and avoids repeat notifications for the same pending order during the open session. Visual notifications work without browser audio; sound starts muted and requires an explicit user interaction to enable. No live Supabase migration, authorization, transition-race, or notification test has been run in this local environment.

## Customer reviews

Apply `supabase/migrations/20261011000000_customer_reviews.sql` after the customer order and customer profile migrations. It adds one rating per order, optional feedback, and persisted review-prompt dismissals. The database RPCs check that the authenticated customer owns the completed order; the unique order constraint prevents duplicate reviews. Review tables and RPCs are inaccessible to `anon` and `authenticated` database roles. Server Actions reauthenticate the customer and pass only the verified user ID to the service-role RPCs.

Completed customer orders open the review prompt only after the server confirms eligibility. Dismissing it is stored against that order. `/admin/reviews` requires an active Owner or Full Admin membership and server-only service-role access, with aggregate analytics and filtered, paginated review data fetched on the server. Apply the migration before deploying the feature, then verify review submission, duplicate prevention, ownership checks, and dismissal persistence with test customer accounts. This local build does not apply or live-test Supabase migrations.

## Manual payment collection

After applying the customer-order, QR-session, customer-profile, and admin migrations above, apply `supabase/migrations/20261010000000_manual_payment_collection.sql` to each Supabase project. This additive migration stores a separate customer payment preference and staff-recorded collection history, exposes payment data to customers only through their existing order access, and restricts collection/admin RPCs and the collection table to `service_role`. It does not process online payments and has not been applied to a live project from this repository.

At checkout, customers choose Card, bKash, or Cash as a preference; no payment credentials are requested and new orders remain unpaid. An authorized administrator records a collection only after physically receiving and manually verifying the money at the table. The actual method and each transaction are preserved separately from the customer's preference. Partial collections are supported; the database locks the order row, checks the remaining balance, records the collection and updates the payment status atomically. Repeating a submission with the same idempotency key is safe. A collection record is a staff attestation, not an independent bank, terminal, or bKash reconciliation.

Payment overview collections default to the restaurant's current local day and follow the dashboard date range when one is selected; outstanding balances are current open order balances. Before deployment, apply the migration, verify the RPC grants and RLS in Supabase, and exercise checkout plus authorized/unauthorized collection flows with test accounts, including concurrent and retried submissions. Do not reset production data. No database test runner or live Supabase credentials are configured here, so production application and those integration checks remain a deployment prerequisite.

Existing orders already marked paid retain their prior paid amount during migration; because there are no historical collection rows to reconstruct, their individual payment history remains unavailable and the admin detail view identifies this case.

## Menu, settings, tables, and asset management

After the admin order migration, apply `supabase/migrations/20260930030000_restaurant_asset_storage.sql` and `supabase/migrations/20261001000000_admin_dashboard_order_buckets.sql`. The first creates or configures the public-read `restaurant-assets` bucket (JPEG, PNG, WebP, and AVIF; 5 MB maximum). Storage writes are restricted for `anon` and `authenticated`, including if another permissive Storage policy exists. Image upload and unused-image cleanup run only through same-origin server routes that verify an active Owner or Full Admin membership and use the server-only service-role key. New uploads are automatically rotated, resized to fit their display role, and stored as WebP; public restaurant images are delivered as responsive, cached Next.js image variants. Keep `NEXT_PUBLIC_SUPABASE_URL` configured at build time so the image optimizer can securely allow only this project's public restaurant-assets bucket. Public image reads do not expose restaurant settings, table records, or order data. The second adds service-role-only aggregate RPCs for real two-hour Dashboard chart buckets and accurate order-status tab counts.

The `/admin` menu, category, settings, and table operations all require an active Owner or Full Admin membership. Dish removal is an availability archive so historical item snapshots remain intact. Categories can only be deleted when no dishes reference them; otherwise reassign dishes or deactivate the category. Tables are deactivated rather than deleted, preserving order references and their cryptographic QR token. Ordinary table edits never rotate the token. Inactive categories/dishes are filtered from the public menu and trusted order creation; inactive tables stop resolving through their QR route.

Set optional server-only `MAX_MENU_PREPARATION_MINUTES` to an integer from `1` to `1440` to change the dish-form upper limit (defaults to `480`). Keep `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, and the existing Supabase project settings configured as described above; `NEXT_PUBLIC_APP_URL` must be the public origin for the deployment whose QR signs will be printed and invitations delivered. Apply migrations in order to each Supabase project (local and production), then deploy the app. Public settings/menu loaders read current database values per request, and successful admin updates revalidate the affected public routes without a rebuild.

## Staff & access

The additive `supabase/migrations/20261012020000_staff_rbac_and_audit.sql` migration creates constrained restaurant memberships, private role lookup, scoped RLS policies, server-only staff management RPCs, and an immutable audit log. Apply it after the other timestamped migrations and use the controlled Owner bootstrap instructions in [docs/staff-access-setup.md](./docs/staff-access-setup.md). In Supabase Auth, configure email delivery and allow the deployed `/auth/callback` URL. Staff invitations are sent by the server through Supabase Auth and activate only after the invite link is verified. Existing accounts that cannot accept an invite are reported explicitly; this app's current Auth setup has no invitation-resend API.

The repository contains no prior Storage bucket setup, and no Supabase CLI/PostgreSQL client was available for live execution during this implementation. The Storage migration, uploads, management CRUD, and customer/admin authorization must be verified against the configured Supabase project after applying migrations; local build checks do not substitute for those live checks.
