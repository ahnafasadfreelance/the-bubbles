begin;

create sequence public.turf_booking_reference_seq start with 1000;
revoke all on sequence public.turf_booking_reference_seq from public, anon, authenticated;

create table public.turf_staff_memberships (
    user_id uuid primary key references auth.users(id) on delete restrict,
    role text not null check (role in ('full_admin', 'turf_manager')),
    status text not null default 'active' check (status in ('active', 'deactivated')),
    assigned_by uuid references auth.users(id) on delete set null,
    assigned_at timestamptz not null default pg_catalog.now(),
    updated_at timestamptz not null default pg_catalog.now()
);

create table public.turf_audit_logs (
    id bigint generated always as identity primary key,
    actor_id uuid references auth.users(id) on delete set null,
    action text not null,
    entity_type text not null,
    entity_id text,
    reason text,
    details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
    created_at timestamptz not null default pg_catalog.now()
);

create index turf_audit_logs_created_idx on public.turf_audit_logs (created_at desc, id desc);

create table public.turf_settings (
    id boolean primary key default true check (id),
    currency text not null default 'BDT' check (currency = 'BDT'),
    business_timezone text not null default 'Asia/Dhaka' check (business_timezone = 'Asia/Dhaka'),
    advance_amount numeric(12, 2) not null default 1000 check (advance_amount >= 0),
    buffer_minutes integer not null default 15 check (buffer_minutes = 15),
    minimum_duration_minutes integer not null default 60 check (minimum_duration_minutes between 15 and 720),
    duration_increment_minutes integer not null default 30 check (duration_increment_minutes between 15 and 720),
    booking_horizon_days integer not null default 30 check (booking_horizon_days between 1 and 365),
    request_hold_minutes integer not null default 30 check (request_hold_minutes between 5 and 1440),
    payment_deadline_hours integer not null default 12 check (payment_deadline_hours between 1 and 720),
    hourly_rate numeric(12, 2) not null default 0 check (hourly_rate >= 0),
    minimum_players integer not null default 2 check (minimum_players between 1 and 100),
    maximum_players integer not null default 14 check (maximum_players between minimum_players and 100),
    no_show_grace_minutes integer not null default 15 check (no_show_grace_minutes between 0 and 240),
    booking_enabled boolean not null default false,
    updated_by uuid references auth.users(id) on delete set null,
    updated_at timestamptz not null default pg_catalog.now()
);

insert into public.turf_settings (id) values (true);

create table public.turf_operating_hours (
    weekday smallint primary key check (weekday between 0 and 6),
    is_closed boolean not null default true,
    opens_at time,
    closes_at time,
    updated_by uuid references auth.users(id) on delete set null,
    updated_at timestamptz not null default pg_catalog.now(),
    constraint turf_operating_hours_valid_range check (
        (is_closed and opens_at is null and closes_at is null)
        or (not is_closed and opens_at is not null and closes_at is not null and opens_at < closes_at)
    )
);

insert into public.turf_operating_hours (weekday)
select day_number from generate_series(0, 6) as day_number;

create table public.turf_special_hours (
    local_date date primary key,
    is_closed boolean not null default true,
    opens_at time,
    closes_at time,
    reason text not null check (char_length(pg_catalog.btrim(reason)) between 1 and 500),
    created_by uuid references auth.users(id) on delete set null,
    updated_at timestamptz not null default pg_catalog.now(),
    constraint turf_special_hours_valid_range check (
        (is_closed and opens_at is null and closes_at is null)
        or (not is_closed and opens_at is not null and closes_at is not null and opens_at < closes_at)
    )
);

create table public.turf_fixed_slots (
    id uuid primary key default gen_random_uuid(),
    label text not null check (char_length(pg_catalog.btrim(label)) between 1 and 100),
    starts_at time not null,
    ends_at time not null,
    price numeric(12, 2) not null check (price > 0),
    is_active boolean not null default true,
    created_by uuid references auth.users(id) on delete set null,
    updated_at timestamptz not null default pg_catalog.now(),
    check (starts_at < ends_at),
    unique (starts_at, ends_at)
);

create table public.turf_policy_versions (
    id bigint generated always as identity primary key,
    version integer not null unique check (version > 0),
    content text not null check (char_length(pg_catalog.btrim(content)) between 20 and 20000),
    effective_at timestamptz not null,
    published_by uuid not null references auth.users(id) on delete restrict,
    published_at timestamptz not null default pg_catalog.now()
);

create table public.turf_blocked_periods (
    id uuid primary key default gen_random_uuid(),
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    reason text not null check (char_length(pg_catalog.btrim(reason)) between 1 and 500),
    status text not null default 'active' check (status in ('active', 'resolved')),
    created_by uuid not null references auth.users(id) on delete restrict,
    resolved_by uuid references auth.users(id) on delete set null,
    resolved_at timestamptz,
    created_at timestamptz not null default pg_catalog.now(),
    check (starts_at < ends_at),
    check ((status = 'active' and resolved_at is null) or (status = 'resolved' and resolved_at is not null))
);

create index turf_blocked_periods_range_idx on public.turf_blocked_periods (starts_at, ends_at)
    where status = 'active';

create table public.turf_bookings (
    id uuid primary key default gen_random_uuid(),
    reference text not null unique,
    access_token_hash text not null,
    customer_id uuid not null references auth.users(id) on delete restrict,
    created_by uuid references auth.users(id) on delete set null,
    source text not null default 'online' check (source in ('online', 'manual')),
    customer_name text not null check (char_length(pg_catalog.btrim(customer_name)) between 1 and 200),
    customer_phone text not null check (customer_phone ~ '^[+0-9][0-9 ()-]{7,24}$'),
    player_count integer not null check (player_count between 1 and 100),
    customer_note text check (customer_note is null or char_length(customer_note) <= 2000),
    booking_mode text not null check (booking_mode in ('hourly', 'fixed')),
    fixed_slot_id uuid references public.turf_fixed_slots(id) on delete restrict,
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    status text not null default 'pending' check (status in (
        'pending', 'approved_awaiting_payment', 'payment_under_review',
        'confirmed', 'rejected', 'cancelled', 'completed', 'no_show', 'expired'
    )),
    request_hold_until timestamptz not null,
    overdue boolean not null default false,
    policy_version_id bigint not null references public.turf_policy_versions(id) on delete restrict,
    policy_accepted_at timestamptz not null,
    base_price numeric(12, 2) not null check (base_price >= 0),
    adjustment_amount numeric(12, 2) not null default 0,
    final_price numeric(12, 2) not null check (final_price >= 0),
    required_advance numeric(12, 2) not null check (required_advance >= 0),
    currency text not null default 'BDT' check (currency = 'BDT'),
    price_locked_at timestamptz,
    payment_deadline timestamptz,
    created_at timestamptz not null default pg_catalog.now(),
    updated_at timestamptz not null default pg_catalog.now(),
    check (starts_at < ends_at),
    check (final_price = base_price + adjustment_amount),
    check ((booking_mode = 'hourly' and fixed_slot_id is null) or (booking_mode = 'fixed' and fixed_slot_id is not null)),
    check (policy_accepted_at <= created_at)
);

create index turf_bookings_customer_idx on public.turf_bookings (customer_id, starts_at desc);
create index turf_bookings_status_start_idx on public.turf_bookings (status, starts_at);
create index turf_bookings_reference_idx on public.turf_bookings (reference);
create index turf_bookings_review_idx on public.turf_bookings (overdue desc, request_hold_until, created_at)
    where status = 'pending';

create table public.turf_payment_submissions (
    id uuid primary key default gen_random_uuid(),
    booking_id uuid not null references public.turf_bookings(id) on delete restrict,
    customer_id uuid not null references auth.users(id) on delete restrict,
    payment_method text not null check (payment_method in ('bkash', 'nagad', 'rocket', 'bank_transfer', 'other')),
    transaction_reference text not null check (
        char_length(pg_catalog.btrim(transaction_reference)) between 1 and 200
    ),
    idempotency_key uuid not null unique,
    amount numeric(12, 2) not null check (amount > 0),
    screenshot_path text check (screenshot_path is null or screenshot_path !~ '^https?://'),
    note text check (note is null or char_length(note) <= 2000),
    status text not null default 'submitted' check (status in ('submitted', 'verified', 'rejected', 'duplicate_flagged')),
    duplicate_of uuid references public.turf_payment_submissions(id) on delete restrict,
    submitted_at timestamptz not null default pg_catalog.now(),
    reviewed_by uuid references auth.users(id) on delete set null,
    reviewed_at timestamptz,
    review_reason text,
    check ((status = 'submitted' and reviewed_at is null) or status <> 'submitted')
);

create index turf_payment_reference_idx
    on public.turf_payment_submissions (payment_method, pg_catalog.lower(transaction_reference));
create index turf_payment_submissions_review_idx
    on public.turf_payment_submissions (status, submitted_at);
create index turf_payment_submissions_booking_idx
    on public.turf_payment_submissions (booking_id, submitted_at);

create table public.turf_payment_ledger (
    id uuid primary key default gen_random_uuid(),
    booking_id uuid not null references public.turf_bookings(id) on delete restrict,
    submission_id uuid unique references public.turf_payment_submissions(id) on delete restrict,
    amount numeric(12, 2) not null check (amount > 0),
    payment_method text not null,
    reference text,
    entry_type text not null check (entry_type in ('advance', 'balance', 'refund', 'adjustment', 'reversal')),
    status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
    recorded_by uuid references auth.users(id) on delete set null,
    verified_by uuid references auth.users(id) on delete set null,
    reason text,
    created_at timestamptz not null default pg_catalog.now(),
    verified_at timestamptz
);

create index turf_payment_ledger_booking_idx on public.turf_payment_ledger (booking_id, created_at);

create table public.turf_payment_methods (
    method text primary key check (method in ('bkash', 'nagad', 'rocket', 'bank_transfer', 'other')),
    display_name text not null check (char_length(pg_catalog.btrim(display_name)) between 1 and 100),
    account_details text not null check (char_length(pg_catalog.btrim(account_details)) between 1 and 500),
    account_type text not null check (char_length(pg_catalog.btrim(account_type)) between 1 and 100),
    instructions text not null check (char_length(pg_catalog.btrim(instructions)) between 1 and 2000),
    is_active boolean not null default true,
    updated_by uuid references auth.users(id) on delete set null,
    updated_at timestamptz not null default pg_catalog.now()
);

create table public.turf_notification_outbox (
    id bigint generated always as identity primary key,
    booking_id uuid references public.turf_bookings(id) on delete set null,
    recipient_id uuid references auth.users(id) on delete set null,
    event_type text not null,
    idempotency_key text not null unique,
    payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
    status text not null default 'queued' check (status in ('queued', 'processing', 'sent', 'failed')),
    attempt_count integer not null default 0 check (attempt_count >= 0),
    next_attempt_at timestamptz not null default pg_catalog.now(),
    last_error text,
    created_at timestamptz not null default pg_catalog.now(),
    sent_at timestamptz
);

create index turf_notification_outbox_queue_idx
    on public.turf_notification_outbox (next_attempt_at, id)
    where status in ('queued', 'failed');

create or replace function private.turf_staff_has_role()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.turf_staff_memberships as membership
        where membership.user_id = auth.uid()
          and membership.status = 'active'
    );
$$;

revoke all on function private.turf_staff_has_role() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.turf_staff_has_role() to authenticated, service_role;

create or replace function public.turf_current_staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select membership.role
    from public.turf_staff_memberships as membership
    where membership.user_id = auth.uid()
      and membership.status = 'active';
$$;

revoke all on function public.turf_current_staff_role() from public, anon;
grant execute on function public.turf_current_staff_role() to authenticated;

alter table public.turf_staff_memberships enable row level security;
alter table public.turf_audit_logs enable row level security;
alter table public.turf_settings enable row level security;
alter table public.turf_operating_hours enable row level security;
alter table public.turf_special_hours enable row level security;
alter table public.turf_fixed_slots enable row level security;
alter table public.turf_policy_versions enable row level security;
alter table public.turf_blocked_periods enable row level security;
alter table public.turf_bookings enable row level security;
alter table public.turf_payment_submissions enable row level security;
alter table public.turf_payment_ledger enable row level security;
alter table public.turf_payment_methods enable row level security;
alter table public.turf_notification_outbox enable row level security;

revoke all on public.turf_staff_memberships, public.turf_audit_logs, public.turf_settings,
    public.turf_operating_hours, public.turf_special_hours, public.turf_fixed_slots,
    public.turf_policy_versions, public.turf_blocked_periods, public.turf_bookings,
    public.turf_payment_submissions, public.turf_payment_ledger,
    public.turf_payment_methods, public.turf_notification_outbox from public, anon, authenticated;
grant select on public.turf_staff_memberships, public.turf_audit_logs, public.turf_settings,
    public.turf_operating_hours, public.turf_special_hours, public.turf_fixed_slots,
    public.turf_policy_versions, public.turf_blocked_periods, public.turf_bookings,
    public.turf_payment_submissions, public.turf_payment_ledger to authenticated;
grant select on public.turf_payment_methods to authenticated;
grant all on public.turf_staff_memberships, public.turf_audit_logs, public.turf_settings,
    public.turf_operating_hours, public.turf_special_hours, public.turf_fixed_slots,
    public.turf_policy_versions, public.turf_blocked_periods, public.turf_bookings,
    public.turf_payment_submissions, public.turf_payment_ledger,
    public.turf_payment_methods, public.turf_notification_outbox to service_role;

create policy "Turf staff can read turf staff memberships"
    on public.turf_staff_memberships for select to authenticated
    using (private.turf_staff_has_role() or user_id = (select auth.uid()));
create policy "Turf staff can read turf audit logs"
    on public.turf_audit_logs for select to authenticated using (private.turf_staff_has_role());
create policy "Turf staff can read turf settings"
    on public.turf_settings for select to authenticated using (private.turf_staff_has_role());
create policy "Turf staff can read turf hours"
    on public.turf_operating_hours for select to authenticated using (private.turf_staff_has_role());
create policy "Turf staff can read turf special hours"
    on public.turf_special_hours for select to authenticated using (private.turf_staff_has_role());
create policy "Turf staff can read turf fixed slots"
    on public.turf_fixed_slots for select to authenticated using (private.turf_staff_has_role());
create policy "Authenticated users can read published turf policies"
    on public.turf_policy_versions for select to authenticated
    using (effective_at <= pg_catalog.now() or private.turf_staff_has_role());
create policy "Turf staff can read turf closures"
    on public.turf_blocked_periods for select to authenticated using (private.turf_staff_has_role());
create policy "Customers and turf staff can read turf bookings"
    on public.turf_bookings for select to authenticated
    using (customer_id = (select auth.uid()) or private.turf_staff_has_role());
create policy "Customers and turf staff can read turf payment submissions"
    on public.turf_payment_submissions for select to authenticated
    using (customer_id = (select auth.uid()) or private.turf_staff_has_role());
create policy "Turf staff can read turf payment ledger"
    on public.turf_payment_ledger for select to authenticated using (private.turf_staff_has_role());
create policy "Turf staff can read payment method settings"
    on public.turf_payment_methods for select to authenticated using (private.turf_staff_has_role());

create or replace function private.prevent_turf_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    raise exception 'Turf audit and financial history is append-only.'
        using errcode = '42501';
end;
$$;

revoke all on function private.prevent_turf_history_mutation() from public, anon, authenticated;
create trigger turf_audit_logs_immutable
    before update or delete on public.turf_audit_logs
    for each row execute function private.prevent_turf_history_mutation();
create trigger turf_payment_ledger_immutable
    before update or delete on public.turf_payment_ledger
    for each row execute function private.prevent_turf_history_mutation();

create or replace function public.turf_create_booking_request(
    p_starts_at timestamptz,
    p_ends_at timestamptz,
    p_booking_mode text,
    p_customer_name text,
    p_customer_phone text,
    p_player_count integer,
    p_customer_note text,
    p_policy_version_id bigint,
    p_policy_accepted boolean,
    p_fixed_slot_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    settings_row public.turf_settings%rowtype;
    customer_user_id uuid := auth.uid();
    local_start timestamp;
    local_end timestamp;
    local_day date;
    weekday_number smallint;
    open_time time;
    close_time time;
    closed_day boolean;
    calculated_price numeric(12, 2);
    reference_value text;
    new_booking_id uuid;
    current_policy_id bigint;
    access_token text := gen_random_uuid()::text || gen_random_uuid()::text;
    required_advance_amount numeric(12, 2);
begin
    if customer_user_id is null or auth.role() <> 'authenticated'
       or not exists (
           select 1
           from auth.users as auth_user
           where auth_user.id = customer_user_id
             and auth_user.email_confirmed_at is not null
             and auth_user.raw_app_meta_data ->> 'provider' = 'google'
       ) then
        raise exception 'Sign in with your customer account to request a booking.' using errcode = '42501';
    end if;
    if p_starts_at is null or p_ends_at is null or p_starts_at >= p_ends_at
       or p_booking_mode is null or p_booking_mode not in ('hourly', 'fixed')
       or p_customer_name is null or char_length(pg_catalog.btrim(p_customer_name)) not between 1 and 200
       or p_customer_phone is null or p_customer_phone !~ '^[+0-9][0-9 ()-]{7,24}$'
       or p_player_count is null or p_policy_accepted is distinct from true
       or (p_customer_note is not null and char_length(p_customer_note) > 2000) then
        raise exception 'Booking details are invalid or the current policy was not accepted.' using errcode = '22023';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(19780011, 1);
    select * into strict settings_row from public.turf_settings where id = true;
    if not settings_row.booking_enabled then
        raise exception 'Turf booking is not available yet.' using errcode = '55000';
    end if;

    if p_player_count < settings_row.minimum_players or p_player_count > settings_row.maximum_players then
        raise exception 'Player count is outside the configured limits.' using errcode = '22023';
    end if;

    if p_starts_at <= pg_catalog.now()
       or p_starts_at > pg_catalog.now() + pg_catalog.make_interval(days => settings_row.booking_horizon_days) then
        raise exception 'Requested time is outside the booking horizon.' using errcode = '22023';
    end if;

    if mod(extract(epoch from (p_ends_at - p_starts_at)), 60) <> 0
       or p_ends_at - p_starts_at < pg_catalog.make_interval(mins => settings_row.minimum_duration_minutes)
       or (p_booking_mode = 'hourly'
           and pg_catalog.mod(
               extract(epoch from (p_ends_at - p_starts_at)) / 60
                   - settings_row.minimum_duration_minutes,
               settings_row.duration_increment_minutes
           ) <> 0) then
        raise exception 'Requested duration does not meet turf booking rules.' using errcode = '22023';
    end if;

    local_start := p_starts_at at time zone 'Asia/Dhaka';
    local_end := p_ends_at at time zone 'Asia/Dhaka';
    local_day := local_start::date;
    if local_end::date <> local_day then
        raise exception 'Bookings must begin and end on the same business date.' using errcode = '22023';
    end if;

    select extract(dow from local_day)::smallint into weekday_number;
    select hours.is_closed, hours.opens_at, hours.closes_at
      into closed_day, open_time, close_time
      from public.turf_operating_hours as hours
     where hours.weekday = weekday_number;
    if exists (select 1 from public.turf_special_hours as special where special.local_date = local_day) then
        select special.is_closed, special.opens_at, special.closes_at
          into closed_day, open_time, close_time
          from public.turf_special_hours as special
         where special.local_date = local_day;
    end if;

    if closed_day is distinct from false or local_start::time < open_time or local_end::time > close_time then
        raise exception 'Requested time is outside turf operating hours.' using errcode = '22023';
    end if;
    if p_booking_mode = 'hourly'
       and pg_catalog.mod(
           extract(epoch from (local_start::time - open_time)),
           settings_row.duration_increment_minutes * 60
       ) <> 0 then
        raise exception 'Start time does not match the configured hourly increments.' using errcode = '22023';
    end if;

    if p_booking_mode = 'fixed' then
        select slot.price into calculated_price
          from public.turf_fixed_slots as slot
         where slot.id = p_fixed_slot_id and slot.is_active
           and slot.starts_at = local_start::time and slot.ends_at = local_end::time;
        if calculated_price is null then
            raise exception 'Selected fixed slot is not available.' using errcode = '22023';
        end if;
    else
        if p_fixed_slot_id is not null then
            raise exception 'Hourly booking cannot include a fixed slot.' using errcode = '22023';
        end if;
        calculated_price := pg_catalog.round(settings_row.hourly_rate
            * extract(epoch from (p_ends_at - p_starts_at)) / 3600, 2);
    end if;
    if calculated_price is null or calculated_price <= 0 then
        raise exception 'A valid non-zero price is not configured for this booking.' using errcode = '55000';
    end if;
    required_advance_amount := least(settings_row.advance_amount, calculated_price);

    select policy.id into current_policy_id
      from public.turf_policy_versions as policy
     where policy.id = p_policy_version_id
       and policy.id = (
           select current_policy.id
           from public.turf_policy_versions as current_policy
           where current_policy.effective_at <= pg_catalog.now()
           order by current_policy.version desc
           limit 1
       )
     order by policy.version desc
     limit 1;
    if current_policy_id is null then
        raise exception 'The accepted booking policy is not the current published policy.' using errcode = '22023';
    end if;

    if exists (
        select 1 from public.turf_bookings as booking
        where booking.status in ('pending', 'approved_awaiting_payment', 'payment_under_review', 'confirmed')
          and tstzrange(
              booking.starts_at - pg_catalog.make_interval(mins => settings_row.buffer_minutes),
              booking.ends_at + pg_catalog.make_interval(mins => settings_row.buffer_minutes),
              '[)'
          ) && tstzrange(p_starts_at, p_ends_at, '[)')
    ) or exists (
        select 1 from public.turf_blocked_periods as blocked
        where blocked.status = 'active'
          and tstzrange(
              blocked.starts_at - pg_catalog.make_interval(mins => settings_row.buffer_minutes),
              blocked.ends_at + pg_catalog.make_interval(mins => settings_row.buffer_minutes),
              '[)'
          ) && tstzrange(p_starts_at, p_ends_at, '[)')
    ) then
        raise exception 'That time is no longer available. Please select another time.' using errcode = '23P01';
    end if;

    reference_value := 'BB-TURF-' || pg_catalog.nextval('public.turf_booking_reference_seq')::text;
    new_booking_id := gen_random_uuid();

    insert into public.turf_bookings (
        id, reference, access_token_hash, customer_id, customer_name, customer_phone,
        player_count, customer_note, booking_mode, fixed_slot_id, starts_at, ends_at,
        request_hold_until, policy_version_id, policy_accepted_at,
        base_price, final_price, required_advance
    ) values (
        new_booking_id, reference_value, pg_catalog.md5(access_token),
        customer_user_id, pg_catalog.btrim(p_customer_name), pg_catalog.btrim(p_customer_phone),
        p_player_count, nullif(pg_catalog.btrim(p_customer_note), ''), p_booking_mode, p_fixed_slot_id,
        p_starts_at, p_ends_at,
        pg_catalog.now() + pg_catalog.make_interval(mins => settings_row.request_hold_minutes),
        current_policy_id, pg_catalog.now(), calculated_price, calculated_price,
        required_advance_amount
    );

    insert into public.turf_audit_logs (actor_id, action, entity_type, entity_id, details)
    values (
        customer_user_id, 'booking_request_created', 'booking', new_booking_id::text,
        pg_catalog.jsonb_build_object(
            'reference', reference_value, 'starts_at', p_starts_at, 'ends_at', p_ends_at,
            'mode', p_booking_mode, 'price', calculated_price, 'currency', 'BDT'
        )
    );

    insert into public.turf_notification_outbox (
        booking_id, recipient_id, event_type, idempotency_key, payload
    ) values (
        new_booking_id, customer_user_id, 'booking_request_submitted',
        'booking-request:' || new_booking_id::text,
        pg_catalog.jsonb_build_object('reference', reference_value)
    );

    return pg_catalog.jsonb_build_object(
        'booking_id', new_booking_id,
        'reference', reference_value,
        'status', 'pending',
        'price', calculated_price,
        'required_advance', required_advance_amount,
        'tracking_token', access_token,
        'currency', 'BDT'
    );
end;
$$;

revoke all on function public.turf_create_booking_request(
    timestamptz, timestamptz, text, text, text, integer, text, bigint, boolean, uuid
) from public, anon;
grant execute on function public.turf_create_booking_request(
    timestamptz, timestamptz, text, text, text, integer, text, bigint, boolean, uuid
) to authenticated;

create or replace function public.turf_assign_staff(
    p_target_user_id uuid,
    p_role text,
    p_active boolean,
    p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    actor_role text;
    target_email text;
    previous_membership jsonb;
begin
    if actor_id is null or auth.role() <> 'authenticated'
       or p_target_user_id is null or p_target_user_id = actor_id
       or p_role not in ('full_admin', 'turf_manager')
       or p_active is null
       or p_reason is null or char_length(pg_catalog.btrim(p_reason)) not between 3 and 500 then
        raise exception 'Staff assignment details are invalid.' using errcode = '22023';
    end if;

    select membership.role into actor_role
      from public.restaurant_staff_memberships as membership
     where membership.restaurant_id = 1
       and membership.user_id = actor_id
       and membership.status = 'active';
    if actor_role is null or actor_role not in ('owner', 'full_admin')
       or (p_role = 'full_admin' and actor_role <> 'owner') then
        raise exception 'Only an authorized existing restaurant administrator can provision turf staff.'
            using errcode = '42501';
    end if;

    select auth_user.email into target_email
      from auth.users as auth_user
     where auth_user.id = p_target_user_id
       and auth_user.email_confirmed_at is not null
       and auth_user.raw_app_meta_data ->> 'provider' = 'google';
    if target_email is null then
        raise exception 'The staff member must have an existing verified Google-authenticated account.'
            using errcode = '22023';
    end if;

    select pg_catalog.to_jsonb(membership) into previous_membership
      from public.turf_staff_memberships as membership
     where membership.user_id = p_target_user_id;
    insert into public.turf_staff_memberships (user_id, role, status, assigned_by)
    values (p_target_user_id, p_role, case when p_active then 'active' else 'deactivated' end, actor_id)
    on conflict (user_id) do update
       set role = excluded.role, status = excluded.status,
           assigned_by = actor_id, assigned_at = pg_catalog.now(), updated_at = pg_catalog.now();

    insert into public.turf_audit_logs (actor_id, action, entity_type, entity_id, reason, details)
    values (
        actor_id, case when p_active then 'staff_assigned' else 'staff_deactivated' end,
        'staff_membership', p_target_user_id::text,
        pg_catalog.btrim(p_reason),
        pg_catalog.jsonb_build_object(
            'before', previous_membership,
            'after', pg_catalog.jsonb_build_object('role', p_role, 'status', case when p_active then 'active' else 'deactivated' end, 'email', target_email)
        )
    );
    return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.turf_assign_staff(uuid, text, boolean, text) from public, anon;
grant execute on function public.turf_assign_staff(uuid, text, boolean, text) to authenticated;

create or replace function public.turf_review_booking_request(
    p_booking_id uuid,
    p_decision text,
    p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    booking_row public.turf_bookings%rowtype;
    deadline timestamptz;
begin
    if actor_id is null or auth.role() <> 'authenticated' or p_booking_id is null
       or p_decision is null or p_decision not in ('approve', 'reject')
       or (p_decision = 'reject' and char_length(pg_catalog.btrim(coalesce(p_reason, ''))) < 3) then
        raise exception 'Review details are invalid.' using errcode = '22023';
    end if;
    if not exists (
        select 1 from public.turf_staff_memberships as staff
        where staff.user_id = actor_id and staff.status = 'active'
    ) then
        raise exception 'Turf staff access is required.' using errcode = '42501';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(19780011, 1);
    select * into booking_row from public.turf_bookings
     where id = p_booking_id for update;
    if not found or booking_row.status <> 'pending' then
        raise exception 'Booking request is no longer awaiting review.' using errcode = '55000';
    end if;

    if p_decision = 'approve' then
        deadline := pg_catalog.now()
            + pg_catalog.make_interval(hours => (select payment_deadline_hours from public.turf_settings where id = true));
        update public.turf_bookings
           set status = 'approved_awaiting_payment',
               price_locked_at = pg_catalog.now(),
               payment_deadline = deadline,
               updated_at = pg_catalog.now()
         where id = p_booking_id;
    else
        update public.turf_bookings
           set status = 'rejected', updated_at = pg_catalog.now()
         where id = p_booking_id;
    end if;

    insert into public.turf_audit_logs (actor_id, action, entity_type, entity_id, reason, details)
    values (
        actor_id, 'booking_' || p_decision, 'booking', p_booking_id::text,
        nullif(pg_catalog.btrim(p_reason), ''),
        pg_catalog.jsonb_build_object('from', booking_row.status, 'to',
            case when p_decision = 'approve' then 'approved_awaiting_payment' else 'rejected' end,
            'payment_deadline', deadline)
    );
    insert into public.turf_notification_outbox (
        booking_id, recipient_id, event_type, idempotency_key, payload
    ) values (
        p_booking_id, booking_row.customer_id, 'booking_' || p_decision,
        'booking-review:' || p_booking_id::text || ':' || p_decision,
        pg_catalog.jsonb_build_object('reference', booking_row.reference, 'reason', p_reason)
    );
    return pg_catalog.jsonb_build_object(
        'ok', true, 'status', case when p_decision = 'approve' then 'approved_awaiting_payment' else 'rejected' end
    );
end;
$$;

revoke all on function public.turf_review_booking_request(uuid, text, text) from public, anon;
grant execute on function public.turf_review_booking_request(uuid, text, text) to authenticated;

create or replace function public.turf_public_day(p_local_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    settings_row public.turf_settings%rowtype;
    local_open time;
    local_close time;
    closed_day boolean;
    blocker_list jsonb;
    slot_list jsonb;
    policy_data jsonb;
    method_list jsonb;
begin
    if p_local_date is null then
        raise exception 'A local date is required.' using errcode = '22023';
    end if;
    select * into strict settings_row from public.turf_settings where id = true;
    if p_local_date < (pg_catalog.now() at time zone 'Asia/Dhaka')::date
       or p_local_date > (pg_catalog.now() at time zone 'Asia/Dhaka')::date + settings_row.booking_horizon_days then
        raise exception 'Requested date is outside the public booking horizon.' using errcode = '22023';
    end if;

    select hours.is_closed, hours.opens_at, hours.closes_at
      into closed_day, local_open, local_close
      from public.turf_operating_hours as hours
     where hours.weekday = extract(dow from p_local_date)::smallint;
    if exists (select 1 from public.turf_special_hours as special where special.local_date = p_local_date) then
        select special.is_closed, special.opens_at, special.closes_at
          into closed_day, local_open, local_close
          from public.turf_special_hours as special
         where special.local_date = p_local_date;
    end if;

    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'starts_at', pg_catalog.lower(blockers.blocked_range),
        'ends_at', pg_catalog.upper(blockers.blocked_range),
        'kind', blockers.kind
    )), '[]'::jsonb)
      into blocker_list
      from (
          select tstzrange(
              booking.starts_at - pg_catalog.make_interval(mins => settings_row.buffer_minutes),
              booking.ends_at + pg_catalog.make_interval(mins => settings_row.buffer_minutes),
              '[)'
          ) as blocked_range, 'booked'::text as kind
          from public.turf_bookings as booking
          where booking.status in ('pending', 'approved_awaiting_payment', 'payment_under_review', 'confirmed')
            and (booking.starts_at at time zone 'Asia/Dhaka')::date = p_local_date
          union all
          select tstzrange(
              blocked.starts_at - pg_catalog.make_interval(mins => settings_row.buffer_minutes),
              blocked.ends_at + pg_catalog.make_interval(mins => settings_row.buffer_minutes),
              '[)'
          ), 'unavailable'
          from public.turf_blocked_periods as blocked
          where blocked.status = 'active'
            and (blocked.starts_at at time zone 'Asia/Dhaka')::date <= p_local_date
            and (blocked.ends_at at time zone 'Asia/Dhaka')::date >= p_local_date
      ) as blockers;

    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', slot.id, 'label', slot.label, 'starts_at', slot.starts_at,
        'ends_at', slot.ends_at, 'price', slot.price
    ) order by slot.starts_at), '[]'::jsonb)
      into slot_list
      from public.turf_fixed_slots as slot
     where slot.is_active
       and not coalesce(closed_day, true)
       and slot.starts_at >= local_open
       and slot.ends_at <= local_close;

    select pg_catalog.jsonb_build_object(
        'id', policy.id,
        'version', policy.version,
        'content', policy.content,
        'effective_at', policy.effective_at
    ) into policy_data
      from public.turf_policy_versions as policy
     where policy.effective_at <= pg_catalog.now()
     order by policy.version desc
     limit 1;

    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'method', method.method,
        'display_name', method.display_name,
        'account_details', method.account_details,
        'account_type', method.account_type,
        'instructions', method.instructions
    ) order by method.display_name), '[]'::jsonb)
      into method_list
      from public.turf_payment_methods as method
     where method.is_active;

    return pg_catalog.jsonb_build_object(
        'local_date', p_local_date,
        'is_open', not coalesce(closed_day, true),
        'opens_at', local_open,
        'closes_at', local_close,
        'booking_enabled', settings_row.booking_enabled,
        'hourly_rate', settings_row.hourly_rate,
        'minimum_duration_minutes', settings_row.minimum_duration_minutes,
        'duration_increment_minutes', settings_row.duration_increment_minutes,
        'minimum_players', settings_row.minimum_players,
        'maximum_players', settings_row.maximum_players,
        'advance_amount', settings_row.advance_amount,
        'blocked_ranges', blocker_list,
        'fixed_slots', slot_list,
        'payment_methods', method_list,
        'policy', coalesce(policy_data, 'null'::jsonb)
    );
end;
$$;

revoke all on function public.turf_public_day(date) from public;
grant execute on function public.turf_public_day(date) to anon, authenticated;

create or replace function public.turf_public_week(p_first_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    day_data jsonb := '[]'::jsonb;
    day_offset integer;
    last_date date;
begin
    if p_first_date is null then
        raise exception 'A local date is required.' using errcode = '22023';
    end if;
    last_date := least(
        p_first_date + 6,
        (pg_catalog.now() at time zone 'Asia/Dhaka')::date + (
            select booking_horizon_days from public.turf_settings where id = true
        )
    );
    if p_first_date < (pg_catalog.now() at time zone 'Asia/Dhaka')::date
       or p_first_date > last_date then
        raise exception 'Requested date is outside the public booking horizon.' using errcode = '22023';
    end if;
    for day_offset in 0..(last_date - p_first_date) loop
        day_data := day_data || pg_catalog.jsonb_build_array(
            public.turf_public_day(p_first_date + day_offset)
        );
    end loop;
    return pg_catalog.jsonb_build_object('days', day_data);
end;
$$;

revoke all on function public.turf_public_week(date) from public;
grant execute on function public.turf_public_week(date) to anon, authenticated;

create or replace function public.turf_get_booking_tracking(
    p_reference text,
    p_tracking_token text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    booking_row public.turf_bookings%rowtype;
    payment_summary jsonb;
    timeline jsonb;
begin
    if p_reference is null or char_length(p_reference) > 64 then
        return null;
    end if;

    select * into booking_row
      from public.turf_bookings as booking
     where booking.reference = p_reference
       and (
           booking.customer_id = auth.uid()
           or (p_tracking_token is not null and pg_catalog.md5(p_tracking_token) = booking.access_token_hash)
       );
    if not found then
        return null;
    end if;

    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'amount', submission.amount,
        'method', submission.payment_method,
        'status', submission.status,
        'submitted_at', submission.submitted_at,
        'reviewed_at', submission.reviewed_at,
        'review_reason', submission.review_reason
    ) order by submission.submitted_at), '[]'::jsonb)
      into payment_summary
      from public.turf_payment_submissions as submission
     where submission.booking_id = booking_row.id
       and submission.customer_id = booking_row.customer_id;

    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'action', log.action,
        'reason', log.reason,
        'created_at', log.created_at
    ) order by log.created_at), '[]'::jsonb)
      into timeline
      from public.turf_audit_logs as log
     where log.entity_type = 'booking'
       and log.entity_id = booking_row.id::text;

    return pg_catalog.jsonb_build_object(
        'id', booking_row.id,
        'reference', booking_row.reference,
        'starts_at', booking_row.starts_at,
        'ends_at', booking_row.ends_at,
        'booking_mode', booking_row.booking_mode,
        'status', booking_row.status,
        'customer_name', booking_row.customer_name,
        'customer_phone', booking_row.customer_phone,
        'price', booking_row.final_price,
        'required_advance', booking_row.required_advance,
        'currency', booking_row.currency,
        'payment_deadline', booking_row.payment_deadline,
        'policy_version', (
            select policy.version from public.turf_policy_versions as policy
            where policy.id = booking_row.policy_version_id
        ),
        'policy_content', (
            select policy.content from public.turf_policy_versions as policy
            where policy.id = booking_row.policy_version_id
        ),
        'payment_methods', (
            select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                'method', method.method,
                'display_name', method.display_name,
                'account_details', method.account_details,
                'account_type', method.account_type,
                'instructions', method.instructions
            ) order by method.display_name), '[]'::jsonb)
            from public.turf_payment_methods as method
            where method.is_active
        ),
        'payments', payment_summary,
        'timeline', timeline
    );
end;
$$;

revoke all on function public.turf_get_booking_tracking(text, text) from public;
grant execute on function public.turf_get_booking_tracking(text, text) to anon, authenticated;

create or replace function public.turf_customer_bookings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    customer_id uuid := auth.uid();
    booking_list jsonb;
begin
    if customer_id is null or auth.role() <> 'authenticated' then
        raise exception 'Sign in to view your turf bookings.' using errcode = '42501';
    end if;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'reference', booking.reference,
        'starts_at', booking.starts_at,
        'ends_at', booking.ends_at,
        'booking_mode', booking.booking_mode,
        'status', booking.status,
        'price', booking.final_price,
        'required_advance', booking.required_advance,
        'currency', booking.currency,
        'payment_deadline', booking.payment_deadline,
        'is_past', booking.ends_at < pg_catalog.now(),
        'created_at', booking.created_at
    ) order by booking.starts_at desc), '[]'::jsonb)
      into booking_list
      from public.turf_bookings as booking
     where booking.customer_id = customer_id;
    return pg_catalog.jsonb_build_object('bookings', booking_list);
end;
$$;

revoke all on function public.turf_customer_bookings() from public, anon;
grant execute on function public.turf_customer_bookings() to authenticated;

create or replace function public.turf_submit_advance_payment(
    p_booking_id uuid,
    p_payment_method text,
    p_transaction_reference text,
    p_amount numeric,
    p_note text,
    p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    booking_row public.turf_bookings%rowtype;
    duplicate_id uuid;
    payment_id uuid;
    new_status text;
begin
    if actor_id is null or auth.role() <> 'authenticated'
       or p_booking_id is null or p_payment_method is null or p_transaction_reference is null
       or char_length(pg_catalog.btrim(p_transaction_reference)) not between 1 and 200
       or p_amount is null or p_amount <= 0
       or (p_note is not null and char_length(p_note) > 2000)
       or p_idempotency_key is null then
        raise exception 'Payment submission details are invalid.' using errcode = '22023';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(19780011, 1);
    select * into booking_row from public.turf_bookings as booking
     where booking.id = p_booking_id and booking.customer_id = actor_id
     for update;
    if not found or booking_row.status <> 'approved_awaiting_payment'
       or booking_row.payment_deadline < pg_catalog.now() then
        raise exception 'This booking cannot accept an advance payment submission.' using errcode = '55000';
    end if;
    if not exists (
        select 1 from public.turf_payment_methods as method
        where method.method = p_payment_method and method.is_active
    ) then
        raise exception 'Selected payment method is not enabled.' using errcode = '22023';
    end if;
    if exists (
        select 1 from public.turf_payment_submissions as existing
        where existing.idempotency_key = p_idempotency_key
    ) then
        select existing.id, existing.status into payment_id, new_status
          from public.turf_payment_submissions as existing
         where existing.idempotency_key = p_idempotency_key;
        return pg_catalog.jsonb_build_object('ok', true, 'payment_id', payment_id, 'status', new_status);
    end if;

    if p_amount > booking_row.required_advance - coalesce((
        select pg_catalog.sum(ledger.amount)
        from public.turf_payment_ledger as ledger
        where ledger.booking_id = p_booking_id and ledger.entry_type = 'advance' and ledger.status = 'verified'
    ), 0) then
        raise exception 'Submitted amount exceeds the outstanding advance.' using errcode = '22023';
    end if;

    select existing.id into duplicate_id
      from public.turf_payment_submissions as existing
     where existing.payment_method = p_payment_method
       and pg_catalog.lower(existing.transaction_reference) = pg_catalog.lower(pg_catalog.btrim(p_transaction_reference))
     order by existing.submitted_at
     limit 1;

    payment_id := gen_random_uuid();
    new_status := case when duplicate_id is null then 'submitted' else 'duplicate_flagged' end;
    insert into public.turf_payment_submissions (
        id, booking_id, customer_id, payment_method, transaction_reference,
        idempotency_key, amount, note, status, duplicate_of
    ) values (
        payment_id, p_booking_id, actor_id, p_payment_method,
        pg_catalog.btrim(p_transaction_reference), p_idempotency_key,
        p_amount, nullif(pg_catalog.btrim(p_note), ''), new_status, duplicate_id
    );
    update public.turf_bookings
       set status = 'payment_under_review', updated_at = pg_catalog.now()
     where id = p_booking_id;
    insert into public.turf_audit_logs (actor_id, action, entity_type, entity_id, details)
    values (
        actor_id, 'advance_payment_submitted', 'booking', p_booking_id::text,
        pg_catalog.jsonb_build_object(
            'payment_id', payment_id, 'amount', p_amount,
            'method', p_payment_method, 'duplicate_flagged', duplicate_id is not null
        )
    );
    insert into public.turf_notification_outbox (
        booking_id, recipient_id, event_type, idempotency_key, payload
    ) values (
        p_booking_id, actor_id, 'advance_payment_submitted',
        'payment-submitted:' || payment_id::text,
        pg_catalog.jsonb_build_object('reference', booking_row.reference)
    );
    return pg_catalog.jsonb_build_object(
        'ok', true, 'payment_id', payment_id, 'status', new_status,
        'duplicate_flagged', duplicate_id is not null
    );
end;
$$;

revoke all on function public.turf_submit_advance_payment(uuid, text, text, numeric, text, uuid) from public, anon;
grant execute on function public.turf_submit_advance_payment(uuid, text, text, numeric, text, uuid) to authenticated;

create or replace function public.turf_review_advance_payment(
    p_payment_id uuid,
    p_decision text,
    p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    submission public.turf_payment_submissions%rowtype;
    booking_row public.turf_bookings%rowtype;
    verified_advance numeric(12, 2);
    next_booking_status text;
begin
    if actor_id is null or auth.role() <> 'authenticated'
       or p_payment_id is null or p_decision is null or p_decision not in ('verify', 'reject')
       or (p_decision = 'reject' and char_length(pg_catalog.btrim(coalesce(p_reason, ''))) < 3) then
        raise exception 'Payment review details are invalid.' using errcode = '22023';
    end if;
    if not exists (
        select 1 from public.turf_staff_memberships as staff
        where staff.user_id = actor_id and staff.status = 'active'
    ) then
        raise exception 'Turf staff access is required.' using errcode = '42501';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(19780011, 1);
    select * into submission from public.turf_payment_submissions
     where id = p_payment_id for update;
    if not found then
        raise exception 'Payment submission was not found.' using errcode = 'P0002';
    end if;
    if submission.status in ('verified', 'rejected') then
        return pg_catalog.jsonb_build_object('ok', true, 'status', submission.status, 'idempotent', true);
    end if;
    if submission.status = 'duplicate_flagged' and p_decision = 'verify' then
        raise exception 'Duplicate transaction reference requires investigation before verification.'
            using errcode = '55000';
    end if;
    select * into booking_row from public.turf_bookings
     where id = submission.booking_id for update;
    if booking_row.status <> 'approved_awaiting_payment' and booking_row.status <> 'payment_under_review'
       or booking_row.payment_deadline < pg_catalog.now() then
        raise exception 'Booking is no longer eligible for advance verification.' using errcode = '55000';
    end if;

    if p_decision = 'verify' then
        update public.turf_payment_submissions
           set status = 'verified', reviewed_by = actor_id, reviewed_at = pg_catalog.now(),
               review_reason = nullif(pg_catalog.btrim(p_reason), '')
         where id = p_payment_id;
        insert into public.turf_payment_ledger (
            booking_id, submission_id, amount, payment_method, reference,
            entry_type, status, recorded_by, verified_by, verified_at
        ) values (
            booking_row.id, submission.id, submission.amount, submission.payment_method,
            submission.transaction_reference, 'advance', 'verified',
            submission.customer_id, actor_id, pg_catalog.now()
        ) on conflict (submission_id) do nothing;
        select coalesce(pg_catalog.sum(ledger.amount), 0) into verified_advance
          from public.turf_payment_ledger as ledger
         where ledger.booking_id = booking_row.id
           and ledger.entry_type = 'advance' and ledger.status = 'verified';
        if verified_advance >= booking_row.required_advance then
            next_booking_status := 'confirmed';
        else
            next_booking_status := 'approved_awaiting_payment';
        end if;
    else
        update public.turf_payment_submissions
           set status = 'rejected', reviewed_by = actor_id, reviewed_at = pg_catalog.now(),
               review_reason = pg_catalog.btrim(p_reason)
         where id = p_payment_id;
        next_booking_status := case
            when exists (
                select 1 from public.turf_payment_submissions as other
                where other.booking_id = booking_row.id and other.status in ('submitted', 'duplicate_flagged')
                  and other.id <> p_payment_id
            ) then 'payment_under_review'
            else 'approved_awaiting_payment'
        end;
    end if;

    update public.turf_bookings
       set status = next_booking_status, updated_at = pg_catalog.now()
     where id = booking_row.id;
    insert into public.turf_audit_logs (actor_id, action, entity_type, entity_id, reason, details)
    values (
        actor_id, 'advance_payment_' || p_decision, 'booking', booking_row.id::text,
        nullif(pg_catalog.btrim(p_reason), ''),
        pg_catalog.jsonb_build_object('payment_id', p_payment_id, 'amount', submission.amount, 'status', next_booking_status)
    );
    insert into public.turf_notification_outbox (
        booking_id, recipient_id, event_type, idempotency_key, payload
    ) values (
        booking_row.id, booking_row.customer_id, 'advance_payment_' || p_decision,
        'payment-review:' || p_payment_id::text || ':' || p_decision,
        pg_catalog.jsonb_build_object('reference', booking_row.reference, 'reason', p_reason)
    );
    return pg_catalog.jsonb_build_object('ok', true, 'status', next_booking_status);
end;
$$;

revoke all on function public.turf_review_advance_payment(uuid, text, text) from public, anon;
grant execute on function public.turf_review_advance_payment(uuid, text, text) to authenticated;

create or replace function public.turf_staff_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    staff_role text := public.turf_current_staff_role();
    task_list jsonb;
    booking_list jsonb;
    counts jsonb;
begin
    if staff_role is null then
        raise exception 'Turf staff access is required.' using errcode = '42501';
    end if;

    select coalesce(pg_catalog.jsonb_agg(tasks.task order by tasks.priority, tasks.created_at), '[]'::jsonb)
      into task_list
      from (
          select case when booking.request_hold_until < pg_catalog.now() then 1 else 4 end as priority,
              booking.created_at,
              pg_catalog.jsonb_build_object(
                  'kind', 'booking_review', 'id', booking.id, 'reference', booking.reference,
                  'customer_name', booking.customer_name, 'customer_phone', booking.customer_phone,
                  'status', booking.status, 'starts_at', booking.starts_at, 'ends_at', booking.ends_at,
                  'price', booking.final_price, 'player_count', booking.player_count,
                  'mode', booking.booking_mode, 'overdue', booking.request_hold_until < pg_catalog.now(),
                  'deadline', booking.request_hold_until, 'created_at', booking.created_at
              ) as task
          from public.turf_bookings as booking
          where booking.status = 'pending'
          union all
          select 3, submission.submitted_at,
              pg_catalog.jsonb_build_object(
                  'kind', 'payment_review', 'id', submission.id, 'booking_id', booking.id,
                  'reference', booking.reference, 'customer_name', booking.customer_name,
                  'customer_phone', booking.customer_phone, 'status', submission.status,
                  'amount', submission.amount, 'method', submission.payment_method,
                  'transaction_reference', submission.transaction_reference,
                  'duplicate_of', submission.duplicate_of, 'created_at', submission.submitted_at
              )
          from public.turf_payment_submissions as submission
          join public.turf_bookings as booking on booking.id = submission.booking_id
          where submission.status in ('submitted', 'duplicate_flagged')
          union all
          select 2, booking.payment_deadline,
              pg_catalog.jsonb_build_object(
                  'kind', 'payment_deadline', 'id', booking.id, 'reference', booking.reference,
                  'customer_name', booking.customer_name, 'customer_phone', booking.customer_phone,
                  'status', booking.status, 'deadline', booking.payment_deadline,
                  'price', booking.final_price, 'created_at', booking.created_at
              )
          from public.turf_bookings as booking
          where booking.status = 'approved_awaiting_payment'
            and booking.payment_deadline <= pg_catalog.now() + interval '6 hours'
            and booking.payment_deadline > pg_catalog.now()
      ) as tasks;

    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', booking.id, 'reference', booking.reference,
        'customer_name', booking.customer_name, 'customer_phone', booking.customer_phone,
        'starts_at', booking.starts_at, 'ends_at', booking.ends_at,
        'status', booking.status, 'booking_mode', booking.booking_mode,
        'player_count', booking.player_count, 'price', booking.final_price,
        'advance', booking.required_advance, 'payment_deadline', booking.payment_deadline,
        'source', booking.source, 'created_at', booking.created_at
    ) order by booking.starts_at), '[]'::jsonb)
      into booking_list
      from (
          select *
          from public.turf_bookings as booking
          where booking.starts_at >= pg_catalog.now()
             or booking.created_at >= pg_catalog.now() - interval '30 days'
          order by booking.starts_at
          limit 100
      ) as booking;

    select pg_catalog.jsonb_build_object(
        'today_bookings', (
            select pg_catalog.count(*) from public.turf_bookings as booking
            where (booking.starts_at at time zone 'Asia/Dhaka')::date
                = (pg_catalog.now() at time zone 'Asia/Dhaka')::date
              and booking.status not in ('rejected', 'cancelled', 'expired')
        ),
        'pending_requests', (select pg_catalog.count(*) from public.turf_bookings where status = 'pending'),
        'overdue_requests', (select pg_catalog.count(*) from public.turf_bookings where status = 'pending' and request_hold_until < pg_catalog.now()),
        'payments_awaiting_review', (select pg_catalog.count(*) from public.turf_payment_submissions where status in ('submitted', 'duplicate_flagged')),
        'approaching_payment_deadlines', (
            select pg_catalog.count(*) from public.turf_bookings
            where status = 'approved_awaiting_payment'
              and payment_deadline <= pg_catalog.now() + interval '6 hours'
              and payment_deadline > pg_catalog.now()
        ),
        'upcoming_bookings', (select pg_catalog.count(*) from public.turf_bookings
            where status in ('confirmed', 'approved_awaiting_payment') and starts_at >= pg_catalog.now())
    ) into counts;

    return pg_catalog.jsonb_build_object(
        'role', staff_role,
        'summary', counts,
        'tasks', task_list,
        'bookings', booking_list
    );
end;
$$;

revoke all on function public.turf_staff_dashboard() from public, anon;
grant execute on function public.turf_staff_dashboard() to authenticated;

create or replace function public.turf_staff_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    settings_data jsonb;
    weekly_data jsonb;
    special_data jsonb;
    slots_data jsonb;
    methods_data jsonb;
    policy_data jsonb;
begin
    if public.turf_current_staff_role() is null then
        raise exception 'Turf staff access is required.' using errcode = '42501';
    end if;
    select pg_catalog.to_jsonb(settings) into settings_data
      from public.turf_settings as settings where id = true;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(hours) order by hours.weekday), '[]'::jsonb)
      into weekly_data from public.turf_operating_hours as hours;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(special) order by special.local_date), '[]'::jsonb)
      into special_data from public.turf_special_hours as special
     where special.local_date >= (pg_catalog.now() at time zone 'Asia/Dhaka')::date;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(slot) order by slot.starts_at), '[]'::jsonb)
      into slots_data from public.turf_fixed_slots as slot;
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(method) order by method.display_name), '[]'::jsonb)
      into methods_data from public.turf_payment_methods as method;
    select pg_catalog.to_jsonb(policy) into policy_data
      from public.turf_policy_versions as policy
     where policy.effective_at <= pg_catalog.now()
     order by policy.version desc
     limit 1;
    return pg_catalog.jsonb_build_object(
        'settings', settings_data, 'weekly_hours', weekly_data,
        'special_hours', special_data, 'fixed_slots', slots_data,
        'payment_methods', methods_data, 'current_policy', coalesce(policy_data, 'null'::jsonb)
    );
end;
$$;

revoke all on function public.turf_staff_settings() from public, anon;
grant execute on function public.turf_staff_settings() to authenticated;

create or replace function public.turf_update_settings(
    p_hourly_rate numeric,
    p_advance_amount numeric,
    p_minimum_duration_minutes integer,
    p_duration_increment_minutes integer,
    p_booking_horizon_days integer,
    p_request_hold_minutes integer,
    p_payment_deadline_hours integer,
    p_minimum_players integer,
    p_maximum_players integer,
    p_no_show_grace_minutes integer,
    p_booking_enabled boolean,
    p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    previous_settings jsonb;
    updated_settings jsonb;
begin
    if actor_id is null or auth.role() <> 'authenticated'
       or p_reason is null or char_length(pg_catalog.btrim(p_reason)) not between 3 and 500
       or p_booking_enabled is null then
        raise exception 'A valid settings reason and values are required.' using errcode = '22023';
    end if;
    if public.turf_current_staff_role() is null then
        raise exception 'Turf staff access is required.' using errcode = '42501';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(19780011, 1);
    select pg_catalog.to_jsonb(settings) into previous_settings
      from public.turf_settings as settings where id = true for update;
    if p_booking_enabled and (
        not exists (select 1 from public.turf_policy_versions where effective_at <= pg_catalog.now())
        or not exists (select 1 from public.turf_operating_hours where not is_closed)
        or (p_hourly_rate <= 0 and not exists (select 1 from public.turf_fixed_slots where is_active))
    ) then
        raise exception 'Publish a policy, configure open hours and a non-zero price before enabling bookings.'
            using errcode = '22023';
    end if;

    update public.turf_settings
       set hourly_rate = p_hourly_rate,
           advance_amount = p_advance_amount,
           minimum_duration_minutes = p_minimum_duration_minutes,
           duration_increment_minutes = p_duration_increment_minutes,
           booking_horizon_days = p_booking_horizon_days,
           request_hold_minutes = p_request_hold_minutes,
           payment_deadline_hours = p_payment_deadline_hours,
           minimum_players = p_minimum_players,
           maximum_players = p_maximum_players,
           no_show_grace_minutes = p_no_show_grace_minutes,
           booking_enabled = p_booking_enabled,
           updated_by = actor_id,
           updated_at = pg_catalog.now()
     where id = true
     returning pg_catalog.to_jsonb(turf_settings.*) into updated_settings;

    insert into public.turf_audit_logs (actor_id, action, entity_type, reason, details)
    values (
        actor_id, 'settings_updated', 'settings', pg_catalog.btrim(p_reason),
        pg_catalog.jsonb_build_object('before', previous_settings, 'after', updated_settings)
    );
    return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.turf_update_settings(numeric, numeric, integer, integer, integer, integer, integer, integer, integer, integer, boolean, text) from public, anon;
grant execute on function public.turf_update_settings(numeric, numeric, integer, integer, integer, integer, integer, integer, integer, integer, boolean, text) to authenticated;

create or replace function public.turf_set_weekly_hours(
    p_weekday smallint,
    p_is_closed boolean,
    p_opens_at time,
    p_closes_at time,
    p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    previous_hours jsonb;
begin
    if actor_id is null or auth.role() <> 'authenticated'
       or p_weekday not between 0 and 6 or p_is_closed is null
       or p_reason is null or char_length(pg_catalog.btrim(p_reason)) not between 3 and 500
       or (p_is_closed and (p_opens_at is not null or p_closes_at is not null))
       or (not p_is_closed and (p_opens_at is null or p_closes_at is null or p_opens_at >= p_closes_at)) then
        raise exception 'Operating hours are invalid.' using errcode = '22023';
    end if;
    if public.turf_current_staff_role() is null then
        raise exception 'Turf staff access is required.' using errcode = '42501';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(19780011, 1);
    select pg_catalog.to_jsonb(hours) into previous_hours
      from public.turf_operating_hours as hours where weekday = p_weekday for update;

    if exists (
        select 1 from public.turf_bookings as booking
        where booking.status in ('pending', 'approved_awaiting_payment', 'payment_under_review', 'confirmed')
          and extract(dow from booking.starts_at at time zone 'Asia/Dhaka')::smallint = p_weekday
          and (
              p_is_closed
              or (booking.starts_at at time zone 'Asia/Dhaka')::date
                    + p_opens_at > booking.starts_at at time zone 'Asia/Dhaka'
              or (booking.ends_at at time zone 'Asia/Dhaka')::date
                    + p_closes_at < booking.ends_at at time zone 'Asia/Dhaka'
          )
    ) then
        raise exception 'Resolve all protected bookings outside the proposed operating hours before saving.'
            using errcode = '23P01';
    end if;

    insert into public.turf_operating_hours (weekday, is_closed, opens_at, closes_at, updated_by, updated_at)
    values (p_weekday, p_is_closed, p_opens_at, p_closes_at, actor_id, pg_catalog.now())
    on conflict (weekday) do update
       set is_closed = excluded.is_closed, opens_at = excluded.opens_at, closes_at = excluded.closes_at,
           updated_by = actor_id, updated_at = pg_catalog.now();
    insert into public.turf_audit_logs (actor_id, action, entity_type, entity_id, reason, details)
    values (
        actor_id, 'weekly_hours_updated', 'weekly_hours', p_weekday::text, pg_catalog.btrim(p_reason),
        pg_catalog.jsonb_build_object(
            'before', previous_hours,
            'after', pg_catalog.jsonb_build_object('weekday', p_weekday, 'is_closed', p_is_closed, 'opens_at', p_opens_at, 'closes_at', p_closes_at)
        )
    );
    return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.turf_set_weekly_hours(smallint, boolean, time, time, text) from public, anon;
grant execute on function public.turf_set_weekly_hours(smallint, boolean, time, time, text) to authenticated;

create or replace function public.turf_publish_policy(p_content text, p_effective_at timestamptz, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    next_version integer;
    policy_id bigint;
begin
    if actor_id is null or auth.role() <> 'authenticated'
       or p_content is null or char_length(pg_catalog.btrim(p_content)) not between 20 and 20000
       or p_effective_at is null or p_effective_at < pg_catalog.now() - interval '5 minutes'
       or p_reason is null or char_length(pg_catalog.btrim(p_reason)) not between 3 and 500 then
        raise exception 'Policy content or effective date is invalid.' using errcode = '22023';
    end if;
    if public.turf_current_staff_role() is null then
        raise exception 'Turf staff access is required.' using errcode = '42501';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(19780011, 1);
    select coalesce(pg_catalog.max(version), 0) + 1 into next_version
      from public.turf_policy_versions;
    insert into public.turf_policy_versions (version, content, effective_at, published_by)
    values (next_version, pg_catalog.btrim(p_content), p_effective_at, actor_id)
    returning id into policy_id;
    insert into public.turf_audit_logs (actor_id, action, entity_type, entity_id, reason, details)
    values (
        actor_id, 'policy_published', 'policy', policy_id::text, pg_catalog.btrim(p_reason),
        pg_catalog.jsonb_build_object('version', next_version, 'effective_at', p_effective_at)
    );
    return pg_catalog.jsonb_build_object('ok', true, 'id', policy_id, 'version', next_version);
end;
$$;

revoke all on function public.turf_publish_policy(text, timestamptz, text) from public, anon;
grant execute on function public.turf_publish_policy(text, timestamptz, text) to authenticated;

create or replace function public.turf_set_fixed_slot(
    p_slot_id uuid,
    p_label text,
    p_starts_at time,
    p_ends_at time,
    p_price numeric,
    p_is_active boolean,
    p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    slot_id uuid := coalesce(p_slot_id, gen_random_uuid());
    previous_slot jsonb;
begin
    if actor_id is null or auth.role() <> 'authenticated'
       or p_label is null or char_length(pg_catalog.btrim(p_label)) not between 1 and 100
       or p_starts_at is null or p_ends_at is null or p_starts_at >= p_ends_at
       or p_price is null or p_price <= 0 or p_is_active is null
       or p_reason is null or char_length(pg_catalog.btrim(p_reason)) not between 3 and 500 then
        raise exception 'Fixed slot details are invalid.' using errcode = '22023';
    end if;
    if public.turf_current_staff_role() is null then
        raise exception 'Turf staff access is required.' using errcode = '42501';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(19780011, 1);
    if p_slot_id is not null then
        select pg_catalog.to_jsonb(slot) into previous_slot
          from public.turf_fixed_slots as slot where slot.id = p_slot_id for update;
        if previous_slot is null then
            raise exception 'Fixed slot was not found.' using errcode = 'P0002';
        end if;
    end if;
    if exists (
        select 1 from public.turf_fixed_slots as slot
        where slot.id <> slot_id and slot.is_active
          and p_is_active and slot.starts_at < p_ends_at and slot.ends_at > p_starts_at
    ) then
        raise exception 'Fixed slots cannot overlap.' using errcode = '23P01';
    end if;
    if exists (
        select 1 from public.turf_bookings as booking
        where booking.status in ('pending', 'approved_awaiting_payment', 'payment_under_review', 'confirmed')
          and booking.fixed_slot_id = slot_id
          and (booking.starts_at at time zone 'Asia/Dhaka')::date >= (pg_catalog.now() at time zone 'Asia/Dhaka')::date
    ) then
        raise exception 'Resolve protected bookings before changing this fixed slot.' using errcode = '23P01';
    end if;
    insert into public.turf_fixed_slots (id, label, starts_at, ends_at, price, is_active, created_by, updated_at)
    values (slot_id, pg_catalog.btrim(p_label), p_starts_at, p_ends_at, p_price, p_is_active, actor_id, pg_catalog.now())
    on conflict (id) do update
       set label = excluded.label, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
           price = excluded.price, is_active = excluded.is_active, updated_at = pg_catalog.now();
    insert into public.turf_audit_logs (actor_id, action, entity_type, entity_id, reason, details)
    values (
        actor_id, 'fixed_slot_updated', 'fixed_slot', slot_id::text, pg_catalog.btrim(p_reason),
        pg_catalog.jsonb_build_object(
            'before', previous_slot,
            'after', pg_catalog.jsonb_build_object('label', p_label, 'starts_at', p_starts_at, 'ends_at', p_ends_at, 'price', p_price, 'active', p_is_active)
        )
    );
    return pg_catalog.jsonb_build_object('ok', true, 'id', slot_id);
end;
$$;

revoke all on function public.turf_set_fixed_slot(uuid, text, time, time, numeric, boolean, text) from public, anon;
grant execute on function public.turf_set_fixed_slot(uuid, text, time, time, numeric, boolean, text) to authenticated;

create or replace function public.turf_set_payment_method(
    p_method text,
    p_display_name text,
    p_account_details text,
    p_account_type text,
    p_instructions text,
    p_is_active boolean,
    p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    previous_method jsonb;
begin
    if actor_id is null or auth.role() <> 'authenticated'
       or p_method not in ('bkash', 'nagad', 'rocket', 'bank_transfer', 'other')
       or p_display_name is null or char_length(pg_catalog.btrim(p_display_name)) not between 1 and 100
       or p_account_details is null or char_length(pg_catalog.btrim(p_account_details)) not between 1 and 500
       or p_account_type is null or char_length(pg_catalog.btrim(p_account_type)) not between 1 and 100
       or p_instructions is null or char_length(pg_catalog.btrim(p_instructions)) not between 1 and 2000
       or p_is_active is null or p_reason is null or char_length(pg_catalog.btrim(p_reason)) not between 3 and 500 then
        raise exception 'Payment method settings are invalid.' using errcode = '22023';
    end if;
    if public.turf_current_staff_role() is null then
        raise exception 'Turf staff access is required.' using errcode = '42501';
    end if;
    select pg_catalog.to_jsonb(method) into previous_method
      from public.turf_payment_methods as method where method.method = p_method for update;
    insert into public.turf_payment_methods (
        method, display_name, account_details, account_type, instructions, is_active, updated_by, updated_at
    ) values (
        p_method, pg_catalog.btrim(p_display_name), pg_catalog.btrim(p_account_details),
        pg_catalog.btrim(p_account_type), pg_catalog.btrim(p_instructions), p_is_active,
        actor_id, pg_catalog.now()
    )
    on conflict (method) do update
       set display_name = excluded.display_name, account_details = excluded.account_details,
           account_type = excluded.account_type, instructions = excluded.instructions,
           is_active = excluded.is_active, updated_by = actor_id, updated_at = pg_catalog.now();
    insert into public.turf_audit_logs (actor_id, action, entity_type, entity_id, reason, details)
    values (
        actor_id, 'payment_method_updated', 'payment_method', p_method, pg_catalog.btrim(p_reason),
        pg_catalog.jsonb_build_object(
            'before', previous_method,
            'after', pg_catalog.jsonb_build_object(
                'display_name', p_display_name, 'account_details', p_account_details,
                'account_type', p_account_type, 'active', p_is_active
            )
        )
    );
    return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.turf_set_payment_method(text, text, text, text, text, boolean, text) from public, anon;
grant execute on function public.turf_set_payment_method(text, text, text, text, text, boolean, text) to authenticated;

create or replace function public.turf_process_expiries()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    overdue_count integer;
    expired_count integer;
    booking_row record;
begin
    if auth.role() <> 'service_role' then
        raise exception 'A trusted scheduled worker is required.' using errcode = '42501';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(19780011, 1);

    update public.turf_bookings
       set overdue = true, updated_at = pg_catalog.now()
     where status = 'pending' and request_hold_until < pg_catalog.now() and not overdue;
    get diagnostics overdue_count = row_count;

    for booking_row in
        update public.turf_bookings
           set status = 'expired', updated_at = pg_catalog.now()
         where status = 'approved_awaiting_payment'
           and payment_deadline < pg_catalog.now()
         returning id, customer_id, reference
    loop
        expired_count := coalesce(expired_count, 0) + 1;
        insert into public.turf_audit_logs (action, entity_type, entity_id, reason, details)
        values (
            'booking_expired', 'booking', booking_row.id::text,
            'Advance payment deadline elapsed.',
            pg_catalog.jsonb_build_object('reference', booking_row.reference)
        );
        insert into public.turf_notification_outbox (
            booking_id, recipient_id, event_type, idempotency_key, payload
        ) values (
            booking_row.id, booking_row.customer_id, 'booking_expired',
            'booking-expired:' || booking_row.id::text,
            pg_catalog.jsonb_build_object('reference', booking_row.reference)
        );
    end loop;

    insert into public.turf_notification_outbox (
        event_type, idempotency_key, payload
    )
    select 'turf_staff_overdue_requests',
           'turf-overdue:' || booking.id::text,
           pg_catalog.jsonb_build_object('reference', booking.reference, 'booking_id', booking.id)
      from public.turf_bookings as booking
     where booking.status = 'pending' and booking.overdue
       and not exists (
           select 1 from public.turf_notification_outbox as notification
           where notification.idempotency_key = 'turf-overdue:' || booking.id::text
       );

    return pg_catalog.jsonb_build_object('overdue_marked', overdue_count, 'expired', coalesce(expired_count, 0));
end;
$$;

revoke all on function public.turf_process_expiries() from public, anon, authenticated;
grant execute on function public.turf_process_expiries() to service_role;

commit;
