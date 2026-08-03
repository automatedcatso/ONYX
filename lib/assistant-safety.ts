const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const INTERNAL_REFERENCE_PATTERN = /\b(?:listing\s*)?(?:id|uuid)\s*[:#=-]?\s*(?:item[\s_-]*\d+)?/gi;
const ITEM_REFERENCE_PATTERN = /\bitem[\s_-]*\d+\b/gi;

function unwrapStructuredText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";

  if (Array.isArray(value)) {
    return value.map(unwrapStructuredText).filter(Boolean).join(" ");
  }

  const record = value as Record<string, unknown>;
  for (const key of ["text", "answer", "message", "response", "content"]) {
    const candidate = unwrapStructuredText(record[key]);
    if (candidate) return candidate;
  }
  return "";
}

function unwrapPossibleJson(raw: string): string {
  const withoutFence = raw
    .replace(/^\s*```(?:json|text|markdown)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  if (!(withoutFence.startsWith("{") || withoutFence.startsWith("["))) {
    return withoutFence;
  }

  try {
    return unwrapStructuredText(JSON.parse(withoutFence)) || withoutFence;
  } catch {
    return withoutFence;
  }
}

export function sanitizeAssistantText(raw: string, fallback = "The assistant could not produce a clean response.") {
  const source = unwrapPossibleJson(String(raw ?? ""));
  const clean = source
    .normalize("NFKC")
    .replace(/<[^>]*>/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gm, "")
    .replace(UUID_PATTERN, "")
    .replace(INTERNAL_REFERENCE_PATTERN, "")
    .replace(ITEM_REFERENCE_PATTERN, "")
    .replace(/[\u2022\u25CF\u25E6]/g, " ")
    .replace(/[\\`*_~|]/g, "")
    .replace(/[{}\[\]]/g, " ")
    .replace(/\(\s*\)/g, " ")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/[\t ]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?]){2,}/g, "$1")
    .trim();

  return (clean || fallback).slice(0, 1_600);
}

export function isGreetingOnly(message: string) {
  const normalized = message
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return /^(?:hi+|hello+|hey+|yo+|sup|namaste|good morning|good afternoon|good evening|hello there|hey there)(?: onyx)?$/.test(normalized);
}
