begin;

-- Cross-instance rate limits for Vercel/serverless API routes. The application
-- stores only an HMAC digest; raw email addresses, account IDs, IP addresses,
-- bearer tokens, and user-agent strings are never persisted in this table.
create table if not exists public.api_rate_limit_buckets (
  bucket_key text primary key,
  window_started_at timestamptz not null default clock_timestamp(),
  hits integer not null default 1 check (hits > 0),
  updated_at timestamptz not null default clock_timestamp(),
  constraint api_rate_limit_bucket_key_shape check (bucket_key ~ '^[a-f0-9]{64}$')
);

alter table public.api_rate_limit_buckets enable row level security;
revoke all on table public.api_rate_limit_buckets from public, anon, authenticated;
grant select, insert, update, delete on table public.api_rate_limit_buckets to service_role;

create or replace function public.consume_api_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_started_at timestamptz;
  v_hits integer;
begin
  if p_bucket_key is null or p_bucket_key !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_rate_limit_key' using errcode = '22023';
  end if;
  if p_limit < 1 or p_limit > 10000 then
    raise exception 'invalid_rate_limit_limit' using errcode = '22023';
  end if;
  if p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid_rate_limit_window' using errcode = '22023';
  end if;

  insert into public.api_rate_limit_buckets as bucket (
    bucket_key,
    window_started_at,
    hits,
    updated_at
  ) values (
    p_bucket_key,
    v_now,
    1,
    v_now
  )
  on conflict (bucket_key) do update
  set
    window_started_at = case
      when bucket.window_started_at + make_interval(secs => p_window_seconds) <= v_now then v_now
      else bucket.window_started_at
    end,
    hits = case
      when bucket.window_started_at + make_interval(secs => p_window_seconds) <= v_now then 1
      else bucket.hits + 1
    end,
    updated_at = v_now
  returning bucket.window_started_at, bucket.hits
  into v_window_started_at, v_hits;

  return query select
    v_hits <= p_limit,
    greatest(p_limit - v_hits, 0),
    v_window_started_at + make_interval(secs => p_window_seconds);
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to service_role;

create or replace function public.prune_api_rate_limits()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted integer;
begin
  delete from public.api_rate_limit_buckets
  where updated_at < clock_timestamp() - interval '2 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_api_rate_limits() from public, anon, authenticated;
grant execute on function public.prune_api_rate_limits() to service_role;

comment on table public.api_rate_limit_buckets is
  'HMAC-keyed fixed-window API throttling buckets. Contains no raw identity or network values.';
comment on function public.consume_api_rate_limit(text, integer, integer) is
  'Atomically consumes one request in a fixed server-side rate-limit window.';
comment on function public.prune_api_rate_limits() is
  'Removes old rate-limit buckets; intended for the protected maintenance job.';

commit;
