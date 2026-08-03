export type ModerationDecision = "allow" | "manual_review" | "changes_required";

export type ModerationIssue = {
  code: string;
  field: "title" | "description" | "image" | "account";
  message: string;
  severity: "advice" | "review" | "block";
  imageIndex?: number;
};

export type ListingModerationResult = {
  decision: ModerationDecision;
  provider: "rules" | "gemini" | "rules+gemini";
  summary: string;
  issues: ModerationIssue[];
  suggestions: string[];
  scores: Record<string, number | boolean | string>;
};

const LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  "$": "s",
  "!": "i",
};

const BLOCKED_TOKENS = new Set([
  "fuck", "fucker", "fucking", "motherfucker", "bitch", "asshole", "cunt",
  "pussy", "whore", "slut", "nigger", "nigga", "faggot", "porn", "porno",
  "pornography", "xxx", "hentai", "dildo", "vibrator",
  "blowjob", "handjob", "onlyfans", "behenchod", "bhenchod", "benchod",
  "madarchod", "maderchod", "chutiya", "chutia", "gaandu", "gandu", "randi",
  "bhadwa", "bhosdike", "bhosdi", "lund", "lauda", "loda", "jhatu", "jhaatu",
]);

const BLOCKED_COMPACT_TERMS = [
  "motherfucker", "behenchod", "bhenchod", "benchod", "madarchod", "maderchod",
  "bhosdike", "onlyfans", "blowjob", "handjob", "childporn", "revengeporn",
] as const;

const SEXUAL_PHRASES = [
  /\bsex\s*(toy|toys|service|services|video|videos|photo|photos|content)\b/i,
  /\badult\s*(content|service|services|video|videos|toy|toys)\b/i,
  /\bexplicit\s*(content|photo|photos|video|videos)\b/i,
  /\b(?:send|sell|share)\s+(?:me\s+)?nudes?\b/i,
] as const;

const CONTACT_PATTERNS = [
  /\b(?:whats?app|telegram|insta(?:gram)?|snapchat)\b/i,
  /(?:^|\D)(?:\+?91[-\s]?)?[6-9]\d{9}(?:\D|$)/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
] as const;

function normalize(value: string) {
  const transliterated = value
    .toLowerCase()
    .split("")
    .map((character) => LEET_MAP[character] ?? character)
    .join("");
  const tokens = transliterated.split(/[^a-z]+/).filter(Boolean);
  const compact = transliterated.replace(/[^a-z]/g, "");
  const collapsed = compact.replace(/(.)\1+/g, "$1");
  return { tokens, compact, collapsed };
}

function fieldIssues(value: string, field: "title" | "description") {
  const issues: ModerationIssue[] = [];
  const { tokens, compact, collapsed } = normalize(value);
  const blockedToken = tokens.find((token) => BLOCKED_TOKENS.has(token) || BLOCKED_TOKENS.has(token.replace(/(.)\1+/g, "$1")));
  const blockedCompact = BLOCKED_COMPACT_TERMS.find((term) => compact.includes(term) || collapsed.includes(term));
  if (blockedToken || blockedCompact || SEXUAL_PHRASES.some((pattern) => pattern.test(value))) {
    issues.push({
      code: "vulgar_or_explicit_text",
      field,
      severity: "block",
      message: `${field === "title" ? "Title" : "Description"} contains vulgar, abusive, or sexually explicit wording. Remove it and describe only the item.`,
    });
  }
  if (CONTACT_PATTERNS.some((pattern) => pattern.test(value))) {
    issues.push({
      code: "external_contact_details",
      field,
      severity: "block",
      message: `Remove phone numbers, email addresses, and social-media handles. Use ONYX private messages instead.`,
    });
  }
  return issues;
}

export function moderateListingText(title: string, description: string): ListingModerationResult {
  const issues = [...fieldIssues(title, "title"), ...fieldIssues(description, "description")];
  const suggestions: string[] = [];
  if (title.trim().length < 8) suggestions.push("Use a more specific title with the item name and model where relevant.");
  if (description.trim().length < 35) suggestions.push("Add condition, age, faults, included accessories, and an honest handover note.");
  if (!/[.!?]/.test(description) && description.trim().length > 80) suggestions.push("Split the description into short, readable sentences.");
  return {
    decision: issues.some((issue) => issue.severity === "block") ? "changes_required" : "allow",
    provider: "rules",
    summary: issues.length ? "The listing copy needs changes before submission." : "No obvious vulgarity or private contact details were detected.",
    issues,
    suggestions,
    scores: { textRuleHits: issues.length },
  };
}

export function mergeModerationResults(
  rules: ListingModerationResult,
  ai: Omit<ListingModerationResult, "provider"> | null,
): ListingModerationResult {
  if (!ai) return rules;
  const issues = [...rules.issues, ...ai.issues];
  const rank: Record<ModerationDecision, number> = { allow: 0, manual_review: 1, changes_required: 2 };
  const decision = rank[rules.decision] >= rank[ai.decision] ? rules.decision : ai.decision;
  return {
    decision,
    provider: "rules+gemini",
    summary: decision === "changes_required"
      ? "Please fix the highlighted content before submitting."
      : decision === "manual_review"
        ? "The listing can be submitted, but a moderator should verify an uncertain signal."
        : "The automated pre-check found no obvious safety issue.",
    issues,
    suggestions: [...new Set([...rules.suggestions, ...ai.suggestions])],
    scores: { ...rules.scores, ...ai.scores },
  };
}
