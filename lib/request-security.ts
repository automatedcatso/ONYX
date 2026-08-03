import { publicApplicationOrigin } from "@/lib/runtime-config";

const JSON_TYPE = "application/json";

export const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

function originOf(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function firstForwardedValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || null;
}

export function isTrustedMutationRequest(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith(JSON_TYPE)) return false;

  const origin = originOf(request.headers.get("origin"));
  if (!origin) return false;

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) return false;

  const allowedOrigins = new Set<string>();
  const requestOrigin = originOf(request.url);
  const configuredOrigin = publicApplicationOrigin();
  if (requestOrigin) allowedOrigins.add(requestOrigin);
  if (configuredOrigin) allowedOrigins.add(configuredOrigin);

  const forwardedHost = firstForwardedValue(request.headers.get("x-forwarded-host"));
  const forwardedProtocol = firstForwardedValue(request.headers.get("x-forwarded-proto"));
  if (forwardedHost && (forwardedProtocol === "http" || forwardedProtocol === "https")) {
    const forwardedOrigin = originOf(`${forwardedProtocol}://${forwardedHost}`);
    if (forwardedOrigin) allowedOrigins.add(forwardedOrigin);
  }

  if (process.env.NODE_ENV !== "production" && requestOrigin) {
    const requestUrl = new URL(requestOrigin);
    if (requestUrl.hostname === "127.0.0.1" || requestUrl.hostname === "localhost") {
      const port = requestUrl.port ? `:${requestUrl.port}` : "";
      allowedOrigins.add(`${requestUrl.protocol}//127.0.0.1${port}`);
      allowedOrigins.add(`${requestUrl.protocol}//localhost${port}`);
    }
  }

  return allowedOrigins.has(origin);
}

export const publicAppUrl = publicApplicationOrigin;
