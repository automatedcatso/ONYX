-- ONYX production hardening for Supabase + Vercel.
-- Apply after 0001_onyx_core.sql and before accepting registrations.

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
  if v_alias !~ '^[A-Za-z][A-Za-z0-9_-]{2,23}$' then
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.sync_email_verification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update public.profiles set verified_at = now(), updated_at = now() where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_email_verified on auth.users;
create trigger on_auth_email_verified
after update of email_confirmed_at on auth.users
for each row execute function public.sync_email_verification();

alter table public.user_roles enable row level security;
drop policy if exists roles_self_or_admin_select on public.user_roles;
create policy roles_self_or_admin_select on public.user_roles
for select using (user_id = auth.uid() or public.is_admin());

create table if not exists public.marketplace_events (
  id bigserial primary key,
  listing_id uuid not null,
  event_kind text not null check (event_kind in ('listing_changed','images_changed')),
  created_at timestamptz not null default now()
);
alter table public.marketplace_events enable row level security;
alter table public.marketplace_events replica identity full;
drop policy if exists marketplace_events_public_read on public.marketplace_events;
create policy marketplace_events_public_read on public.marketplace_events for select using (true);
grant select on public.marketplace_events to anon, authenticated;

create or replace function public.emit_marketplace_listing_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if tg_op = 'DELETE' then
    v_id := old.id;
    if old.status in ('active','reserved') then
      insert into public.marketplace_events(listing_id,event_kind) values(v_id,'listing_changed');
    end if;
    return old;
  elsif tg_op = 'INSERT' then
    v_id := new.id;
    if new.status in ('active','reserved') then
      insert into public.marketplace_events(listing_id,event_kind) values(v_id,'listing_changed');
    end if;
    return new;
  else
    v_id := new.id;
  end if;

  if (old.status in ('active','reserved') or new.status in ('active','reserved'))
     and (old.status is distinct from new.status
     or old.stock is distinct from new.stock
     or old.reserved_stock is distinct from new.reserved_stock
     or old.price_inr is distinct from new.price_inr
     or old.budget_max_inr is distinct from new.budget_max_inr
     or old.expires_at is distinct from new.expires_at) then
    insert into public.marketplace_events(listing_id,event_kind) values(v_id,'listing_changed');
  end if;
  return new;
end;
$$;

drop trigger if exists listings_emit_marketplace_event on public.listings;
create trigger listings_emit_marketplace_event
after insert or update or delete on public.listings
for each row execute function public.emit_marketplace_listing_event();

create or replace function public.emit_marketplace_image_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing_id uuid;
  v_is_public boolean;
begin
  v_listing_id := case when tg_op = 'DELETE' then old.listing_id else new.listing_id end;
  select exists(
    select 1 from public.listings
    where id = v_listing_id and status in ('active','reserved')
  ) into v_is_public;
  if v_is_public then
    insert into public.marketplace_events(listing_id,event_kind) values(v_listing_id,'images_changed');
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists listing_images_emit_marketplace_event on public.listing_images;
create trigger listing_images_emit_marketplace_event
after insert or update or delete on public.listing_images
for each row execute function public.emit_marketplace_image_event();

create or replace function public.is_public_active_listing(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.listings l
    where l.id = p_listing_id
      and l.status in ('active','reserved')
      and (l.expires_at is null or l.expires_at > now())
      and l.stock > coalesce((
        select sum(r.quantity) from public.reservations r
        where r.listing_id = l.id and r.released_at is null and r.expires_at > now()
      ),0)
  )
$$;

create or replace view public.marketplace_listings as
select l.id,l.slug,l.post_type,l.mode,l.title,l.description,l.condition,l.price_inr,l.budget_min_inr,l.budget_max_inr,
       l.negotiable,l.barter_open,l.stock,least(l.stock,active_reservations.quantity)::integer as reserved_stock,l.attributes,l.expires_at,l.created_at,l.updated_at,
       p.alias as owner_alias,(p.verified_at is not null) as owner_verified,p.created_at as owner_account_created_at,
       loc.slug as location_slug,loc.name as location_name,c.slug as category_slug,c.name as category_name
from public.listings l
join public.profiles p on p.id=l.owner_id
join public.locations loc on loc.id=l.location_id
join public.categories c on c.id=l.category_id
cross join lateral (
  select coalesce(sum(r.quantity),0)::integer as quantity
  from public.reservations r
  where r.listing_id=l.id and r.released_at is null and r.expires_at > now()
) active_reservations
where l.status in ('active','reserved')
  and l.stock > active_reservations.quantity
  and (l.expires_at is null or l.expires_at > now());

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
  if v_offer.id is null or v_offer.seller_id <> auth.uid() or v_offer.status not in ('open','countered') then raise exception 'offer_not_reservable'; end if;
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

  if v_listing.status not in ('active','reserved') or (v_listing.stock-v_listing.reserved_stock) < v_offer.quantity then raise exception 'insufficient_stock'; end if;
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

-- Direct client writes are deliberately narrow. Sensitive state transitions use RPCs below.
drop policy if exists listings_owner_insert on public.listings;
drop policy if exists listings_owner_update on public.listings;
drop policy if exists listings_owner_delete on public.listings;
drop policy if exists offers_buyer_insert on public.offers;
drop policy if exists offers_participants_update on public.offers;
drop policy if exists conversations_participants_insert on public.conversations;
drop policy if exists conversations_participants_update on public.conversations;
drop policy if exists messages_participants_insert on public.messages;
drop policy if exists reports_owner_insert on public.reports;
drop policy if exists profiles_self_update on public.profiles;

revoke insert, update, delete on public.listings from authenticated;
revoke insert, update, delete on public.offers from authenticated;
revoke insert, update, delete on public.conversations from authenticated;
revoke insert, update, delete on public.messages from authenticated;
revoke insert, update, delete on public.reports from authenticated;
revoke update on public.profiles from authenticated;
revoke update on public.notifications from authenticated;

grant select on public.locations, public.categories to anon, authenticated;
grant select on public.marketplace_listings, public.public_reputation to anon, authenticated;
grant select on public.listings, public.user_roles to authenticated;
grant select on public.listing_images to anon, authenticated;
grant insert, delete on public.listing_images to authenticated;
grant select, insert, delete on public.favorites to authenticated;
grant select on public.offers, public.conversations to authenticated;
grant select on public.messages, public.reports to authenticated;
grant select on public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;
grant select on public.profiles to authenticated;

create or replace function public.create_marketplace_listing(
  p_post_type text,
  p_mode text,
  p_title text,
  p_description text,
  p_category_slug text,
  p_location_slug text,
  p_condition text,
  p_price_inr integer default null,
  p_budget_max_inr integer default null,
  p_negotiable boolean default false,
  p_stock integer default 1
)
returns table(id uuid, slug text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_category uuid;
  v_location uuid;
  v_id uuid := gen_random_uuid();
  v_slug text;
  v_title text := trim(p_title);
  v_description text := trim(p_description);
begin
  if v_owner is null or not exists (
    select 1 from public.profiles where profiles.id = v_owner
      and verified_at is not null and coalesce(suspended_until, '-infinity') < now()
  ) then raise exception 'verified_account_required'; end if;
  if p_post_type not in ('sale','wanted') or p_mode not in ('live','standard') then raise exception 'invalid_listing_type'; end if;
  if p_condition not in ('sealed','like_new','good','fair','for_parts','any_usable') then raise exception 'invalid_condition'; end if;
  if char_length(v_title) not between 3 and 70 or char_length(v_description) not between 10 and 5000 then raise exception 'invalid_listing_copy'; end if;
  if p_stock not between 1 and 99 then raise exception 'invalid_stock'; end if;
  if p_post_type = 'sale' and (p_price_inr is null or p_price_inr not between 1 and 10000000) then raise exception 'invalid_price'; end if;
  if p_post_type = 'wanted' and (p_budget_max_inr is null or p_budget_max_inr not between 1 and 10000000) then raise exception 'invalid_budget'; end if;

  select categories.id into v_category from public.categories where categories.slug = p_category_slug and active = true;
  select locations.id into v_location from public.locations where locations.slug = p_location_slug and active = true;
  if v_category is null or v_location is null then raise exception 'invalid_taxonomy'; end if;

  v_slug := coalesce(nullif(left(trim(both '-' from regexp_replace(lower(v_title), '[^a-z0-9]+', '-', 'g')), 48), ''), 'listing')
    || '-' || left(replace(v_id::text, '-', ''), 10);

  insert into public.listings(
    id, slug, owner_id, post_type, mode, status, title, description,
    category_id, location_id, condition, price_inr, budget_max_inr,
    negotiable, stock, expires_at
  ) values (
    v_id, v_slug, v_owner, p_post_type::public.listing_post_type,
    p_mode::public.listing_mode, 'pending_moderation', v_title, v_description,
    v_category, v_location, p_condition,
    case when p_post_type = 'sale' then p_price_inr else null end,
    case when p_post_type = 'wanted' then p_budget_max_inr else null end,
    p_negotiable, case when p_post_type = 'wanted' then 1 else p_stock end,
    null
  );
  return query select v_id, v_slug;
end;
$$;

create or replace function public.withdraw_own_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.listings
  where id = p_listing_id and owner_id = auth.uid() and status = 'pending_moderation';
end;
$$;

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
  if exists(
    select 1 from public.offers
    where listing_id = v_listing.id and buyer_id = v_buyer and seller_id = v_seller
      and status in ('open','countered') and created_at > now() - interval '60 seconds'
  ) then raise exception 'offer_rate_limited'; end if;
  insert into public.offers(listing_id,buyer_id,seller_id,amount_inr,note,expires_at)
  values(v_listing.id,v_buyer,v_seller,p_amount_inr,trim(coalesce(p_note,'')),now() + interval '24 hours')
  returning offers.id into v_offer_id;
  return v_offer_id;
end;
$$;

create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.conversations set updated_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
after insert on public.messages
for each row execute function public.touch_conversation_on_message();

create or replace function public.start_conversation_for_listing(p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.listings;
  v_conversation uuid;
begin
  select * into v_listing from public.listings
  where id = p_listing_id
    and status in ('active','reserved')
    and (expires_at is null or expires_at > now())
    and stock > coalesce((
      select sum(quantity) from public.reservations
      where listing_id = p_listing_id and released_at is null and expires_at > now()
    ),0);
  if auth.uid() is null or v_listing.id is null or v_listing.owner_id = auth.uid() then raise exception 'conversation_unavailable'; end if;
  if exists(select 1 from public.blocks where
    (blocker_id = auth.uid() and blocked_id = v_listing.owner_id)
    or (blocker_id = v_listing.owner_id and blocked_id = auth.uid())) then raise exception 'interaction_blocked'; end if;
  insert into public.conversations(listing_id,buyer_id,seller_id)
  values(v_listing.id,auth.uid(),v_listing.owner_id)
  on conflict (listing_id,buyer_id,seller_id)
  do update set hidden_at = null, updated_at = now()
  returning conversations.id into v_conversation;
  return v_conversation;
end;
$$;

create or replace function public.get_my_conversation_summaries()
returns table(
  conversation_id uuid, listing_id uuid, listing_slug text, listing_title text,
  other_alias text, status text, updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, l.id, l.slug, l.title, p.alias, c.status::text, c.updated_at
  from public.conversations c
  join public.listings l on l.id = c.listing_id
  join public.profiles p on p.id = case when c.buyer_id = auth.uid() then c.seller_id else c.buyer_id end
  where auth.uid() in (c.buyer_id,c.seller_id) and c.hidden_at is null
  order by c.updated_at desc
$$;

create or replace function public.get_my_offer_summaries()
returns table(
  offer_id uuid, listing_title text, other_alias text, amount_inr integer,
  status text, updated_at timestamptz, direction text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.id, l.title, p.alias, o.amount_inr, o.status::text, o.updated_at,
    case when o.seller_id = auth.uid() then 'incoming' else 'outgoing' end
  from public.offers o
  join public.listings l on l.id = o.listing_id
  join public.profiles p on p.id = case when o.seller_id = auth.uid() then o.buyer_id else o.seller_id end
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
begin
  if v_sender is null or p_idempotency_key is null or char_length(v_body) not between 1 and 2000 then
    raise exception 'invalid_message';
  end if;

  select id into v_message_id from public.messages
  where sender_id = v_sender and idempotency_key = p_idempotency_key;
  if v_message_id is not null then return v_message_id; end if;

  select * into v_conversation from public.conversations
  where id = p_conversation_id for update;
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
  return v_message_id;
end;
$$;

create or replace function public.report_marketplace_listing(
  p_listing_id uuid,
  p_details text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reporter uuid := auth.uid();
  v_details text := trim(coalesce(p_details, ''));
  v_report_id uuid;
begin
  if v_reporter is null or char_length(v_details) not between 5 and 1000 then
    raise exception 'invalid_report';
  end if;
  if not exists(select 1 from public.listings
    where id = p_listing_id and status in ('active','reserved')) then
    raise exception 'listing_unavailable';
  end if;
  if exists(select 1 from public.reports
    where reporter_id = v_reporter and listing_id = p_listing_id
      and created_at > now() - interval '10 minutes') then
    raise exception 'report_rate_limited';
  end if;
  insert into public.reports(reporter_id,listing_id,reason,details)
  values(v_reporter,p_listing_id,'listing_safety_or_accuracy',v_details)
  returning id into v_report_id;
  return v_report_id;
end;
$$;

create or replace function public.report_private_conversation(
  p_conversation_id uuid,
  p_details text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reporter uuid := auth.uid();
  v_details text := trim(coalesce(p_details, ''));
  v_conversation public.conversations;
  v_report_id uuid;
begin
  if v_reporter is null or char_length(v_details) not between 5 and 1000 then
    raise exception 'invalid_report';
  end if;
  select * into v_conversation from public.conversations
  where id = p_conversation_id for update;
  if v_conversation.id is null
     or v_reporter not in (v_conversation.buyer_id,v_conversation.seller_id) then
    raise exception 'conversation_unavailable';
  end if;
  if exists(select 1 from public.reports
    where reporter_id = v_reporter and conversation_id = p_conversation_id
      and created_at > now() - interval '10 minutes') then
    raise exception 'report_rate_limited';
  end if;
  insert into public.reports(reporter_id,conversation_id,reason,details)
  values(v_reporter,p_conversation_id,'conversation_safety',v_details)
  returning id into v_report_id;
  update public.conversations
    set reported_at = coalesce(reported_at,now()), updated_at = now()
    where id = p_conversation_id;
  update public.deletion_jobs set safety_hold = true
    where resource_type = 'conversation' and resource_id = p_conversation_id and completed_at is null;
  return v_report_id;
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
  if v_owner is null or v_alias !~ '^[A-Za-z][A-Za-z0-9_-]{2,23}$' then
    raise exception 'invalid_profile';
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

create or replace function public.update_listing_inventory(
  p_listing_id uuid,
  p_action text,
  p_stock integer default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.listings;
begin
  select * into v_listing from public.listings where id = p_listing_id and owner_id = auth.uid() for update;
  if v_listing.id is null then raise exception 'listing_not_owned'; end if;
  if p_action = 'stock' then
    if p_stock is null or p_stock not between v_listing.reserved_stock and 99 then raise exception 'invalid_stock'; end if;
    update public.listings set stock = p_stock,
      status = case when p_stock = 0 then 'sold'::public.listing_status else status end,
      sold_at = case when p_stock = 0 then now() else sold_at end, updated_at = now()
    where id = p_listing_id;
  elsif p_action = 'pause' and v_listing.status in ('active','reserved') then
    update public.listings set status = 'paused', updated_at = now() where id = p_listing_id;
  elsif p_action = 'resume' and v_listing.status = 'paused' then
    update public.listings set status = 'active',
      expires_at = case when mode = 'live' then now() + interval '24 hours' else now() + interval '30 days' end,
      updated_at = now() where id = p_listing_id;
  elsif p_action = 'sold' and v_listing.status not in ('sold','removed','rejected') and v_listing.reserved_stock = 0 then
    update public.listings set status = 'sold', sold_at = now(), updated_at = now() where id = p_listing_id;
  else
    raise exception 'invalid_listing_transition';
  end if;
end;
$$;

create or replace function public.request_account_deletion()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_job uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select id into v_job from public.deletion_jobs
  where resource_type = 'account' and resource_id = auth.uid() and completed_at is null
  order by created_at desc limit 1;
  if v_job is null then
    insert into public.deletion_jobs(resource_type,resource_id,due_at)
    values('account',auth.uid(),now() + interval '30 days') returning id into v_job;
  end if;
  return v_job;
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
  if p_action not in ('approve','remove') or char_length(trim(p_reason)) not between 3 and 500 then raise exception 'invalid_moderation_action'; end if;
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
end;
$$;

create or replace function public.run_expiration_maintenance()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_reservation record;
begin
  update public.offers o set status = 'expired', updated_at = now()
  where o.status = 'accepted' and exists (
    select 1 from public.reservations r
    where r.offer_id = o.id and r.released_at is null and r.expires_at <= now()
  );
  for v_reservation in
    update public.reservations
      set released_at = now()
      where released_at is null and expires_at <= now()
      returning listing_id, quantity
  loop
    update public.listings
      set reserved_stock = greatest(0, reserved_stock - v_reservation.quantity),
          status = case
            when status = 'reserved' and stock > greatest(0,reserved_stock-v_reservation.quantity) then 'active'::public.listing_status
            else status
          end,
          updated_at = now()
      where id = v_reservation.listing_id;
  end loop;

  update public.offers set status = 'expired', updated_at = now()
    where status in ('open','countered') and expires_at <= now();
  update public.listings set status = 'expired', updated_at = now()
    where status in ('active','reserved','paused') and expires_at is not null and expires_at <= now();
  delete from public.marketplace_events where created_at < now() - interval '2 days';
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.sync_email_verification() from public, anon, authenticated;
revoke all on function public.touch_conversation_on_message() from public, anon, authenticated;
revoke all on function public.emit_marketplace_listing_event() from public, anon, authenticated;
revoke all on function public.emit_marketplace_image_event() from public, anon, authenticated;
revoke all on function public.reserve_listing_stock(uuid,integer) from public, anon;
revoke all on function public.create_marketplace_listing(text,text,text,text,text,text,text,integer,integer,boolean,integer) from public, anon;
revoke all on function public.withdraw_own_listing(uuid) from public, anon;
revoke all on function public.create_offer_for_listing(uuid,integer,text) from public, anon;
revoke all on function public.start_conversation_for_listing(uuid) from public, anon;
revoke all on function public.get_my_conversation_summaries() from public, anon;
revoke all on function public.get_my_offer_summaries() from public, anon;
revoke all on function public.send_conversation_message(uuid,text,uuid) from public, anon;
revoke all on function public.report_marketplace_listing(uuid,text) from public, anon;
revoke all on function public.report_private_conversation(uuid,text) from public, anon;
revoke all on function public.update_my_profile(text,text) from public, anon;
revoke all on function public.update_listing_inventory(uuid,text,integer) from public, anon;
revoke all on function public.request_account_deletion() from public, anon;
revoke all on function public.moderate_listing(uuid,text,text) from public, anon;
revoke all on function public.run_expiration_maintenance() from public, anon, authenticated;

grant execute on function public.create_marketplace_listing(text,text,text,text,text,text,text,integer,integer,boolean,integer) to authenticated;
grant execute on function public.reserve_listing_stock(uuid,integer) to authenticated;
grant execute on function public.withdraw_own_listing(uuid) to authenticated;
grant execute on function public.create_offer_for_listing(uuid,integer,text) to authenticated;
grant execute on function public.start_conversation_for_listing(uuid) to authenticated;
grant execute on function public.get_my_conversation_summaries() to authenticated;
grant execute on function public.get_my_offer_summaries() to authenticated;
grant execute on function public.send_conversation_message(uuid,text,uuid) to authenticated;
grant execute on function public.report_marketplace_listing(uuid,text) to authenticated;
grant execute on function public.report_private_conversation(uuid,text) to authenticated;
grant execute on function public.update_my_profile(text,text) to authenticated;
grant execute on function public.update_listing_inventory(uuid,text,integer) to authenticated;
grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.moderate_listing(uuid,text,text) to authenticated;
grant execute on function public.run_expiration_maintenance() to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('listing-images','listing-images',true,8388608,array['image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists listing_images_public_read on storage.objects;
create policy listing_images_public_read on storage.objects for select
using (
  bucket_id = 'listing-images'
  and exists (
    select 1 from public.listings l
    where l.id::text = (storage.foldername(name))[1]
      and (public.is_public_active_listing(l.id) or l.owner_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists listing_images_owner_upload on storage.objects;
create policy listing_images_owner_upload on storage.objects for insert to authenticated
with check (
  bucket_id = 'listing-images'
  and lower(storage.extension(name)) = 'webp'
  and exists (
    select 1 from public.listings l
    where l.id::text = (storage.foldername(name))[1] and l.owner_id = auth.uid()
  )
);

drop policy if exists listing_images_owner_delete on storage.objects;
create policy listing_images_owner_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'listing-images'
  and exists (
    select 1 from public.listings l
    where l.id::text = (storage.foldername(name))[1] and l.owner_id = auth.uid()
  )
);

do $$
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'marketplace_events') then
    alter publication supabase_realtime add table public.marketplace_events;
  end if;
end $$;
