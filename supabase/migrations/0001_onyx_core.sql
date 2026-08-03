-- ONYX core schema. Review retention periods and campus-specific obligations before production.
create extension if not exists pgcrypto;

create type public.listing_post_type as enum ('sale', 'wanted');
create type public.listing_mode as enum ('live', 'standard');
create type public.listing_status as enum ('draft', 'pending_moderation', 'active', 'reserved', 'paused', 'sold', 'expired', 'rejected', 'removed');
create type public.offer_status as enum ('open', 'countered', 'accepted', 'declined', 'expired', 'cancelled');
create type public.deal_status as enum ('open', 'offered', 'reserved', 'meetup_planned', 'completed', 'cancelled', 'expired', 'disputed');

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  group_name text not null check (group_name in ('Nearby PG / off-campus', 'Hostel for Men', 'Hostel for Women', 'Co-ed / international formats')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.location_aliases (
  alias text primary key,
  location_id uuid not null references public.locations(id) on delete cascade
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  active boolean not null default true,
  feature_flag text,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  alias text not null unique check (char_length(alias) between 3 and 30 and alias ~ '^[A-Za-z0-9_-]+$'),
  first_name_private text,
  location_id uuid references public.locations(id),
  avatar_path text,
  verified_at timestamptz,
  terms_accepted_at timestamptz,
  privacy_accepted_at timestamptz,
  safety_accepted_at timestamptz,
  alias_changed_at timestamptz,
  suspended_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('student', 'moderator', 'admin')),
  primary key (user_id, role)
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  post_type public.listing_post_type not null,
  mode public.listing_mode not null default 'standard',
  status public.listing_status not null default 'draft',
  title text not null check (char_length(title) between 3 and 70),
  description text not null default '' check (char_length(description) <= 5000),
  category_id uuid not null references public.categories(id),
  location_id uuid not null references public.locations(id),
  meetup_zone text not null default 'Main/common gate',
  condition text not null check (condition in ('sealed', 'like_new', 'good', 'fair', 'for_parts', 'any_usable')),
  price_inr integer check (price_inr >= 0 and price_inr <= 10000000),
  budget_min_inr integer,
  budget_max_inr integer,
  negotiable boolean not null default false,
  barter_open boolean not null default false,
  stock integer not null default 1 check (stock >= 0 and stock <= 999),
  reserved_stock integer not null default 0 check (reserved_stock >= 0 and reserved_stock <= stock),
  attributes jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_document tsvector generated always as (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,''))) stored,
  check (post_type = 'wanted' or price_inr is not null),
  check (post_type = 'sale' or budget_max_inr is not null)
);

create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  storage_path text not null unique,
  alt_text text not null default '',
  sort_order smallint not null default 0 check (sort_order between 0 and 7),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  created_at timestamptz not null default now(),
  unique (listing_id, sort_order)
);

create table public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  criteria jsonb not null,
  alert_in_app boolean not null default true,
  alert_email boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  amount_inr integer not null check (amount_inr > 0),
  quantity integer not null default 1 check (quantity > 0),
  note text not null default '' check (char_length(note) <= 180),
  status public.offer_status not null default 'open',
  parent_offer_id uuid references public.offers(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (buyer_id <> seller_id)
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  offer_id uuid not null unique references public.offers(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id),
  seller_id uuid not null references public.profiles(id),
  quantity integer not null check (quantity > 0),
  expires_at timestamptz not null,
  released_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  buyer_id uuid not null references public.profiles(id),
  seller_id uuid not null references public.profiles(id),
  status public.deal_status not null default 'open',
  reported_at timestamptz,
  hidden_at timestamptz,
  deletion_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, buyer_id, seller_id),
  check (buyer_id <> seller_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  kind text not null default 'text' check (kind in ('text', 'offer', 'system', 'meetup')),
  body text not null check (char_length(body) between 1 and 2000),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique (sender_id, idempotency_key)
);

create table public.meetup_proposals (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  proposed_by uuid not null references public.profiles(id),
  broad_location text not null check (char_length(broad_location) between 3 and 120),
  proposed_at timestamptz not null,
  buyer_confirmed_at timestamptz,
  seller_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references public.conversations(id),
  listing_id uuid not null references public.listings(id),
  buyer_id uuid not null references public.profiles(id),
  seller_id uuid not null references public.profiles(id),
  quantity integer not null check (quantity > 0),
  outcome text not null check (outcome in ('completed', 'cancelled', 'disputed')),
  completed_at timestamptz,
  receipt_delete_after timestamptz not null
);

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  subject_id uuid not null references public.profiles(id),
  stars smallint not null check (stars between 1 and 5),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (transaction_id, author_id),
  check (author_id <> subject_id)
);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id),
  listing_id uuid references public.listings(id),
  conversation_id uuid references public.conversations(id),
  reason text not null,
  details text not null default '' check (char_length(details) <= 3000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'actioned', 'closed')),
  created_at timestamptz not null default now(),
  check (num_nonnulls(listing_id, conversation_id) = 1)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body_safe text not null,
  action_path text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid references public.profiles(id),
  listing_id uuid references public.listings(id),
  action text not null,
  reason text not null,
  moderator_id uuid not null references public.profiles(id),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in ('conversation', 'account', 'listing_image', 'chat_media')),
  resource_id uuid not null,
  due_at timestamptz not null,
  safety_hold boolean not null default false,
  attempts integer not null default 0,
  last_error_redacted text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.admin_audit_log (
  id bigserial primary key,
  actor_id uuid not null references public.profiles(id),
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata_redacted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index listings_active_location_created_idx on public.listings(location_id, created_at desc) where status = 'active';
create index listings_active_category_created_idx on public.listings(category_id, created_at desc) where status = 'active';
create index listings_search_idx on public.listings using gin(search_document);
create index offers_participant_status_idx on public.offers(buyer_id, seller_id, status, updated_at desc);
create index messages_conversation_created_idx on public.messages(conversation_id, created_at desc);
create index notifications_owner_unread_idx on public.notifications(owner_id, created_at desc) where read_at is null;
create index deletion_jobs_due_idx on public.deletion_jobs(due_at) where completed_at is null and safety_hold = false;

create view public.marketplace_listings as
select l.id,l.slug,l.post_type,l.mode,l.title,l.description,l.condition,l.price_inr,l.budget_min_inr,l.budget_max_inr,
       l.negotiable,l.barter_open,l.stock,l.reserved_stock,l.attributes,l.expires_at,l.created_at,l.updated_at,
       p.alias as owner_alias,(p.verified_at is not null) as owner_verified,p.created_at as owner_account_created_at,
       loc.slug as location_slug,loc.name as location_name,c.slug as category_slug,c.name as category_name
from public.listings l
join public.profiles p on p.id=l.owner_id
join public.locations loc on loc.id=l.location_id
join public.categories c on c.id=l.category_id
where l.status='active';

create view public.public_reputation as
select p.alias,count(r.id)::integer as rating_count,
       coalesce(round(avg(r.stars)::numeric,2),0) as average_rating
from public.profiles p left join public.ratings r on r.subject_id=p.id
group by p.id,p.alias;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('moderator','admin'));
$$;

create or replace function public.is_public_active_listing(p_listing_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.listings where id=p_listing_id and status='active');
$$;

create or replace function public.reserve_listing_stock(p_offer_id uuid, p_window_minutes integer default 120)
returns public.reservations language plpgsql security definer set search_path = public as $$
declare v_offer public.offers; v_listing public.listings; v_reservation public.reservations;
begin
  select * into v_offer from public.offers where id = p_offer_id for update;
  if v_offer.id is null or v_offer.seller_id <> auth.uid() or v_offer.status not in ('open','countered') then raise exception 'offer_not_reservable'; end if;
  select * into v_listing from public.listings where id = v_offer.listing_id for update;
  if v_listing.status <> 'active' or (v_listing.stock - v_listing.reserved_stock) < v_offer.quantity then raise exception 'insufficient_stock'; end if;
  update public.listings set reserved_stock = reserved_stock + v_offer.quantity, status = 'reserved', updated_at = now() where id = v_listing.id;
  update public.offers set status = 'accepted', updated_at = now() where id = v_offer.id;
  insert into public.reservations(listing_id,offer_id,buyer_id,seller_id,quantity,expires_at)
  values(v_listing.id,v_offer.id,v_offer.buyer_id,v_offer.seller_id,v_offer.quantity,now() + make_interval(mins => greatest(15,least(p_window_minutes,1440)))) returning * into v_reservation;
  return v_reservation;
end $$;

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.listing_images enable row level security;
alter table public.favorites enable row level security;
alter table public.saved_searches enable row level security;
alter table public.offers enable row level security;
alter table public.reservations enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.meetup_proposals enable row level security;
alter table public.transactions enable row level security;
alter table public.ratings enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.deletion_jobs enable row level security;
alter table public.admin_audit_log enable row level security;

create policy profiles_self_or_admin_select on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy listings_owner_or_admin_select on public.listings for select using (owner_id = auth.uid() or public.is_admin());
create policy listings_owner_insert on public.listings for insert with check (owner_id = auth.uid());
create policy listings_owner_update on public.listings for update using (owner_id = auth.uid() or public.is_admin()) with check (owner_id = auth.uid() or public.is_admin());
create policy listings_owner_delete on public.listings for delete using (owner_id = auth.uid() or public.is_admin());
create policy images_visible_listing on public.listing_images for select using (public.is_public_active_listing(listing_id) or exists(select 1 from public.listings l where l.id = listing_id and (l.owner_id=auth.uid() or public.is_admin())));
create policy images_owner_insert on public.listing_images for insert with check (exists(select 1 from public.listings l where l.id=listing_id and l.owner_id=auth.uid()));
create policy images_owner_update on public.listing_images for update using (exists(select 1 from public.listings l where l.id=listing_id and (l.owner_id=auth.uid() or public.is_admin())));
create policy images_owner_delete on public.listing_images for delete using (exists(select 1 from public.listings l where l.id=listing_id and (l.owner_id=auth.uid() or public.is_admin())));
create policy favorites_owner_all on public.favorites for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy searches_owner_all on public.saved_searches for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy offers_participants_select on public.offers for select using (auth.uid() in (buyer_id,seller_id) or public.is_admin());
create policy offers_buyer_insert on public.offers for insert with check (buyer_id = auth.uid() and buyer_id <> seller_id and not exists(select 1 from public.blocks b where (b.blocker_id=seller_id and b.blocked_id=buyer_id) or (b.blocker_id=buyer_id and b.blocked_id=seller_id)));
create policy offers_participants_update on public.offers for update using (auth.uid() in (buyer_id,seller_id));
create policy reservations_participants_select on public.reservations for select using (auth.uid() in (buyer_id,seller_id) or public.is_admin());
create policy conversations_participants_select on public.conversations for select using ((auth.uid() in (buyer_id,seller_id) and hidden_at is null) or public.is_admin());
create policy conversations_participants_insert on public.conversations for insert with check (auth.uid() in (buyer_id,seller_id));
create policy conversations_participants_update on public.conversations for update using (auth.uid() in (buyer_id,seller_id) or public.is_admin());
create policy messages_participants_select on public.messages for select using (exists(select 1 from public.conversations c where c.id=conversation_id and (auth.uid() in (c.buyer_id,c.seller_id) or public.is_admin()) and c.hidden_at is null));
create policy messages_participants_insert on public.messages for insert with check (sender_id=auth.uid() and exists(select 1 from public.conversations c where c.id=conversation_id and auth.uid() in (c.buyer_id,c.seller_id) and c.status not in ('completed','cancelled','expired')));
create policy meetup_participants_all on public.meetup_proposals for all using (exists(select 1 from public.conversations c where c.id=conversation_id and auth.uid() in (c.buyer_id,c.seller_id))) with check (proposed_by=auth.uid());
create policy transactions_participants_select on public.transactions for select using (auth.uid() in (buyer_id,seller_id) or public.is_admin());
create policy ratings_participants_select on public.ratings for select using (auth.uid() in (author_id,subject_id) or public.is_admin());
create policy ratings_author_insert on public.ratings for insert with check (author_id=auth.uid() and exists(select 1 from public.transactions t where t.id=transaction_id and t.outcome='completed' and auth.uid() in (t.buyer_id,t.seller_id) and subject_id in (t.buyer_id,t.seller_id)));
create policy blocks_owner_all on public.blocks for all using (blocker_id=auth.uid()) with check (blocker_id=auth.uid());
create policy reports_owner_select on public.reports for select using (reporter_id=auth.uid() or public.is_admin());
create policy reports_owner_insert on public.reports for insert with check (reporter_id=auth.uid());
create policy notifications_owner_all on public.notifications for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy moderation_admin_only on public.moderation_actions for all using (public.is_admin()) with check (public.is_admin());
create policy deletion_admin_only on public.deletion_jobs for all using (public.is_admin()) with check (public.is_admin());
create policy audit_admin_only on public.admin_audit_log for select using (public.is_admin());

grant execute on function public.reserve_listing_stock(uuid, integer) to authenticated;
grant select on public.marketplace_listings, public.public_reputation to anon, authenticated;
