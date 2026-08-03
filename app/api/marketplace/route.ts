import { createServiceSupabaseClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

type ImageRow = {
  id: string;
  listing_id: string;
  sort_order: number;
};

type ReputationRow = {
  alias: string;
  rating_count: number;
  average_rating: number | string;
};

function formatCondition(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const headers = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

export async function GET() {
  const service = createServiceSupabaseClient();
  if (!service) return Response.json({ error: "Marketplace is unavailable." }, { status: 503, headers });

  const { data, error } = await service
    .from("marketplace_listings")
    .select("id,slug,post_type,mode,title,description,condition,price_inr,budget_max_inr,negotiable,stock,reserved_stock,expires_at,created_at,owner_alias,owner_verified,location_slug,location_name,category_slug,category_name")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return Response.json({ error: "Marketplace is unavailable." }, { status: 503, headers });
  const rows = (data ?? []) as unknown as MarketplaceRow[];
  if (!rows.length) return Response.json({ items: [] }, { headers });

  const ids = rows.map((row) => row.id);
  const [{ data: imageData, error: imageError }, { data: reputationData, error: reputationError }] = await Promise.all([
    service.from("listing_images").select("id,listing_id,sort_order").in("listing_id", ids).order("sort_order", { ascending: true }),
    service.from("public_reputation").select("alias,rating_count,average_rating"),
  ]);

  if (imageError || reputationError) {
    return Response.json({ error: "Marketplace is unavailable." }, { status: 503, headers });
  }

  const imageMap = new Map<string, string[]>();
  for (const image of (imageData ?? []) as unknown as ImageRow[]) {
    const url = `/api/listing-images/${encodeURIComponent(image.id)}`;
    imageMap.set(image.listing_id, [...(imageMap.get(image.listing_id) ?? []), url]);
  }

  const reputationMap = new Map(
    ((reputationData ?? []) as unknown as ReputationRow[]).map((row) => [row.alias, row]),
  );

  const items = rows.map((row) => {
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
      conditionSlug: row.condition,
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

  return Response.json({ items }, { headers });
}
