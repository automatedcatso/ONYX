import type { SupabaseClient } from "@supabase/supabase-js";

export type ListingStatus =
  | "draft"
  | "pending_moderation"
  | "active"
  | "reserved"
  | "paused"
  | "sold"
  | "expired"
  | "rejected"
  | "removed";

export type Listing = {
  id: string;
  slug: string;
  title: string;
  description: string;
  postType: "sale" | "wanted";
  live: boolean;
  category: string;
  categorySlug: string;
  location: string;
  locationSlug: string;
  price: number;
  condition: string;
  stock: number;
  reservedStock: number;
  rating: number;
  reviews: number;
  seller: string;
  ownerVerified: boolean;
  expiresAt: string | null;
  createdAt: string;
  imageUrls: string[];
  negotiable: boolean;
  status: ListingStatus;
};

export type UserProfile = {
  id: string;
  alias: string;
  location: string;
  locationId: string | null;
  accountStatus: "active" | "warned" | "suspended" | "banned";
  moderationReason: string;
  suspendedUntil: string | null;
  warningCount: number;
};

export const campusLocations = [
  ["pg-potheri", "PG Potheri"],
  ["pg-trs", "PG TRS"],
  ["estancia", "Estancia"],
  ["abode", "Abode"],
  ["paari", "Paari"],
  ["kaari", "Kaari"],
  ["oori", "Oori"],
  ["adhiyaman", "Adhiyaman"],
  ["nelson-mandela", "Nelson Mandela"],
  ["n-block-premium", "N Block (Premium)"],
  ["kalpana-chawla", "Kalpana Chawla"],
  ["meenakshi", "Meenakshi"],
  ["m-block", "M Block"],
  ["malligai", "Malligai"],
  ["thamarai", "Thamarai"],
  ["mullai", "Mullai"],
  ["shenbagam", "Shenbagam"],
  ["esq-a-b", "ESQ – A & B"],
] as const;

export const marketplaceCategories = [
  ["room-essentials", "Room essentials", "Mattresses, mirrors, storage", "package"],
  ["kitchen-cooking", "Kitchen and cooking", "Induction, kettles, cookware", "spark"],
  ["study-books", "Study supplies and books", "Books, lamps, calculators", "bookmark"],
  ["cycles-mobility", "Cycles and mobility", "Cycles, locks, helmets", "refresh"],
  ["electronics", "Electronics", "Monitors, speakers, chargers", "settings"],
  ["bedding", "Bedding", "Pillows, quilts, floor mats", "grid"],
  ["fitness-sports", "Fitness and sports", "Weights, mats, racquets", "shield"],
  ["appliances-cooling", "Appliances and cooling", "Fans, coolers, extensions", "spark"],
] as const;

type MarketplaceRow = {
  id: string;
  slug: string;
  post_type: "sale" | "wanted";
  mode: "live" | "standard";
  title: string;
  description: string;
  condition: string;
  price_inr: number | null;
  budget_max_inr: number | null;
  negotiable: boolean;
  stock: number;
  reserved_stock: number;
  expires_at: string | null;
  created_at: string;
  owner_alias: string;
  owner_verified: boolean;
  location_slug: string;
  location_name: string;
  category_slug: string;
  category_name: string;
};

type ListingImageRow = {
  listing_id: string;
  storage_path: string;
  sort_order: number;
};

type ReputationRow = {
  alias: string;
  rating_count: number;
  average_rating: number | string;
};

export function formatCondition(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatRelativeTime(value: string) {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(delta / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function expiryLabel(expiresAt: string | null) {
  if (!expiresAt) return "Standard";
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return "Expired";
  const hours = Math.ceil(remaining / 3_600_000);
  return hours < 24 ? `${hours}h left` : `${Math.ceil(hours / 24)}d left`;
}

export async function loadMarketplaceListings(client: SupabaseClient): Promise<Listing[]> {
  const { data, error } = await client
    .from("marketplace_listings")
    .select("id,slug,post_type,mode,title,description,condition,price_inr,budget_max_inr,negotiable,stock,reserved_stock,expires_at,created_at,owner_alias,owner_verified,location_slug,location_name,category_slug,category_name")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error("Marketplace data could not be loaded.");
  const rows = (data ?? []) as unknown as MarketplaceRow[];
  if (!rows.length) return [];

  const ids = rows.map((row) => row.id);
  const [{ data: imageData }, { data: reputationData }] = await Promise.all([
    client
      .from("listing_images")
      .select("listing_id,storage_path,sort_order")
      .in("listing_id", ids)
      .order("sort_order", { ascending: true }),
    client.from("public_reputation").select("alias,rating_count,average_rating"),
  ]);

  const imageMap = new Map<string, string[]>();
  const signedImages = await Promise.all(
    ((imageData ?? []) as unknown as ListingImageRow[]).map(async (image) => {
      const { data: signed } = await client.storage.from("listing-images").createSignedUrl(image.storage_path, 21_600);
      return { ...image, url: signed?.signedUrl ?? "" };
    }),
  );
  for (const image of signedImages) {
    if (!image.url) continue;
    imageMap.set(image.listing_id, [...(imageMap.get(image.listing_id) ?? []), image.url]);
  }
  const reputationMap = new Map(
    ((reputationData ?? []) as unknown as ReputationRow[]).map((row) => [row.alias, row]),
  );

  return rows.map((row) => {
    const reputation = reputationMap.get(row.owner_alias);
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      postType: row.post_type,
      live: row.mode === "live",
      category: row.category_name,
      categorySlug: row.category_slug,
      location: row.location_name,
      locationSlug: row.location_slug,
      price: row.post_type === "wanted" ? row.budget_max_inr ?? 0 : row.price_inr ?? 0,
      condition: formatCondition(row.condition),
      stock: row.stock,
      reservedStock: row.reserved_stock,
      rating: Number(reputation?.average_rating ?? 0),
      reviews: reputation?.rating_count ?? 0,
      seller: row.owner_alias,
      ownerVerified: row.owner_verified,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      imageUrls: imageMap.get(row.id) ?? [],
      negotiable: row.negotiable,
      status: "active",
    };
  });
}

export async function loadUserProfile(client: SupabaseClient, userId: string): Promise<UserProfile | null> {
  const { data, error } = await client
    .from("profiles")
    .select("id,alias,location_id")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;

  let location = "Residence not selected";
  if (data.location_id) {
    const { data: locationRow } = await client
      .from("locations")
      .select("name")
      .eq("id", data.location_id)
      .maybeSingle();
    if (locationRow?.name) location = locationRow.name;
  }

  let accountStatus: UserProfile["accountStatus"] = "active";
  let moderationReason = "";
  let suspendedUntil: string | null = null;
  let warningCount = 0;
  const { data: state } = await client.rpc("get_my_account_state");
  const accountState = Array.isArray(state) ? state[0] : state;
  if (accountState && typeof accountState === "object") {
    const row = accountState as { status?:string; reason?:string; suspended_until?:string|null; warning_count?:number };
    if (["active","warned","suspended","banned"].includes(String(row.status))) {
      accountStatus = String(row.status) as UserProfile["accountStatus"];
    }
    moderationReason = String(row.reason ?? "");
    suspendedUntil = row.suspended_until ? String(row.suspended_until) : null;
    warningCount = Number(row.warning_count ?? 0);
  }

  return {
    id: String(data.id),
    alias: String(data.alias),
    location,
    locationId: data.location_id ? String(data.location_id) : null,
    accountStatus,
    moderationReason,
    suspendedUntil,
    warningCount,
  };
}
