-- ONYX account enforcement, warning history, and advisory AI moderation signals.
-- Apply after 0004_marketplace_workflow_and_moderation.sql.

-- ---------------------------------------------------------------------------
-- Listing-copy safety. This is deliberately limited to obvious vulgar,
-- abusive, sexually explicit, or off-platform contact content. Ambiguous copy
-- remains pending for human moderation instead of being rejected here.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_listing_copy_for_safety(p_value text)
returns text
language sql
immutable
returns null on null input
set search_path = public, pg_temp
as $$
  select trim(regexp_replace(
    translate(lower(p_value), '013457@$!', 'oieastasi'),
    '[^a-z]+',
    ' ',
    'g'
  ))
$$;

create or replace function public.listing_copy_is_allowed(p_title text, p_description text)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_copy text := public.normalize_listing_copy_for_safety(coalesce(p_title,'') || ' ' || coalesce(p_description,''));
  v_compact text;
  v_collapsed text;
  v_tokens text[];
  v_term text;
  v_blocked_tokens constant text[] := array[
    'fuck','fucker','fucking','motherfucker','bitch','asshole','cunt','pussy','whore','slut',
    'nigger','nigga','faggot','porn','porno','pornography','xxx',
    'hentai','dildo','vibrator','blowjob','handjob','onlyfans',
    'behenchod','bhenchod','benchod','madarchod','maderchod','chutiya','chutia',
    'gaandu','gandu','randi','bhadwa','bhosdike','bhosdi','lund','lauda','loda','jhatu','jhaatu'
  ];
  v_compact_terms constant text[] := array[
    'motherfucker','behenchod','bhenchod','benchod','madarchod','maderchod','bhosdike',
    'onlyfans','blowjob','handjob','childporn','revengeporn'
  ];
begin
  v_tokens := regexp_split_to_array(v_copy, '\s+');
  v_compact := regexp_replace(v_copy, '[^a-z]+', '', 'g');
  v_collapsed := regexp_replace(v_compact, '(.)\1+', '\1', 'g');

  foreach v_term in array v_blocked_tokens loop
    if v_term = any(v_tokens) then return false; end if;
  end loop;
  foreach v_term in array v_compact_terms loop
    if position(v_term in v_compact) > 0 or position(v_term in v_collapsed) > 0 then return false; end if;
  end loop;
  if v_copy ~ '(sex)[[:space:]]*(toy|toys|service|services|video|videos|photo|photos|content)' then return false; end if;
  if v_copy ~ '(adult)[[:space:]]*(content|service|services|video|videos|toy|toys)' then return false; end if;
  if v_copy ~ '(whatsapp|telegram|instagram|snapchat)' then return false; end if;
  if coalesce(p_title,'') || ' ' || coalesce(p_description,'') ~* '(^|[^0-9])(\+?91[- ]?)?[6-9][0-9]{9}([^0-9]|$)' then return false; end if;
  if coalesce(p_title,'') || ' ' || coalesce(p_description,'') ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}' then return false; end if;
  return true;
end;
$$;

create or replace function public.enforce_safe_listing_copy()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.listing_copy_is_allowed(new.title,new.description) then
    raise exception 'listing_copy_disallowed';
  end if;
  return new;
end;
$$;

drop trigger if exists listings_safe_copy on public.listings;
create trigger listings_safe_copy
before insert or update of title,description on public.listings
for each row execute function public.enforce_safe_listing_copy();

-- ---------------------------------------------------------------------------
-- Account moderation state and an auditable action history.
-- ---------------------------------------------------------------------------
create table if not exists public.account_moderation (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active','warned','suspended','banned')),
  reason text not null default '' check (char_length(reason) <= 1000),
  suspended_until timestamptz,
  last_action_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  check ((status = 'suspended' and suspended_until is not null) or status <> 'suspended')
);

create table if not exists public.account_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  action text not null check (action in ('warning','suspend','restore','ban')),
  reason text not null check (char_length(reason) between 3 and 1000),
  suspended_until timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists account_moderation_actions_target_created_idx
  on public.account_moderation_actions(target_user_id,created_at desc);

create table if not exists public.listing_moderation_signals (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  decision text not null check (decision in ('allow','manual_review','changes_required')),
  provider text not null check (provider in ('rules','gemini','rules+gemini')),
  summary text not null default '' check (char_length(summary) <= 1000),
  issues jsonb not null default '[]'::jsonb,
  suggestions jsonb not null default '[]'::jsonb,
  scores jsonb not null default '{}'::jsonb,
  trusted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_moderation enable row level security;
alter table public.account_moderation_actions enable row level security;
alter table public.listing_moderation_signals enable row level security;

drop policy if exists account_moderation_self_or_staff_select on public.account_moderation;
create policy account_moderation_self_or_staff_select on public.account_moderation
for select using (user_id=auth.uid() or public.is_admin());

drop policy if exists account_actions_self_or_staff_select on public.account_moderation_actions;
create policy account_actions_self_or_staff_select on public.account_moderation_actions
for select using (target_user_id=auth.uid() or public.is_admin());

drop policy if exists moderation_signals_owner_or_staff_select on public.listing_moderation_signals;
create policy moderation_signals_owner_or_staff_select on public.listing_moderation_signals
for select using (public.is_admin() or exists(
  select 1 from public.listings l where l.id=listing_id and l.owner_id=auth.uid()
));

revoke all on public.account_moderation, public.account_moderation_actions, public.listing_moderation_signals from anon;
revoke insert,update,delete on public.account_moderation, public.account_moderation_actions, public.listing_moderation_signals from authenticated;
grant select on public.account_moderation, public.account_moderation_actions, public.listing_moderation_signals to authenticated;

create or replace function public.has_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists(select 1 from public.user_roles where user_id=auth.uid() and role=p_role)
$$;

create or replace function public.account_can_participate(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists(
    select 1
    from public.profiles p
    left join public.account_moderation am on am.user_id=p.id
    where p.id=p_user_id
      and coalesce(p.suspended_until,'-infinity'::timestamptz) < now()
      and coalesce(am.status,'active') <> 'banned'
      and (coalesce(am.status,'active') <> 'suspended' or coalesce(am.suspended_until,'-infinity'::timestamptz) < now())
  )
$$;

create or replace function public.enforce_active_marketplace_actor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not public.account_can_participate(auth.uid()) then
    raise exception 'account_suspended';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_listing_owner_eligible()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status in ('active','reserved') and not public.account_can_participate(new.owner_id) then
    raise exception 'listing_owner_suspended';
  end if;
  return new;
end;
$$;

-- Security-definer RPCs bypass row policies, so triggers enforce suspension at
-- the actual write boundary as well as in the interface.
do $$
declare v_table text;
begin
  foreach v_table in array array['listings','listing_images','favorites','saved_searches','offers','conversations','messages','meetup_proposals','ratings','blocks'] loop
    execute format('drop trigger if exists %I on public.%I','account_active_actor_' || v_table,v_table);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.enforce_active_marketplace_actor()','account_active_actor_' || v_table,v_table);
  end loop;
end $$;

drop trigger if exists listings_owner_eligible on public.listings;
create trigger listings_owner_eligible
before insert or update of owner_id,status on public.listings
for each row execute function public.enforce_listing_owner_eligible();

create or replace function public.moderate_user_account(
  p_user_id uuid,
  p_action text,
  p_reason text,
  p_duration_hours integer default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := trim(coalesce(p_reason,''));
  v_until timestamptz;
  v_current_status text;
begin
  if not public.is_admin() then raise exception 'moderator_required'; end if;
  if p_user_id is null or p_user_id=v_actor then raise exception 'invalid_account_target'; end if;
  if char_length(v_reason) not between 3 and 1000 then raise exception 'moderation_reason_required'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'account_not_found'; end if;
  if exists(select 1 from public.user_roles where user_id=p_user_id and role='admin') and not public.has_role('admin') then
    raise exception 'admin_target_requires_admin';
  end if;

  select status into v_current_status from public.account_moderation where user_id=p_user_id;
  if p_action='warning' then
    insert into public.account_moderation(user_id,status,reason,last_action_by,updated_at)
    values(p_user_id,'warned',v_reason,v_actor,now())
    on conflict(user_id) do update set
      status=case
        when account_moderation.status='banned' then 'banned'
        when account_moderation.status='suspended' and coalesce(account_moderation.suspended_until,'-infinity'::timestamptz) >= now() then 'suspended'
        else 'warned'
      end,
      reason=case
        when account_moderation.status='banned' then account_moderation.reason
        when account_moderation.status='suspended' and coalesce(account_moderation.suspended_until,'-infinity'::timestamptz) >= now() then account_moderation.reason
        else excluded.reason
      end,
      last_action_by=v_actor,updated_at=now();
  elsif p_action='suspend' then
    if p_duration_hours is null or p_duration_hours not between 1 and 2160 then raise exception 'invalid_suspension_duration'; end if;
    v_until := now() + make_interval(hours=>p_duration_hours);
    insert into public.account_moderation(user_id,status,reason,suspended_until,last_action_by,updated_at)
    values(p_user_id,'suspended',v_reason,v_until,v_actor,now())
    on conflict(user_id) do update set status='suspended',reason=excluded.reason,suspended_until=v_until,last_action_by=v_actor,updated_at=now();
    update public.profiles set suspended_until=v_until,updated_at=now() where id=p_user_id;
    update public.listings set status='paused',updated_at=now() where owner_id=p_user_id and status in ('active','reserved');
    update public.offers set status='cancelled',updated_at=now() where status in ('open','countered') and p_user_id in (buyer_id,seller_id);
    update public.conversations set status='cancelled',updated_at=now() where status not in ('completed','cancelled','expired') and p_user_id in (buyer_id,seller_id);
  elsif p_action='ban' then
    if not public.has_role('admin') then raise exception 'admin_required_for_ban'; end if;
    v_until := 'infinity'::timestamptz;
    insert into public.account_moderation(user_id,status,reason,suspended_until,last_action_by,updated_at)
    values(p_user_id,'banned',v_reason,v_until,v_actor,now())
    on conflict(user_id) do update set status='banned',reason=excluded.reason,suspended_until=v_until,last_action_by=v_actor,updated_at=now();
    update public.profiles set suspended_until=v_until,updated_at=now() where id=p_user_id;
    update public.listings set status='removed',updated_at=now() where owner_id=p_user_id and status not in ('sold','expired','removed');
    update public.offers set status='cancelled',updated_at=now() where status in ('open','countered') and p_user_id in (buyer_id,seller_id);
    update public.conversations set status='cancelled',updated_at=now() where status not in ('completed','cancelled','expired') and p_user_id in (buyer_id,seller_id);
  elsif p_action='restore' then
    if v_current_status='banned' and not public.has_role('admin') then raise exception 'admin_required_for_restore'; end if;
    insert into public.account_moderation(user_id,status,reason,suspended_until,last_action_by,updated_at)
    values(p_user_id,'active',v_reason,null,v_actor,now())
    on conflict(user_id) do update set status='active',reason=excluded.reason,suspended_until=null,last_action_by=v_actor,updated_at=now();
    update public.profiles set suspended_until=null,updated_at=now() where id=p_user_id;
  else
    raise exception 'invalid_account_action';
  end if;

  insert into public.account_moderation_actions(target_user_id,actor_id,action,reason,suspended_until)
  values(p_user_id,v_actor,p_action,v_reason,v_until);
  insert into public.admin_audit_log(actor_id,action,target_type,target_id,metadata_redacted)
  values(v_actor,'moderate_user_account','profile',p_user_id,jsonb_build_object('decision',p_action,'duration_hours',p_duration_hours));
  insert into public.notifications(owner_id,kind,title,body_safe,action_path)
  values(
    p_user_id,'account',
    case p_action when 'warning' then 'Account warning' when 'suspend' then 'Account suspended' when 'ban' then 'Account disabled' else 'Account restored' end,
    case p_action when 'suspend' then v_reason || ' · Until ' || to_char(v_until at time zone 'UTC','YYYY-MM-DD HH24:MI UTC') else v_reason end,
    '/dashboard'
  );
end;
$$;

create or replace function public.get_moderation_users(p_search text default '')
returns table(
  user_id uuid,
  alias text,
  created_at timestamptz,
  verified boolean,
  status text,
  moderation_reason text,
  suspended_until timestamptz,
  warning_count integer,
  active_listing_count integer,
  open_report_count integer,
  is_staff boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id,p.alias,p.created_at,(p.verified_at is not null),
    case
      when coalesce(am.status,'active')='suspended' and am.suspended_until < now() then 'active'
      else coalesce(am.status,'active')
    end,
    coalesce(am.reason,''),am.suspended_until,
    (select count(*)::integer from public.account_moderation_actions a where a.target_user_id=p.id and a.action='warning'),
    (select count(*)::integer from public.listings l where l.owner_id=p.id and l.status in ('active','reserved','pending_moderation')),
    (select count(*)::integer from public.reports r
      where r.status in ('open','reviewing') and (
        r.listing_id in (select l2.id from public.listings l2 where l2.owner_id=p.id)
        or r.conversation_id in (select c2.id from public.conversations c2 where p.id in (c2.buyer_id,c2.seller_id))
      )),
    exists(select 1 from public.user_roles ur where ur.user_id=p.id and ur.role in ('moderator','admin'))
  from public.profiles p
  left join public.account_moderation am on am.user_id=p.id
  where public.is_admin()
    and (trim(coalesce(p_search,''))='' or p.alias ilike '%' || trim(p_search) || '%')
  order by
    case coalesce(am.status,'active') when 'banned' then 0 when 'suspended' then 1 when 'warned' then 2 else 3 end,
    p.created_at desc
  limit 250
$$;

create or replace function public.get_account_moderation_history(p_user_id uuid)
returns table(
  id uuid,
  action text,
  reason text,
  actor_alias text,
  suspended_until timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.id,a.action,a.reason,p.alias,a.suspended_until,a.created_at
  from public.account_moderation_actions a
  join public.profiles p on p.id=a.actor_id
  where public.is_admin() and a.target_user_id=p_user_id
  order by a.created_at desc
  limit 100
$$;

create or replace function public.get_my_account_state()
returns table(status text, reason text, suspended_until timestamptz, warning_count integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    case when coalesce(am.status,'active')='suspended' and am.suspended_until < now() then 'active' else coalesce(am.status,'active') end,
    coalesce(am.reason,''),am.suspended_until,
    (select count(*)::integer from public.account_moderation_actions a where a.target_user_id=auth.uid() and a.action='warning')
  from public.profiles p
  left join public.account_moderation am on am.user_id=p.id
  where p.id=auth.uid()
$$;

create or replace function public.record_listing_moderation_preflight(
  p_listing_id uuid,
  p_decision text,
  p_provider text,
  p_summary text,
  p_issues jsonb,
  p_suggestions jsonb,
  p_scores jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_decision not in ('allow','manual_review','changes_required') or p_provider not in ('rules','gemini','rules+gemini') then
    raise exception 'invalid_moderation_signal';
  end if;
  if not exists(select 1 from public.listings where id=p_listing_id and owner_id=auth.uid() and status='pending_moderation') then
    raise exception 'listing_signal_unavailable';
  end if;
  insert into public.listing_moderation_signals(listing_id,decision,provider,summary,issues,suggestions,scores,trusted,updated_at)
  values(p_listing_id,p_decision,p_provider,left(coalesce(p_summary,''),1000),coalesce(p_issues,'[]'::jsonb),coalesce(p_suggestions,'[]'::jsonb),coalesce(p_scores,'{}'::jsonb),false,now())
  on conflict(listing_id) do update set decision=excluded.decision,provider=excluded.provider,summary=excluded.summary,
    issues=excluded.issues,suggestions=excluded.suggestions,scores=excluded.scores,updated_at=now();
end;
$$;

-- Keep pending and removed images private. Public marketplace clients receive
-- short-lived signed URLs only after the storage policy confirms the listing is active.
update storage.buckets set public=false where id='listing-images';

drop policy if exists listing_images_public_read on storage.objects;
drop policy if exists listing_images_authorized_read on storage.objects;
create policy listing_images_authorized_read on storage.objects for select
using (
  bucket_id='listing-images'
  and exists (
    select 1 from public.listings l
    where l.id::text=(storage.foldername(name))[1]
      and (public.is_public_active_listing(l.id) or l.owner_id=auth.uid() or public.is_admin())
  )
);

drop policy if exists listing_images_owner_upload on storage.objects;
create policy listing_images_owner_upload on storage.objects for insert to authenticated
with check (
  bucket_id='listing-images'
  and lower(storage.extension(name))='webp'
  and public.account_can_participate(auth.uid())
  and exists (
    select 1 from public.listings l
    where l.id::text=(storage.foldername(name))[1]
      and l.owner_id=auth.uid()
      and l.status='pending_moderation'
      and exists (
        select 1 from public.listing_moderation_signals s
        where s.listing_id=l.id and s.decision in ('allow','manual_review')
      )
  )
);

create or replace function public.enforce_listing_image_preflight()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if not exists (
    select 1
    from public.listings l
    join public.listing_moderation_signals s on s.listing_id=l.id
    where l.id=new.listing_id
      and l.owner_id=auth.uid()
      and l.status='pending_moderation'
      and s.decision in ('allow','manual_review')
  ) then
    raise exception 'listing_preflight_required';
  end if;
  return new;
end;
$$;

drop trigger if exists listing_images_preflight_required on public.listing_images;
create trigger listing_images_preflight_required
before insert on public.listing_images
for each row execute function public.enforce_listing_image_preflight();

revoke all on function public.normalize_listing_copy_for_safety(text) from public,anon,authenticated;
revoke all on function public.listing_copy_is_allowed(text,text) from public,anon,authenticated;
revoke all on function public.enforce_safe_listing_copy() from public,anon,authenticated;
revoke all on function public.has_role(text) from public,anon,authenticated;
revoke all on function public.account_can_participate(uuid) from public,anon,authenticated;
revoke all on function public.enforce_active_marketplace_actor() from public,anon,authenticated;
revoke all on function public.enforce_listing_owner_eligible() from public,anon,authenticated;
revoke all on function public.enforce_listing_image_preflight() from public,anon,authenticated;
revoke all on function public.moderate_user_account(uuid,text,text,integer) from public,anon;
revoke all on function public.get_moderation_users(text) from public,anon;
revoke all on function public.get_account_moderation_history(uuid) from public,anon;
revoke all on function public.get_my_account_state() from public,anon;
revoke all on function public.record_listing_moderation_preflight(uuid,text,text,text,jsonb,jsonb,jsonb) from public,anon;

grant execute on function public.moderate_user_account(uuid,text,text,integer) to authenticated;
grant execute on function public.get_moderation_users(text) to authenticated;
grant execute on function public.get_account_moderation_history(uuid) to authenticated;
grant execute on function public.get_my_account_state() to authenticated;
grant execute on function public.record_listing_moderation_preflight(uuid,text,text,text,jsonb,jsonb,jsonb) to authenticated;
