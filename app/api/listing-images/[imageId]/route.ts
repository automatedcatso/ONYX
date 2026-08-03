import { createServiceSupabaseClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const imageHeaders = {
  "Cache-Control": "private, max-age=60, must-revalidate",
  "Content-Disposition": "inline",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
} as const;

function unavailable(status: number) {
  return new Response(null, {
    status,
    headers: {
      ...imageHeaders,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ imageId: string }> },
) {
  const { imageId } = await context.params;
  if (!UUID_PATTERN.test(imageId)) return unavailable(404);

  const service = createServiceSupabaseClient();
  if (!service) return unavailable(503);

  const { data: image, error: imageError } = await service
    .from("listing_images")
    .select("id,listing_id,storage_path")
    .eq("id", imageId)
    .maybeSingle();

  if (imageError || !image) return unavailable(404);

  const { data: publicListing, error: listingError } = await service
    .from("marketplace_listings")
    .select("id")
    .eq("id", image.listing_id)
    .maybeSingle();

  if (listingError || !publicListing) return unavailable(404);

  const { data: signed, error: signedError } = await service.storage
    .from("listing-images")
    .createSignedUrl(String(image.storage_path), 120);

  if (signedError || !signed?.signedUrl) return unavailable(404);

  const upstream = await fetch(signed.signedUrl, {
    cache: "no-store",
    headers: { Accept: "image/webp,image/*;q=0.8" },
  });

  if (!upstream.ok || !upstream.body) return unavailable(404);

  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...imageHeaders,
      "Content-Type": upstream.headers.get("content-type") || "image/webp",
      ...(upstream.headers.get("content-length")
        ? { "Content-Length": upstream.headers.get("content-length") as string }
        : {}),
    },
  });
}
