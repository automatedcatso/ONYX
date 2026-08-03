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
  conditionSlug: string;
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
  locationSlug: string | null;
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

const nearbyResidenceGroups = [
  ["pg-potheri", "pg-trs", "estancia", "abode"],
  ["paari", "kaari", "oori", "adhiyaman", "nelson-mandela", "n-block-premium"],
  ["kalpana-chawla", "meenakshi", "m-block", "malligai", "thamarai", "mullai", "shenbagam", "esq-a-b"],
] as const;


export function formatCondition(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function normalizeCategoryFilter(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "all") return "all";
  const match = marketplaceCategories.find(([slug, name]) => slug === normalized || name.toLowerCase() === normalized);
  return match?.[0] ?? "all";
}

export function nearbyLocationSlugs(locationSlug: string | null | undefined) {
  if (!locationSlug) return [] as string[];
  const group = nearbyResidenceGroups.find((items) => (items as readonly string[]).includes(locationSlug));
  return group ? [...group] : [locationSlug];
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

export async function loadMarketplaceListings(_client: SupabaseClient): Promise<Listing[]> {
  const response = await fetch("/api/marketplace", {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => null) as { items?: unknown } | null;
  if (!response.ok || !payload || !Array.isArray(payload.items)) {
    throw new Error("Marketplace data could not be loaded.");
  }
  return payload.items as Listing[];
}

export async function loadUserProfile(client: SupabaseClient, userId: string): Promise<UserProfile | null> {
  const { data, error } = await client
    .from("profiles")
    .select("id,alias,location_id")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;

  let location = "Residence not selected";
  let locationSlug: string | null = null;
  if (data.location_id) {
    const { data: locationRow } = await client
      .from("locations")
      .select("name,slug")
      .eq("id", data.location_id)
      .maybeSingle();
    if (locationRow?.name) location = String(locationRow.name);
    if (locationRow?.slug) locationSlug = String(locationRow.slug);
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
    locationSlug,
    locationId: data.location_id ? String(data.location_id) : null,
    accountStatus,
    moderationReason,
    suspendedUntil,
    warningCount,
  };
}
