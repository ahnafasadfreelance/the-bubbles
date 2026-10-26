# Rooftop turf booking rollout

The turf module is additive to the restaurant application. Its database objects, routes, permissions, booking records, and styles are separate from restaurant orders.

## Important deployment status

The checked-in migration and application code have **not** been applied to or tested against a Supabase database. Do not enable public bookings in production until the migration has been reviewed and applied to a staging project, SQL/RLS and concurrency tests have passed, and the remaining product items below have been implemented and verified.

This implementation currently provides:

- Separate `full_admin` and `turf_manager` memberships. An existing restaurant Owner or Full Admin can provision an already verified Google-authenticated account in the Rooftop Turf Staff section of `/admin/staff`. Restaurant roles alone do not grant turf access.
- A public weekly and daily availability view with no customer details in public responses.
- Server-authoritative hourly/fixed-slot price calculation, schedule and policy validation, 15-minute buffer checks, and serialized reservation creation.
- Customer booking tracking and account history.
- Staff request approval/rejection, payment submission, duplicate-reference flagging, payment verification, immutable ledger entries, audit records, configurable weekly hours/pricing/policies/payment instructions, and a shared prioritized task queue.
- Staff-reviewed cancellation/refund and reschedule requests. Rescheduling preserves duration and price; staff rechecks current hours, closures, buffers, and availability before approval. Refunds are recorded only after staff reports a completed transfer, and cannot exceed verified, unrefunded payments.
- An in-app customer notification inbox, database-backed email outbox, retry processing, and a Resend email adapter.
- Database expiry processing and protected routes for a deployment scheduler.

Closure resolution for affected bookings, manual staff bookings, player-count overrides, peak/day pricing, private screenshot storage, balance/in-person payment collection, reports/exports, and staff notifications are not complete. Email remains inactive until credentials and sender settings are supplied. Keep `booking_enabled` off until the migration has been verified against PostgreSQL and the remaining operational requirements are complete.

## Staging setup

1. Confirm the existing Supabase project has Google OAuth enabled and that a test customer can authenticate through the existing sign-in flow.
2. Back up staging and apply these additive migrations, in timestamp order, using the project's normal migration process:
   - `supabase/migrations/20261026000000_turf_booking_foundation.sql`
   - `supabase/migrations/20261027000000_turf_customer_operations.sql`
   - `supabase/migrations/20261028000000_turf_staff_email_provisioning.sql`
   
   They do not change restaurant tables or existing policies. Neither migration has been run by the application.
3. Verify the new tables, policies, functions, grants, and indexes in staging. In particular, test simultaneous customer requests at overlapping and 15-minute buffer-boundary times against the actual PostgreSQL database.
4. Sign in as an existing restaurant Owner or Full Admin and open `/admin/staff#turf-access`. Enter the email address of a real, existing Google-authenticated account and assign `Turf Manager` or `Full Admin`. The person must have already signed in with Google using that email. Only the Owner can grant the Turf Full Admin role. Record a reason for each grant or deactivation.
5. Sign in as a provisioned turf staff member and open `/turf/manage/settings`. Configure weekly hours, a non-zero hourly rate or fixed slot, publish the booking policy, set player and deadline rules, and configure accepted payment instructions. Changes are audited and schedule edits fail if they would invalidate protected bookings.
6. Keep online booking disabled while testing the public schedule, the booking flow, staff approval, payment submission, duplicate detection, verification, and tracking with staging accounts.
7. Configure `TURF_CRON_SECRET` as a new, random server-only secret of at least 32 bytes and schedule `POST /api/cron/turf-expiries` and `POST /api/cron/turf-notifications` at least once per minute through the deployment platform. Send each request `Authorization: Bearer <secret>`. For email, configure server-only `RESEND_API_KEY`, `TURF_EMAIL_FROM` (a verified Resend sender), and `TURF_SITE_URL` (the HTTPS production origin). Also ensure `SUPABASE_SERVICE_ROLE_KEY` is configured server-side. Never use any of these values in a `NEXT_PUBLIC_` variable or browser code.
8. Verify pending-review requests remain protected after their hold elapses and that approved bookings expire only after the payment deadline. Verify in-app notification creation, email retry/backoff, and both scheduled processors before considering online bookings.

Do not run `supabase/seed.sql` for the turf module. Do not promote users based on email domains, restaurant access alone, or browser-supplied role fields. The role-assignment function performs its own authorization and writes an audit record.

## Operational safeguards

- Public booking availability comes from `turf_public_day` / `turf_public_week`; it exposes only open hours, fixed slots, public booking rules, and occupied time ranges.
- Booking creation and staff scheduling/pricing mutations take the same PostgreSQL advisory lock. The database function is authoritative; browser availability and prices are informational.
- Tracking data requires authenticated booking ownership or the high-entropy token returned once at booking creation. The human-readable reference alone is not an access credential.
- `turf_payment_ledger` and `turf_audit_logs` reject updates and deletes. Correct financial history with compensating entries and audited operations, not row edits.
- Payment references and screenshots are not proof of payment. Only the staff verification function records a verified advance; duplicate references are blocked from verification pending investigation.
- Customer change requests do not modify a booking until an authorized staff member approves them. Cancellation refunds are optional and recorded in the immutable ledger only when staff supplies the completed transfer amount, method, and reference.
- The notification inbox is customer-owned. The email worker sends only to the verified account email associated with the booking and uses outbox idempotency keys; provider credentials and site origin are server-only.
- The existing restaurant homepage, ordering routes, authentication flow, and restaurant admin permissions remain separate from the turf module.
