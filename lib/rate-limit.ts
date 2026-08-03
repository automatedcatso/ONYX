import "server-only";
import { createHmac } from "node:crypto";
import { createServiceSupabaseClient } from "@/lib/supabase-server";

type RateLimitOptions = {
  request: Request;
  scope: string;
  identity?: string | null;
  limit: number;
  networkLimit?: number;
  windowSeconds: number;
  failClosed?: boolean;
};

type RateLimitRow = {
  allowed: boolean;
  remaining: number;
  reset_at: string;
};

type BucketResult = {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
};

export type RateLimitResult = {
  allowed: boolean;
  configured: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
};

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || "unknown";
}

function normalizeNetworkHint(value: string) {
  const candidate = value.trim().toLowerCase();
  if (/^[a-f0-9:.]{2,64}$/.test(candidate)) return `ip:${candidate}`;
  return null;
}

function requestNetworkIdentity(request: Request) {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip");
  const address = normalizeNetworkHint(firstHeaderValue(forwarded));
  if (address) return address;

  const agent = (request.headers.get("user-agent") ?? "unknown")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 240);
  return `fallback:${agent}`;
}

function bucketDigest(scope: string, dimension: "identity" | "network", value: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return null;
  const material = [scope, dimension, value.normalize("NFKC").toLowerCase()].join("|");
  return createHmac("sha256", secret).update(material).digest("hex");
}

function fallbackResult(allowed: boolean): RateLimitResult {
  return {
    allowed,
    configured: false,
    remaining: 0,
    resetAt: new Date(Date.now() + 60_000),
    retryAfterSeconds: 60,
  };
}

async function consumeBucket(
  service: NonNullable<ReturnType<typeof createServiceSupabaseClient>>,
  digest: string,
  limit: number,
  windowSeconds: number,
): Promise<BucketResult | null> {
  const { data, error } = await service.rpc("consume_api_rate_limit", {
    p_bucket_key: digest,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  const row = (Array.isArray(data) ? data[0] : data) as RateLimitRow | null;
  if (error || !row || typeof row.allowed !== "boolean") return null;

  return {
    allowed: row.allowed,
    remaining: Math.max(0, Number(row.remaining) || 0),
    resetAt: new Date(row.reset_at),
  };
}

export async function consumeRateLimit({
  request,
  scope,
  identity,
  limit,
  networkLimit = Math.max(limit * 4, limit),
  windowSeconds,
  failClosed = true,
}: RateLimitOptions): Promise<RateLimitResult> {
  const service = createServiceSupabaseClient();
  const networkDigest = bucketDigest(scope, "network", requestNetworkIdentity(request));
  const identityDigest = identity
    ? bucketDigest(scope, "identity", identity)
    : null;
  if (!service || !networkDigest || (identity && !identityDigest)) return fallbackResult(!failClosed);

  const requestedBuckets = [
    consumeBucket(service, networkDigest, networkLimit, windowSeconds),
    ...(identityDigest ? [consumeBucket(service, identityDigest, limit, windowSeconds)] : []),
  ];
  const buckets = await Promise.all(requestedBuckets);
  if (buckets.some((bucket) => !bucket)) return fallbackResult(!failClosed);

  const validBuckets = buckets.filter((bucket): bucket is BucketResult => Boolean(bucket));
  const resetAt = new Date(Math.max(...validBuckets.map((bucket) => bucket.resetAt.getTime())));
  const allowed = validBuckets.every((bucket) => bucket.allowed);
  return {
    allowed,
    configured: true,
    remaining: Math.min(...validBuckets.map((bucket) => bucket.remaining)),
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1_000)),
  };
}

export function rateLimitHeaders(result: RateLimitResult, limit: number) {
  if (!result.configured && result.allowed) return {} as Record<string, string>;
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.floor(result.resetAt.getTime() / 1_000)),
    ...(result.allowed ? {} : { "Retry-After": String(result.retryAfterSeconds) }),
  } as Record<string, string>;
}
