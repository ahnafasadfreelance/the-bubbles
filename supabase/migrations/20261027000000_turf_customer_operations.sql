begin;

create table public.turf_change_requests (
    id uuid primary key default gen_random_uuid(),
    booking_id uuid not null references public.turf_bookings(id) on delete restrict,
    customer_id uuid not null references auth.users(id) on delete restrict,
    request_type text not null check (request_type in ('cancellation', 'reschedule')),
    requested_starts_at timestamptz,
    requested_ends_at timestamptz,
    customer_reason text not null check (char_length(pg_catalog.btrim(customer_reason)) between 3 and 1000),
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    reviewed_by uuid references auth.users(id) on delete set null,
    reviewed_at timestamptz,
    review_reason text,
    created_at timestamptz not null default pg_catalog.now(),
    check (
        (request_type = 'cancellation' and requested_starts_at is null and requested_ends_at is null)
        or (request_type = 'reschedule' and requested_starts_at is not null
            and requested_ends_at is not null and requested_starts_at < requested_ends_at)
    ),
    check ((status = 'pending' and reviewed_at is null) or (status <> 'pending' and reviewed_at is not null))
);

create index turf_change_requests_pending_idx
    on public.turf_change_requests (created_at)
    where status = 'pending';
create index turf_change_requests_booking_idx
    on public.turf_change_requests (booking_id, created_at desc);

create table public.turf_notifications (
    id bigint generated always as identity primary key,
    recipient_id uuid not null references auth.users(id) on delete cascade,
    booking_id uuid references public.turf_bookings(id) on delete set null,
    idempotency_key text not null unique,
    event_type text not null,
    title text not null,
    body text not null,
    href text not null default '/account/turf-bookings',
    created_at timestamptz not null default pg_catalog.now(),
    read_at timestamptz
);
alter table public.turf_notification_outbox
    add column processing_started_at timestamptz;

create index turf_notifications_recipient_idx
    on public.turf_notifications (recipient_id, created_at desc);
alter table public.turf_change_requests enable row level security;
alter table public.turf_notifications enable row level security;

revoke all on public.turf_change_requests, public.turf_notifications from public, anon, authenticated;
grant select on public.turf_change_requests, public.turf_notifications to authenticated;
grant all on public.turf_change_requests, public.turf_notifications to service_role;

create policy "Customers and turf staff can read turf change requests"
    on public.turf_change_requests for select to authenticated
    using (customer_id = (select auth.uid()) or private.turf_staff_has_role());
create policy "Customers can read their turf notifications"
    on public.turf_notifications for select to authenticated
    using (recipient_id = (select auth.uid()));
create policy "Customers can mark their turf notifications read"
    on public.turf_notifications for update to authenticated
    using (recipient_id = (select auth.uid()))
    with check (recipient_id = (select auth.uid()));

create or replace function private.turf_create_in_app_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    booking_reference text;
    notification_title text;
    notification_body text;
begin
    if new.recipient_id is null then
        return new;
    end if;

    select booking.reference into booking_reference
      from public.turf_bookings as booking
     where booking.id = new.booking_id;
    booking_reference := coalesce(new.payload ->> 'reference', booking_reference);
    notification_title := case new.event_type
        when 'booking_request_submitted' then 'Turf request received'
        when 'booking_request_approved' then 'Turf request approved'
        when 'booking_request_rejected' then 'Turf request update'
        when 'booking_approve' then 'Turf request approved'
        when 'booking_reject' then 'Turf request update'
        when 'advance_payment_submitted' then 'Payment submitted'
        when 'advance_payment_verify' then 'Payment verified'
        when 'advance_payment_reject' then 'Payment update'
        when 'booking_expired' then 'Booking expired'
        when 'booking_cancelled' then 'Booking cancelled'
        when 'booking_rescheduled' then 'Booking rescheduled'
        when 'booking_change_requested' then 'Booking change requested'
        when 'booking_change_rejected' then 'Booking change update'
        else 'Turf booking update'
    end;
    notification_body := case new.event_type
        when 'booking_request_submitted' then 'Your booking request is awaiting staff review.'
        when 'booking_request_approved' then 'Your request was approved. Follow the payment instructions before the deadline.'
        when 'booking_request_rejected' then 'Staff reviewed your request. Open the booking for details.'
        when 'booking_approve' then 'Your request was approved. Follow the payment instructions before the deadline.'
        when 'booking_reject' then 'Staff reviewed your request. Open the booking for details.'
        when 'advance_payment_submitted' then 'Your payment submission is awaiting verification.'
        when 'advance_payment_verify' then 'Staff verified your payment. Open the booking to see its current status.'
        when 'advance_payment_reject' then 'Staff reviewed your payment. Open the booking for details.'
        when 'booking_expired' then 'The payment deadline elapsed before the booking was confirmed.'
        when 'booking_cancelled' then 'Staff approved your cancellation request.'
        when 'booking_rescheduled' then 'Staff approved your requested booking time change.'
        when 'booking_change_requested' then 'Your change request is awaiting staff review.'
        when 'booking_change_rejected' then 'Staff reviewed your change request. Open the booking for details.'
        else 'There is an update to your turf booking.'
    end;

    insert into public.turf_notifications (
        recipient_id, booking_id, idempotency_key, event_type, title, body, href
    ) values (
        new.recipient_id, new.booking_id, new.idempotency_key, new.event_type,
        notification_title, notification_body,
        case when booking_reference is null then '/account/turf-bookings'
             else '/turf/booking/' || booking_reference end
    ) on conflict (idempotency_key) do nothing;
    return new;
end;
$$;

revoke all on function private.turf_create_in_app_notification() from public, anon, authenticated, service_role;
create trigger turf_outbox_to_in_app_notification
    after insert on public.turf_notification_outbox
    for each row execute function private.turf_create_in_app_notification();

insert into public.turf_notifications (
    recipient_id, booking_id, idempotency_key, event_type, title, body, href, created_at
)
select
    outbox.recipient_id,
    outbox.booking_id,
    outbox.idempotency_key,
    outbox.event_type,
    case outbox.event_type
        when 'booking_request_submitted' then 'Turf request received'
        when 'booking_request_approved' then 'Turf request approved'
        when 'booking_request_rejected' then 'Turf request update'
        when 'booking_approve' then 'Turf request approved'
        when 'booking_reject' then 'Turf request update'
        when 'advance_payment_submitted' then 'Payment submitted'
        when 'advance_payment_verify' then 'Payment verified'
        when 'advance_payment_reject' then 'Payment update'
        when 'booking_expired' then 'Booking expired'
        when 'booking_cancelled' then 'Booking cancelled'
        when 'booking_rescheduled' then 'Booking rescheduled'
        when 'booking_change_requested' then 'Booking change requested'
        when 'booking_change_rejected' then 'Booking change update'
        else 'Turf booking update'
    end,
    case outbox.event_type
        when 'booking_request_submitted' then 'Your booking request is awaiting staff review.'
        when 'booking_request_approved' then 'Your request was approved. Follow the payment instructions before the deadline.'
        when 'booking_request_rejected' then 'Staff reviewed your request. Open the booking for details.'
        when 'booking_approve' then 'Your request was approved. Follow the payment instructions before the deadline.'
        when 'booking_reject' then 'Staff reviewed your request. Open the booking for details.'
        when 'advance_payment_submitted' then 'Your payment submission is awaiting verification.'
        when 'advance_payment_verify' then 'Staff verified your payment. Open the booking to see its current status.'
        when 'advance_payment_reject' then 'Staff reviewed your payment. Open the booking for details.'
        when 'booking_expired' then 'The payment deadline elapsed before the booking was confirmed.'
        when 'booking_cancelled' then 'Staff approved your cancellation request.'
        when 'booking_rescheduled' then 'Staff approved your requested booking time change.'
        when 'booking_change_requested' then 'Your change request is awaiting staff review.'
        when 'booking_change_rejected' then 'Staff reviewed your change request. Open the booking for details.'
        else 'There is an update to your turf booking.'
    end,
    case when booking.reference is null then '/account/turf-bookings'
         else '/turf/booking/' || booking.reference end,
    outbox.created_at
from public.turf_notification_outbox as outbox
left join public.turf_bookings as booking on booking.id = outbox.booking_id
where outbox.recipient_id is not null
on conflict (idempotency_key) do nothing;

create or replace function public.turf_request_booking_change(
    p_booking_id uuid,
    p_request_type text,
    p_reason text,
    p_requested_starts_at timestamptz default null,
    p_requested_ends_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    booking_row public.turf_bookings%rowtype;
    request_id uuid;
begin
    if actor_id is null or auth.role() <> 'authenticated'
       or p_booking_id is null
       or p_request_type is null
       or p_request_type not in ('cancellation', 'reschedule')
       or p_reason is null or char_length(pg_catalog.btrim(p_reason)) not between 3 and 1000
       or (p_request_type = 'cancellation' and (p_requested_starts_at is not null or p_requested_ends_at is not null))
       or (p_request_type = 'reschedule' and (
           p_requested_starts_at is null or p_requested_ends_at is null
           or p_requested_starts_at >= p_requested_ends_at
       )) then
        raise exception 'Booking change request details are invalid.' using errcode = '22023';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(19780011, 1);
    select * into booking_row from public.turf_bookings
     where id = p_booking_id and customer_id = actor_id
     for update;
    if not found or booking_row.status not in (
        'pending', 'approved_awaiting_payment', 'payment_under_review', 'confirmed'
    ) then
        raise exception 'This booking cannot accept a change request.' using errcode = '55000';
    end if;
    if p_request_type = 'reschedule' and (
        booking_row.status <> 'confirmed'
        or p_requested_starts_at <= pg_catalog.now()
        or p_requested_starts_at > pg_catalog.now() + interval '365 days'
        or p_requested_ends_at - p_requested_starts_at <> booking_row.ends_at - booking_row.starts_at
    ) then
        raise exception 'Rescheduling is available for confirmed bookings and must preserve the booked duration.' using errcode = '22023';
    end if;
    if exists (
        select 1 from public.turf_change_requests as existing
        where existing.booking_id = p_booking_id and existing.status = 'pending'
    ) then
        raise exception 'A change request is already awaiting staff review.' using errcode = '55000';
    end if;

    insert into public.turf_change_requests (
        booking_id, customer_id, request_type, requested_starts_at,
        requested_ends_at, customer_reason
    ) values (
        p_booking_id, actor_id, p_request_type, p_requested_starts_at,
        p_requested_ends_at, pg_catalog.btrim(p_reason)
    ) returning id into request_id;

    insert into public.turf_audit_logs (actor_id, action, entity_type, entity_id, reason, details)
    values (
        actor_id, 'booking_' || p_request_type || '_requested', 'booking',
        p_booking_id::text, pg_catalog.btrim(p_reason),
        pg_catalog.jsonb_build_object(
            'request_id', request_id, 'starts_at', p_requested_starts_at,
            'ends_at', p_requested_ends_at
        )
    );
    insert into public.turf_notification_outbox (
        booking_id, recipient_id, event_type, idempotency_key, payload
    ) values (
        p_booking_id, actor_id, 'booking_change_requested',
        'booking-change-requested:' || request_id::text,
        pg_catalog.jsonb_build_object('reference', booking_row.reference, 'request_id', request_id)
    );
    return pg_catalog.jsonb_build_object('ok', true, 'request_id', request_id, 'status', 'pending');
end;
$$;

revoke all on function public.turf_request_booking_change(uuid, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.turf_request_booking_change(uuid, text, text, timestamptz, timestamptz) to authenticated;

create or replace function public.turf_review_booking_change(
    p_request_id uuid,
    p_decision text,
    p_reason text,
    p_refund_amount numeric default null,
    p_refund_method text default null,
    p_refund_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    change_row public.turf_change_requests%rowtype;
    booking_row public.turf_bookings%rowtype;
    settings_row public.turf_settings%rowtype;
    local_start timestamp;
    local_end timestamp;
    open_time time;
    close_time time;
    closed_day boolean;
    paid_amount numeric(12, 2);
    prior_refunds numeric(12, 2);
begin
    if actor_id is null or auth.role() <> 'authenticated'
       or p_request_id is null or p_decision is null or p_decision not in ('approve', 'reject')
       or p_reason is null or char_length(pg_catalog.btrim(p_reason)) not between 3 and 1000
       or (p_decision = 'reject' and p_refund_amount is not null)
       or (p_refund_amount is not null and (
           p_refund_amount <= 0 or p_refund_method is null
           or char_length(pg_catalog.btrim(p_refund_method)) not between 1 and 100
           or p_refund_reference is null
           or char_length(pg_catalog.btrim(p_refund_reference)) not between 1 and 200
       ))
       or (p_refund_amount is null and (p_refund_method is not null or p_refund_reference is not null)) then
        raise exception 'Change review details are invalid.' using errcode = '22023';
    end if;
    if public.turf_current_staff_role() is null then
        raise exception 'Turf staff access is required.' using errcode = '42501';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(19780011, 1);
    select * into change_row from public.turf_change_requests
     where id = p_request_id for update;
    if not found or change_row.status <> 'pending' then
        raise exception 'This change request is no longer awaiting review.' using errcode = '55000';
    end if;
    select * into booking_row from public.turf_bookings
     where id = change_row.booking_id for update;
    if not found then
        raise exception 'Booking was not found.' using errcode = 'P0002';
    end if;
    select * into strict settings_row from public.turf_settings where id = true;

    if p_decision = 'approve' and change_row.request_type = 'cancellation' then
        if booking_row.status not in (
            'pending', 'approved_awaiting_payment', 'payment_under_review', 'confirmed'
        ) then
            raise exception 'Booking is no longer eligible for cancellation.' using errcode = '55000';
        end if;
        if p_refund_amount is not null then
            select coalesce(sum(amount), 0) into paid_amount
              from public.turf_payment_ledger
             where booking_id = booking_row.id and entry_type in ('advance', 'balance') and status = 'verified';
            select coalesce(sum(amount), 0) into prior_refunds
              from public.turf_payment_ledger
             where booking_id = booking_row.id and entry_type = 'refund' and status = 'verified';
            if p_refund_amount > paid_amount - prior_refunds then
                raise exception 'Refund exceeds the verified, unrefunded amount.' using errcode = '22023';
            end if;
            insert into public.turf_payment_ledger (
                booking_id, amount, payment_method, reference, entry_type, status,
                recorded_by, verified_by, reason, verified_at
            ) values (
                booking_row.id, p_refund_amount, pg_catalog.btrim(p_refund_method),
                pg_catalog.btrim(p_refund_reference), 'refund', 'verified',
                actor_id, actor_id, pg_catalog.btrim(p_reason), pg_catalog.now()
            );
        end if;
        update public.turf_payment_submissions
           set status = 'rejected', reviewed_by = actor_id, reviewed_at = pg_catalog.now(),
               review_reason = 'Booking cancelled after staff review.'
         where booking_id = booking_row.id
           and status in ('submitted', 'duplicate_flagged');
        update public.turf_bookings
           set status = 'cancelled', updated_at = pg_catalog.now()
         where id = booking_row.id;
        insert into public.turf_notification_outbox (
            booking_id, recipient_id, event_type, idempotency_key, payload
        ) values (
            booking_row.id, booking_row.customer_id, 'booking_cancelled',
            'booking-cancelled:' || change_row.id::text,
            pg_catalog.jsonb_build_object('reference', booking_row.reference)
        );
    elsif p_decision = 'approve' and change_row.request_type = 'reschedule' then
        if booking_row.status <> 'confirmed' or booking_row.starts_at <= pg_catalog.now()
           or change_row.requested_starts_at <= pg_catalog.now()
           or change_row.requested_ends_at - change_row.requested_starts_at <> booking_row.ends_at - booking_row.starts_at
           or change_row.requested_starts_at > pg_catalog.now()
                + pg_catalog.make_interval(days => settings_row.booking_horizon_days) then
            raise exception 'Booking or requested time is no longer eligible for rescheduling.' using errcode = '55000';
        end if;
        if extract(second from change_row.requested_starts_at) <> 0
           or extract(second from change_row.requested_ends_at) <> 0 then
            raise exception 'Rescheduled times must align to whole minutes.' using errcode = '22023';
        end if;

        local_start := change_row.requested_starts_at at time zone 'Asia/Dhaka';
        local_end := change_row.requested_ends_at at time zone 'Asia/Dhaka';
        if local_end::date <> local_start::date then
            raise exception 'Bookings may not cross the local operating day.' using errcode = '22023';
        end if;
        select special.is_closed, special.opens_at, special.closes_at
          into closed_day, open_time, close_time
          from public.turf_special_hours as special
         where special.local_date = local_start::date;
        if not found then
            select hours.is_closed, hours.opens_at, hours.closes_at
              into closed_day, open_time, close_time
              from public.turf_operating_hours as hours
             where hours.weekday = extract(dow from local_start)::smallint;
        end if;
        if coalesce(closed_day, true) or local_start::time < open_time or local_end::time > close_time then
            raise exception 'Requested time is outside current operating hours.' using errcode = '23P01';
        end if;
        if booking_row.booking_mode = 'hourly'
           and (
               change_row.requested_ends_at - change_row.requested_starts_at
                    < pg_catalog.make_interval(mins => settings_row.minimum_duration_minutes)
               or pg_catalog.mod(
                   extract(epoch from (change_row.requested_ends_at - change_row.requested_starts_at)) / 60
                       - settings_row.minimum_duration_minutes,
                   settings_row.duration_increment_minutes
               ) <> 0
           ) then
            raise exception 'Requested duration does not meet current booking rules.' using errcode = '22023';
        end if;
        if booking_row.booking_mode = 'fixed' and not exists (
            select 1 from public.turf_fixed_slots as slot
            where slot.id = booking_row.fixed_slot_id and slot.is_active
              and slot.starts_at = local_start::time and slot.ends_at = local_end::time
        ) then
            raise exception 'The original fixed slot is not available at the requested time.' using errcode = '23P01';
        end if;
        if exists (
            select 1 from public.turf_bookings as other
            where other.id <> booking_row.id
              and other.status in ('pending', 'approved_awaiting_payment', 'payment_under_review', 'confirmed')
              and tstzrange(
                    other.starts_at - pg_catalog.make_interval(mins => settings_row.buffer_minutes),
                    other.ends_at + pg_catalog.make_interval(mins => settings_row.buffer_minutes), '[)'
                  ) && tstzrange(change_row.requested_starts_at, change_row.requested_ends_at, '[)')
        ) or exists (
            select 1 from public.turf_blocked_periods as blocked
            where blocked.status = 'active'
              and tstzrange(
                    blocked.starts_at - pg_catalog.make_interval(mins => settings_row.buffer_minutes),
                    blocked.ends_at + pg_catalog.make_interval(mins => settings_row.buffer_minutes), '[)'
                  ) && tstzrange(change_row.requested_starts_at, change_row.requested_ends_at, '[)')
        ) then
            raise exception 'Requested time is no longer available.' using errcode = '23P01';
        end if;
        update public.turf_bookings
           set starts_at = change_row.requested_starts_at,
               ends_at = change_row.requested_ends_at,
               updated_at = pg_catalog.now()
         where id = booking_row.id;
        insert into public.turf_notification_outbox (
            booking_id, recipient_id, event_type, idempotency_key, payload
        ) values (
            booking_row.id, booking_row.customer_id, 'booking_rescheduled',
            'booking-rescheduled:' || change_row.id::text,
            pg_catalog.jsonb_build_object('reference', booking_row.reference)
        );
    end if;

    update public.turf_change_requests
       set status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
           reviewed_by = actor_id, reviewed_at = pg_catalog.now(),
           review_reason = pg_catalog.btrim(p_reason)
     where id = change_row.id;
    if p_decision = 'reject' then
        insert into public.turf_notification_outbox (
            booking_id, recipient_id, event_type, idempotency_key, payload
        ) values (
            booking_row.id, booking_row.customer_id, 'booking_change_rejected',
            'booking-change-rejected:' || change_row.id::text,
            pg_catalog.jsonb_build_object('reference', booking_row.reference)
        );
    end if;
    insert into public.turf_audit_logs (actor_id, action, entity_type, entity_id, reason, details)
    values (
        actor_id, 'booking_' || change_row.request_type || '_' || p_decision,
        'booking', booking_row.id::text, pg_catalog.btrim(p_reason),
        pg_catalog.jsonb_build_object(
            'request_id', change_row.id, 'refund_amount', p_refund_amount,
            'starts_at', change_row.requested_starts_at, 'ends_at', change_row.requested_ends_at
        )
    );
    return pg_catalog.jsonb_build_object('ok', true, 'status', p_decision);
end;
$$;

revoke all on function public.turf_review_booking_change(uuid, text, text, numeric, text, text) from public, anon;
grant execute on function public.turf_review_booking_change(uuid, text, text, numeric, text, text) to authenticated;

create or replace function public.turf_staff_change_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    request_list jsonb;
begin
    if public.turf_current_staff_role() is null then
        raise exception 'Turf staff access is required.' using errcode = '42501';
    end if;
    select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
            'id', request.id,
            'booking_id', booking.id,
            'reference', booking.reference,
            'request_type', request.request_type,
            'customer_name', booking.customer_name,
            'customer_phone', booking.customer_phone,
            'starts_at', booking.starts_at,
            'ends_at', booking.ends_at,
            'requested_starts_at', request.requested_starts_at,
            'requested_ends_at', request.requested_ends_at,
            'reason', request.customer_reason,
            'created_at', request.created_at,
            'verified_paid', coalesce((
                select sum(ledger.amount)
                from public.turf_payment_ledger as ledger
                where ledger.booking_id = booking.id
                  and ledger.entry_type in ('advance', 'balance')
                  and ledger.status = 'verified'
            ), 0)
        ) order by request.created_at
    ), '[]'::jsonb) into request_list
    from public.turf_change_requests as request
    join public.turf_bookings as booking on booking.id = request.booking_id
    where request.status = 'pending';
    return pg_catalog.jsonb_build_object('requests', request_list);
end;
$$;

revoke all on function public.turf_staff_change_requests() from public, anon;
grant execute on function public.turf_staff_change_requests() to authenticated;

create or replace function public.turf_customer_booking_change_requests(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    request_list jsonb;
begin
    if actor_id is null or auth.role() <> 'authenticated' or p_booking_id is null then
        raise exception 'Sign in to view booking changes.' using errcode = '42501';
    end if;
    if not exists (
        select 1 from public.turf_bookings as booking
        where booking.id = p_booking_id and booking.customer_id = actor_id
    ) then
        raise exception 'Booking was not found.' using errcode = 'P0002';
    end if;
    select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
            'id', request.id,
            'request_type', request.request_type,
            'status', request.status,
            'reason', request.customer_reason,
            'review_reason', request.review_reason,
            'created_at', request.created_at
        ) order by request.created_at desc
    ), '[]'::jsonb)
      into request_list
      from (
          select * from public.turf_change_requests
          where booking_id = p_booking_id and customer_id = actor_id
          order by created_at desc limit 10
      ) as request;
    return pg_catalog.jsonb_build_object('requests', request_list);
end;
$$;

revoke all on function public.turf_customer_booking_change_requests(uuid) from public, anon;
grant execute on function public.turf_customer_booking_change_requests(uuid) to authenticated;

create or replace function public.turf_customer_notifications()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    customer_id uuid := auth.uid();
    notification_list jsonb;
begin
    if customer_id is null or auth.role() <> 'authenticated' then
        raise exception 'Sign in to view notifications.' using errcode = '42501';
    end if;
    select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
            'id', notification.id, 'event_type', notification.event_type,
            'title', notification.title, 'body', notification.body,
            'href', notification.href, 'created_at', notification.created_at,
            'read_at', notification.read_at
        ) order by notification.created_at desc
    ), '[]'::jsonb) into notification_list
    from (
        select * from public.turf_notifications
        where recipient_id = customer_id
        order by created_at desc limit 100
    ) as notification;
    return pg_catalog.jsonb_build_object('notifications', notification_list);
end;
$$;

revoke all on function public.turf_customer_notifications() from public, anon;
grant execute on function public.turf_customer_notifications() to authenticated;

create or replace function public.turf_mark_notification_read(p_notification_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    customer_id uuid := auth.uid();
begin
    if customer_id is null or auth.role() <> 'authenticated' or p_notification_id is null then
        raise exception 'Notification update is invalid.' using errcode = '22023';
    end if;
    update public.turf_notifications
       set read_at = coalesce(read_at, pg_catalog.now())
     where id = p_notification_id and recipient_id = customer_id;
    if not found then
        raise exception 'Notification was not found.' using errcode = 'P0002';
    end if;
    return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.turf_mark_notification_read(bigint) from public, anon;
grant execute on function public.turf_mark_notification_read(bigint) to authenticated;

create or replace function public.turf_claim_email_notifications(p_limit integer default 10)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    claimed_notifications jsonb;
begin
    if auth.role() <> 'service_role' then
        raise exception 'A trusted notification worker is required.' using errcode = '42501';
    end if;
    if p_limit is null or p_limit not between 1 and 25 then
        raise exception 'Notification batch size is invalid.' using errcode = '22023';
    end if;

    with candidates as (
        select outbox.id
          from public.turf_notification_outbox as outbox
         where outbox.recipient_id is not null
           and outbox.attempt_count < 8
           and (
               (outbox.status in ('queued', 'failed') and outbox.next_attempt_at <= pg_catalog.now())
               or (outbox.status = 'processing'
                   and outbox.processing_started_at < pg_catalog.now() - interval '15 minutes')
           )
         order by outbox.next_attempt_at, outbox.id
         limit p_limit
         for update skip locked
    ), claimed as (
        update public.turf_notification_outbox as outbox
           set status = 'processing',
               processing_started_at = pg_catalog.now(),
               attempt_count = outbox.attempt_count + 1
          from candidates
         where outbox.id = candidates.id
        returning outbox.id, outbox.recipient_id, outbox.booking_id,
                  outbox.event_type, outbox.idempotency_key
    )
    select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
            'id', claimed.id,
            'recipient_id', claimed.recipient_id,
            'email', auth_user.email,
            'idempotency_key', claimed.idempotency_key,
            'title', notification.title,
            'body', notification.body,
            'href', notification.href
        ) order by claimed.id
    ), '[]'::jsonb)
      into claimed_notifications
      from claimed
      left join auth.users as auth_user on auth_user.id = claimed.recipient_id
      left join public.turf_notifications as notification
        on notification.idempotency_key = claimed.idempotency_key;

    return claimed_notifications;
end;
$$;

revoke all on function public.turf_claim_email_notifications(integer) from public, anon, authenticated;
grant execute on function public.turf_claim_email_notifications(integer) to service_role;

create or replace function public.turf_finish_email_notification(
    p_notification_id bigint,
    p_success boolean,
    p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.role() <> 'service_role' then
        raise exception 'A trusted notification worker is required.' using errcode = '42501';
    end if;
    if p_notification_id is null or p_success is null
       or (p_error is not null and char_length(p_error) > 500) then
        raise exception 'Notification result is invalid.' using errcode = '22023';
    end if;
    update public.turf_notification_outbox
       set status = case when p_success then 'sent' else 'failed' end,
           sent_at = case when p_success then pg_catalog.now() else null end,
           last_error = case when p_success then null else coalesce(p_error, 'Email delivery failed.') end,
           next_attempt_at = case when p_success then next_attempt_at
               else pg_catalog.now() + pg_catalog.make_interval(
                   mins => least(1440, (pg_catalog.power(2, attempt_count))::integer)
               ) end,
           processing_started_at = null
     where id = p_notification_id and status = 'processing';
    if not found then
        raise exception 'Notification is not being processed.' using errcode = '55000';
    end if;
    return pg_catalog.jsonb_build_object('ok', true, 'status', case when p_success then 'sent' else 'failed' end);
end;
$$;

revoke all on function public.turf_finish_email_notification(bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.turf_finish_email_notification(bigint, boolean, text) to service_role;

commit;
