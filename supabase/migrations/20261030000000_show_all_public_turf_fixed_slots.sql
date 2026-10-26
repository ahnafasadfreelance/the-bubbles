begin;

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
    booked_list jsonb;
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
        'starts_at', booking.starts_at,
        'ends_at', booking.ends_at
    ) order by booking.starts_at), '[]'::jsonb)
      into booked_list
      from public.turf_bookings as booking
     where booking.status in ('pending', 'approved_awaiting_payment', 'payment_under_review', 'confirmed')
       and (booking.starts_at at time zone 'Asia/Dhaka')::date = p_local_date;

    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', slot.id, 'label', slot.label, 'starts_at', slot.starts_at,
        'ends_at', slot.ends_at, 'price', slot.price
    ) order by slot.starts_at), '[]'::jsonb)
      into slot_list
      from public.turf_fixed_slots as slot
     where slot.is_active;

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
        'booked_ranges', booked_list,
        'fixed_slots', slot_list,
        'payment_methods', method_list,
        'policy', coalesce(policy_data, 'null'::jsonb)
    );
end;
$$;

revoke all on function public.turf_public_day(date) from public;
grant execute on function public.turf_public_day(date) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
