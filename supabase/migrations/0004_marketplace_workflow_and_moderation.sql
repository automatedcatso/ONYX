-- ONYX marketplace workflow completion and moderation hardening.
-- Apply after 0003_open_email_registration.sql.

-- ---------------------------------------------------------------------------
-- Respectful aliases: block abusive English aliases and common Hindi abuse
-- written in Latin characters, including basic separator and leetspeak evasion.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_alias_for_safety(p_alias text)
returns text
language sql
immutable
returns null on null input
set search_path = public, pg_temp
as $$
  select regexp_replace(
    translate(lower(p_alias), '013457@$!', 'oieastasi'),
    '[^a-z]+',
    '',
    'g'
  )
$$;

create or replace function public.alias_is_allowed(p_alias text)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_compact text := public.normalize_alias_for_safety(coalesce(p_alias, ''));
  v_collapsed text;
  v_exact_terms constant text[] := array[
    'fuck','fucker','fucking','motherfucker','bitch','bastard','asshole','cunt',
    'dick','pussy','whore','slut','retard','nigger','nigga','faggot',
    'behenchod','bhenchod','benchod','madarchod','maderchod','chutiya','chutia',
    'gaandu','gandu','randi','harami','kamina','kameena','bhadwa','bhosdike',
    'bhosdi','lund','lauda','loda','jhatu','jhaatu','chakka'
  ];
  v_contains_terms constant text[] := array[
    'motherfucker','nigger','nigga','faggot','behenchod','bhenchod','benchod',
    'madarchod','maderchod','chutiya','chutia','gaandu','gandu','randi',
    'bhadwa','bhosdike','jhatu','jhaatu'
  ];
  v_term text;
begin
  if p_alias is null or p_alias !~ '^[A-Za-z][A-Za-z0-9_-]{2,23}$' then
    return false;
  end if;

  v_collapsed := regexp_replace(v_compact, '(.)\1+', '\1', 'g');
  if v_compact = any(v_exact_terms) or v_collapsed = any(v_exact_terms) then
    return false;
  end if;

  foreach v_term in array v_contains_terms loop
    if position(v_term in v_compact) > 0 or position(v_term in v_collapsed) > 0 then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.enforce_safe_profile_alias()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.alias_is_allowed(new.alias) then
    raise exception 'alias_disallowed';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_safe_alias on public.profiles;
create trigger profiles_safe_alias
before insert or update of alias on public.profiles
for each row execute function public.enforce_safe_profile_alias();

-- Replace legacy abusive aliases deterministically without exposing identity.
with replaced as (
  update public.profiles p
  set alias = 'Member_' || left(replace(p.id::text, '-', ''), 16),
      alias_changed_at = now(),
      updated_at = now()
  where not public.alias_is_allowed(p.alias)
  returning p.id
)
insert into public.notifications(owner_id, kind, title, body_safe, action_path)
select id, 'account', 'Your public alias was reset',
       'Choose a respectful alias in Settings. English abuse and Hindi abuse written in English are not allowed.',
       '/settings'
from replaced;

alter table public.profiles drop constraint if exists profiles_alias_safe;
alter table public.profiles
  add constraint profiles_alias_safe check (public.alias_is_allowed(alias)) not valid;
alter table public.profiles validate constraint profiles_alias_safe;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_alias text := trim(coalesce(new.raw_user_meta_data ->> 'alias', ''));
  v_location_id uuid;
begin
  if not public.alias_is_allowed(v_alias) then
    raise exception 'invalid_registration_profile';
  end if;
  select id into v_location_id
  from public.locations
  where slug = new.raw_user_meta_data ->> 'location_slug' and active = true;
  if v_location_id is null then
    raise exception 'invalid_registration_profile';
  end if;

  insert into public.profiles(
    id, alias, location_id, verified_at, terms_accepted_at,
    privacy_accepted_at, safety_accepted_at
  ) values (
    new.id, v_alias, v_location_id,
    case when new.email_confirmed_at is not null then now() else null end,
    now(), now(), now()
  );
  insert into public.user_roles(user_id, role) values (new.id, 'student');
  return new;
end;
$$;

create or replace function public.update_my_profile(
  p_alias text,
  p_location_slug text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_alias text := trim(coalesce(p_alias, ''));
  v_location uuid;
  v_profile public.profiles;
begin
  if v_owner is null or not public.alias_is_allowed(v_alias) then
    raise exception 'alias_disallowed';
  end if;
  select id into v_location from public.locations
    where slug = p_location_slug and active = true;
  select * into v_profile from public.profiles
    where id = v_owner for update;
  if v_location is null or v_profile.id is null
     or coalesce(v_profile.suspended_until,'-infinity') >= now() then
    raise exception 'profile_unavailable';
  end if;
  if v_profile.alias is distinct from v_alias
     and v_profile.alias_changed_at is not null
     and v_profile.alias_changed_at > now() - interval '30 days' then
    raise exception 'alias_change_cooldown';
  end if;
  update public.profiles
    set alias = v_alias,
        location_id = v_location,
        alias_changed_at = case when alias is distinct from v_alias then now() else alias_changed_at end,
        updated_at = now()
    where id = v_owner;
  return v_location;
end;
$$;

-- ---------------------------------------------------------------------------
-- Offers: preserve who initiated each offer, fix wanted-post participant roles,
-- add accept/decline/cancel controls, and make every offer messageable.
-- ---------------------------------------------------------------------------
alter table public.offers add column if not exists created_by uuid references public.profiles(id);
update public.offers o
set created_by = case when l.post_type = 'sale' then o.buyer_id else o.seller_id end
from public.listings l
where l.id = o.listing_id and o.created_by is null;
alter table public.offers alter column created_by set not null;
create index if not exists offers_created_by_status_idx on public.offers(created_by, status, updated_at desc);

create or replace function public.create_offer_for_listing(
  p_listing_id uuid,
  p_amount_inr integer,
  p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.listings;
  v_offer_id uuid;
  v_buyer uuid;
  v_seller uuid;
  v_recipient uuid;
begin
  if auth.uid() is null or p_amount_inr not between 1 and 10000000 or char_length(trim(coalesce(p_note,''))) > 180 then
    raise exception 'invalid_offer';
  end if;
  select * into v_listing from public.listings where id = p_listing_id for update;
  if v_listing.id is null or v_listing.status not in ('active','reserved')
     or (v_listing.expires_at is not null and v_listing.expires_at <= now())
     or (v_listing.post_type = 'sale' and v_listing.stock <= coalesce((
       select sum(quantity) from public.reservations
       where listing_id = v_listing.id and released_at is null and expires_at > now()
     ),0))
     or v_listing.owner_id = auth.uid() then
    raise exception 'listing_unavailable';
  end if;
  if exists(select 1 from public.blocks where
    (blocker_id = auth.uid() and blocked_id = v_listing.owner_id)
    or (blocker_id = v_listing.owner_id and blocked_id = auth.uid())) then
    raise exception 'interaction_blocked';
  end if;

  v_buyer := case when v_listing.post_type = 'sale' then auth.uid() else v_listing.owner_id end;
  v_seller := case when v_listing.post_type = 'sale' then v_listing.owner_id else auth.uid() end;
  v_recipient := case when auth.uid() = v_buyer then v_seller else v_buyer end;

  if exists(
    select 1 from public.offers
    where listing_id = v_listing.id and buyer_id = v_buyer and seller_id = v_seller
      and status in ('open','countered') and created_at > now() - interval '60 seconds'
  ) then raise exception 'offer_rate_limited'; end if;

  insert into public.offers(listing_id,buyer_id,seller_id,created_by,amount_inr,note,expires_at)
  values(v_listing.id,v_buyer,v_seller,auth.uid(),p_amount_inr,trim(coalesce(p_note,'')),now() + interval '24 hours')
  returning offers.id into v_offer_id;

  insert into public.notifications(owner_id,kind,title,body_safe,action_path)
  values(
    v_recipient,
    'offer',
    case when v_listing.post_type = 'sale' then 'New offer on your listing' else 'Someone responded to your wanted post' end,
    v_listing.title || ' · ₹' || p_amount_inr::text,
    '/dashboard'
  );
  return v_offer_id;
end;
$$;

create or replace function public.start_conversation_for_listing(p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.listings;
  v_conversation uuid;
  v_buyer uuid;
  v_seller uuid;
begin
  select * into v_listing from public.listings
  where id = p_listing_id
    and status in ('active','reserved')
    and (expires_at is null or expires_at > now())
    and (post_type = 'wanted' or stock > coalesce((
      select sum(quantity) from public.reservations
      where listing_id = p_listing_id and released_at is null and expires_at > now()
    ),0));
  if auth.uid() is null or v_listing.id is null or v_listing.owner_id = auth.uid() then
    raise exception 'conversation_unavailable';
  end if;
  if exists(select 1 from public.blocks where
    (blocker_id = auth.uid() and blocked_id = v_listing.owner_id)
    or (blocker_id = v_listing.owner_id and blocked_id = auth.uid())) then
    raise exception 'interaction_blocked';
  end if;

  v_buyer := case when v_listing.post_type = 'sale' then auth.uid() else v_listing.owner_id end;
  v_seller := case when v_listing.post_type = 'sale' then v_listing.owner_id else auth.uid() end;
  insert into public.conversations(listing_id,buyer_id,seller_id)
  values(v_listing.id,v_buyer,v_seller)
  on conflict (listing_id,buyer_id,seller_id)
  do update set hidden_at = null, updated_at = now()
  returning conversations.id into v_conversation;
  return v_conversation;
end;
$$;

create or replace function public.open_offer_conversation(p_offer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offer public.offers;
  v_conversation uuid;
begin
  select * into v_offer from public.offers where id = p_offer_id;
  if auth.uid() is null or v_offer.id is null or auth.uid() not in (v_offer.buyer_id,v_offer.seller_id) then
    raise exception 'offer_unavailable';
  end if;
  if exists(select 1 from public.blocks where
    (blocker_id = v_offer.buyer_id and blocked_id = v_offer.seller_id)
    or (blocker_id = v_offer.seller_id and blocked_id = v_offer.buyer_id)) then
    raise exception 'interaction_blocked';
  end if;
  insert into public.conversations(listing_id,buyer_id,seller_id)
  values(v_offer.listing_id,v_offer.buyer_id,v_offer.seller_id)
  on conflict (listing_id,buyer_id,seller_id)
  do update set hidden_at = null, updated_at = now()
  returning conversations.id into v_conversation;
  return v_conversation;
end;
$$;

create or replace function public.reserve_listing_stock(p_offer_id uuid, p_window_minutes integer default 120)
returns public.reservations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offer public.offers;
  v_listing public.listings;
  v_reservation public.reservations;
  v_released integer;
begin
  select * into v_offer from public.offers where id = p_offer_id for update;
  if auth.uid() is null
     or v_offer.id is null
     or auth.uid() not in (v_offer.buyer_id,v_offer.seller_id)
     or v_offer.created_by = auth.uid()
     or v_offer.status not in ('open','countered') then
    raise exception 'offer_not_reservable';
  end if;
  select * into v_listing from public.listings where id = v_offer.listing_id for update;

  update public.offers set status = 'expired', updated_at = now()
  where status = 'accepted' and id in (
    select offer_id from public.reservations
    where listing_id = v_listing.id and released_at is null and expires_at <= now()
  );
  with released as (
    update public.reservations set released_at = now()
    where listing_id = v_listing.id and released_at is null and expires_at <= now()
    returning quantity
  ) select coalesce(sum(quantity),0)::integer into v_released from released;
  if v_released > 0 then
    update public.listings
      set reserved_stock = greatest(0,reserved_stock-v_released),
          status = case
            when status = 'reserved' and stock > greatest(0,reserved_stock-v_released) then 'active'::public.listing_status
            else status
          end,
          updated_at=now()
      where id=v_listing.id;
    select * into v_listing from public.listings where id = v_offer.listing_id for update;
  end if;

  if v_listing.status not in ('active','reserved') or (v_listing.stock-v_listing.reserved_stock) < v_offer.quantity then
    raise exception 'insufficient_stock';
  end if;
  update public.listings set reserved_stock = reserved_stock + v_offer.quantity,
    status = case when stock-(reserved_stock+v_offer.quantity) > 0 then 'active'::public.listing_status else 'reserved'::public.listing_status end,
    updated_at = now() where id = v_listing.id;
  update public.offers set status = 'accepted', updated_at = now() where id = v_offer.id;
  insert into public.reservations(listing_id,offer_id,buyer_id,seller_id,quantity,expires_at)
  values(v_listing.id,v_offer.id,v_offer.buyer_id,v_offer.seller_id,v_offer.quantity,
    now() + make_interval(mins => greatest(15,least(p_window_minutes,1440))))
  returning * into v_reservation;
  return v_reservation;
end;
$$;

create or replace function public.respond_to_offer(p_offer_id uuid, p_action text)
returns table(status text, conversation_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offer public.offers;
  v_other uuid;
  v_conversation uuid;
begin
  select * into v_offer from public.offers where id = p_offer_id for update;
  if auth.uid() is null or v_offer.id is null or auth.uid() not in (v_offer.buyer_id,v_offer.seller_id)
     or v_offer.status not in ('open','countered') then
    raise exception 'offer_unavailable';
  end if;
  v_other := case when auth.uid() = v_offer.buyer_id then v_offer.seller_id else v_offer.buyer_id end;

  if p_action = 'accept' then
    if v_offer.created_by = auth.uid() then raise exception 'offer_recipient_required'; end if;
    perform public.reserve_listing_stock(p_offer_id,120);
    v_conversation := public.open_offer_conversation(p_offer_id);
    insert into public.notifications(owner_id,kind,title,body_safe,action_path)
    values(v_other,'offer','Offer accepted','Open the private conversation to arrange a safe handover.','/messages/' || v_conversation::text);
    return query select 'accepted'::text, v_conversation;
  elsif p_action = 'decline' then
    if v_offer.created_by = auth.uid() then raise exception 'offer_recipient_required'; end if;
    update public.offers set status='declined',updated_at=now() where id=p_offer_id;
    insert into public.notifications(owner_id,kind,title,body_safe,action_path)
    values(v_other,'offer','Offer declined','The other participant declined this offer.','/dashboard');
    return query select 'declined'::text, null::uuid;
  elsif p_action = 'cancel' then
    if v_offer.created_by <> auth.uid() then raise exception 'offer_creator_required'; end if;
    update public.offers set status='cancelled',updated_at=now() where id=p_offer_id;
    insert into public.notifications(owner_id,kind,title,body_safe,action_path)
    values(v_other,'offer','Offer cancelled','The offer creator cancelled this offer.','/dashboard');
    return query select 'cancelled'::text, null::uuid;
  else
    raise exception 'invalid_offer_action';
  end if;
end;
$$;

drop function if exists public.get_my_offer_summaries();
create function public.get_my_offer_summaries()
returns table(
  offer_id uuid,
  listing_id uuid,
  listing_slug text,
  listing_title text,
  post_type text,
  other_alias text,
  amount_inr integer,
  status text,
  updated_at timestamptz,
  direction text,
  conversation_id uuid
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.id, l.id, l.slug, l.title, l.post_type::text, p.alias, o.amount_inr,
         o.status::text, o.updated_at,
         case when o.created_by = auth.uid() then 'outgoing' else 'incoming' end,
         c.id
  from public.offers o
  join public.listings l on l.id = o.listing_id
  join public.profiles p on p.id = case when o.buyer_id = auth.uid() then o.seller_id else o.buyer_id end
  left join public.conversations c
    on c.listing_id=o.listing_id and c.buyer_id=o.buyer_id and c.seller_id=o.seller_id and c.hidden_at is null
  where auth.uid() in (o.buyer_id,o.seller_id)
  order by o.updated_at desc
$$;

create or replace function public.send_conversation_message(
  p_conversation_id uuid,
  p_body text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sender uuid := auth.uid();
  v_body text := trim(coalesce(p_body, ''));
  v_conversation public.conversations;
  v_message_id uuid;
  v_recipient uuid;
  v_listing_title text;
begin
  if v_sender is null or p_idempotency_key is null or char_length(v_body) not between 1 and 2000 then
    raise exception 'invalid_message';
  end if;
  select id into v_message_id from public.messages
  where sender_id = v_sender and idempotency_key = p_idempotency_key;
  if v_message_id is not null then return v_message_id; end if;

  select * into v_conversation from public.conversations where id = p_conversation_id for update;
  if v_conversation.id is null
     or v_sender not in (v_conversation.buyer_id, v_conversation.seller_id)
     or v_conversation.hidden_at is not null
     or v_conversation.status in ('completed','cancelled','expired') then
    raise exception 'conversation_unavailable';
  end if;
  if exists(select 1 from public.blocks where
    (blocker_id = v_conversation.buyer_id and blocked_id = v_conversation.seller_id)
    or (blocker_id = v_conversation.seller_id and blocked_id = v_conversation.buyer_id)) then
    raise exception 'interaction_blocked';
  end if;
  if exists(select 1 from public.messages
    where conversation_id = p_conversation_id and sender_id = v_sender
      and created_at > now() - interval '1 second') then
    raise exception 'message_rate_limited';
  end if;

  insert into public.messages(conversation_id,sender_id,body,kind,idempotency_key)
  values(p_conversation_id,v_sender,v_body,'text',p_idempotency_key)
  returning id into v_message_id;

  v_recipient := case when v_sender = v_conversation.buyer_id then v_conversation.seller_id else v_conversation.buyer_id end;
  select title into v_listing_title from public.listings where id=v_conversation.listing_id;
  insert into public.notifications(owner_id,kind,title,body_safe,action_path)
  values(v_recipient,'message','New private message',coalesce(v_listing_title,'Marketplace conversation'),'/messages/' || p_conversation_id::text);
  return v_message_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Moderation threads: admins can request changes and owners can reply without
-- exposing personal contact information or granting moderators listing ownership.
-- ---------------------------------------------------------------------------
create table if not exists public.moderation_threads (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null unique references public.listings(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  opened_by uuid not null references public.profiles(id),
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.moderation_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.moderation_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists moderation_messages_thread_created_idx on public.moderation_messages(thread_id,created_at);

alter table public.moderation_threads enable row level security;
alter table public.moderation_messages enable row level security;

drop policy if exists moderation_threads_participants_select on public.moderation_threads;
create policy moderation_threads_participants_select on public.moderation_threads
for select using (owner_id=auth.uid() or public.is_admin());

drop policy if exists moderation_messages_participants_select on public.moderation_messages;
create policy moderation_messages_participants_select on public.moderation_messages
for select using (exists(
  select 1 from public.moderation_threads t
  where t.id=thread_id and (t.owner_id=auth.uid() or public.is_admin())
));

revoke all on public.moderation_threads, public.moderation_messages from anon;
revoke insert, update, delete on public.moderation_threads, public.moderation_messages from authenticated;
grant select on public.moderation_threads, public.moderation_messages to authenticated;

create or replace function public.touch_moderation_thread_on_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.moderation_threads set updated_at=new.created_at where id=new.thread_id;
  return new;
end;
$$;
drop trigger if exists moderation_messages_touch_thread on public.moderation_messages;
create trigger moderation_messages_touch_thread
after insert on public.moderation_messages
for each row execute function public.touch_moderation_thread_on_message();

create or replace function public.send_listing_moderation_message(p_listing_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sender uuid := auth.uid();
  v_body text := trim(coalesce(p_body,''));
  v_listing public.listings;
  v_thread public.moderation_threads;
  v_recipient uuid;
begin
  if v_sender is null or char_length(v_body) not between 2 and 2000 then raise exception 'invalid_message'; end if;
  select * into v_listing from public.listings where id=p_listing_id;
  if v_listing.id is null then raise exception 'listing_not_found'; end if;

  select * into v_thread from public.moderation_threads where listing_id=p_listing_id for update;
  if public.is_admin() then
    if v_thread.id is null then
      insert into public.moderation_threads(listing_id,owner_id,opened_by)
      values(p_listing_id,v_listing.owner_id,v_sender) returning * into v_thread;
    end if;
    v_recipient := v_listing.owner_id;
  else
    if v_listing.owner_id <> v_sender or v_thread.id is null or v_thread.status <> 'open' then
      raise exception 'moderation_thread_unavailable';
    end if;
    v_recipient := null;
  end if;

  insert into public.moderation_messages(thread_id,sender_id,body)
  values(v_thread.id,v_sender,v_body);

  if v_recipient is not null and v_recipient <> v_sender then
    insert into public.notifications(owner_id,kind,title,body_safe,action_path)
    values(v_recipient,'moderation','Moderator message about your listing',v_listing.title,'/messages/moderation/' || v_thread.id::text);
  elsif not public.is_admin() then
    insert into public.notifications(owner_id,kind,title,body_safe,action_path)
    select ur.user_id,'moderation','Listing owner replied',v_listing.title,'/admin'
    from public.user_roles ur
    where ur.role in ('moderator','admin') and ur.user_id <> v_sender;
  end if;

  if public.is_admin() then
    insert into public.admin_audit_log(actor_id,action,target_type,target_id,metadata_redacted)
    values(v_sender,'moderation_message','listing',p_listing_id,'{}'::jsonb);
  end if;
  return v_thread.id;
end;
$$;

create or replace function public.get_my_moderation_thread_summaries()
returns table(
  thread_id uuid,
  listing_id uuid,
  listing_slug text,
  listing_title text,
  other_alias text,
  status text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.id,l.id,l.slug,l.title,
         case when public.is_admin() then p.alias else 'ONYX Moderation' end,
         t.status,t.updated_at
  from public.moderation_threads t
  join public.listings l on l.id=t.listing_id
  join public.profiles p on p.id=t.owner_id
  where t.owner_id=auth.uid() or public.is_admin()
  order by t.updated_at desc
$$;

create or replace function public.update_report_status(p_report_id uuid, p_status text, p_note text default '')
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_report public.reports;
begin
  if not public.is_admin() then raise exception 'moderator_required'; end if;
  if p_status not in ('reviewing','actioned','closed') or char_length(trim(coalesce(p_note,''))) > 500 then
    raise exception 'invalid_report_action';
  end if;
  select * into v_report from public.reports where id=p_report_id for update;
  if v_report.id is null then raise exception 'report_not_found'; end if;
  update public.reports set status=p_status where id=p_report_id;
  insert into public.admin_audit_log(actor_id,action,target_type,target_id,metadata_redacted)
  values(auth.uid(),'update_report_status','report',p_report_id,jsonb_build_object('status',p_status,'note_present',char_length(trim(coalesce(p_note,'')))>0));
  if p_status in ('actioned','closed') then
    insert into public.notifications(owner_id,kind,title,body_safe,action_path)
    values(v_report.reporter_id,'moderation','Your report was reviewed','The moderation team reviewed your private report.','/notifications');
  end if;
end;
$$;

create or replace function public.moderate_listing(
  p_listing_id uuid,
  p_action text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_listing public.listings;
begin
  if not public.is_admin() then raise exception 'moderator_required'; end if;
  if p_action not in ('approve','remove') or char_length(trim(p_reason)) not between 3 and 500 then
    raise exception 'invalid_moderation_action';
  end if;
  select * into v_listing from public.listings where id = p_listing_id for update;
  if v_listing.id is null then raise exception 'listing_not_found'; end if;
  if p_action = 'approve' then
    if v_listing.status <> 'pending_moderation' then raise exception 'listing_not_pending'; end if;
    update public.listings set status = 'active',
      expires_at = case when mode = 'live' then now() + interval '24 hours' else now() + interval '30 days' end,
      updated_at = now() where id = p_listing_id;
  else
    update public.listings set status = 'removed', updated_at = now() where id = p_listing_id;
  end if;
  insert into public.moderation_actions(listing_id,action,reason,moderator_id)
  values(p_listing_id,p_action,trim(p_reason),auth.uid());
  insert into public.admin_audit_log(actor_id,action,target_type,target_id,metadata_redacted)
  values(auth.uid(),'moderate_listing','listing',p_listing_id,jsonb_build_object('decision',p_action));
  update public.moderation_threads set status='closed',updated_at=now() where listing_id=p_listing_id;
  insert into public.notifications(owner_id,kind,title,body_safe,action_path)
  values(
    v_listing.owner_id,
    'moderation',
    case when p_action='approve' then 'Listing approved' else 'Listing removed' end,
    v_listing.title || ' · ' || trim(p_reason),
    '/dashboard'
  );
end;
$$;

-- Function privileges.
revoke all on function public.alias_is_allowed(text) from public, anon, authenticated;
revoke all on function public.normalize_alias_for_safety(text) from public, anon, authenticated;
revoke all on function public.enforce_safe_profile_alias() from public, anon, authenticated;
revoke all on function public.touch_moderation_thread_on_message() from public, anon, authenticated;
revoke all on function public.open_offer_conversation(uuid) from public, anon;
revoke all on function public.respond_to_offer(uuid,text) from public, anon;
revoke all on function public.get_my_offer_summaries() from public, anon;
revoke all on function public.send_listing_moderation_message(uuid,text) from public, anon;
revoke all on function public.get_my_moderation_thread_summaries() from public, anon;
revoke all on function public.update_report_status(uuid,text,text) from public, anon;

grant execute on function public.open_offer_conversation(uuid) to authenticated;
grant execute on function public.respond_to_offer(uuid,text) to authenticated;
grant execute on function public.get_my_offer_summaries() to authenticated;
grant execute on function public.send_listing_moderation_message(uuid,text) to authenticated;
grant execute on function public.get_my_moderation_thread_summaries() to authenticated;
grant execute on function public.update_report_status(uuid,text,text) to authenticated;

-- Add moderation messages to Realtime when the publication exists.
do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='moderation_messages') then
    alter publication supabase_realtime add table public.moderation_messages;
  end if;
end $$;
