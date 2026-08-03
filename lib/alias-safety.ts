const EXACT_BLOCKED = new Set([
  "fuck", "fucker", "fucking", "motherfucker", "bitch", "bastard", "asshole", "cunt",
  "dick", "pussy", "whore", "slut", "retard", "nigger", "nigga", "faggot",
  "behenchod", "bhenchod", "benchod", "madarchod", "maderchod", "chutiya", "chutia",
  "gaandu", "gandu", "randi", "harami", "kamina", "kameena", "bhadwa", "bhosdike",
  "bhosdi", "lund", "lauda", "loda", "jhatu", "jhaatu", "chakka" ,
]);

const CONTAINS_BLOCKED = [
  "motherfucker", "nigger", "nigga", "faggot", "behenchod", "bhenchod", "benchod",
  "madarchod", "maderchod", "chutiya", "chutia", "gaandu", "gandu", "randi",
  "bhadwa", "bhosdike", "jhatu", "jhaatu",
] as const;

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

function normalizeAlias(value: string) {
  const compact = value
    .toLowerCase()
    .split("")
    .map((character) => LEET_MAP[character] ?? character)
    .join("")
    .replace(/[^a-z]/g, "");
  return {
    compact,
    collapsed: compact.replace(/(.)\1+/g, "$1"),
  };
}

export function isAllowedAlias(value: string) {
  if (!/^[A-Za-z][A-Za-z0-9_-]{2,23}$/.test(value)) return false;
  const { compact, collapsed } = normalizeAlias(value);
  if (EXACT_BLOCKED.has(compact) || EXACT_BLOCKED.has(collapsed)) return false;
  return !CONTAINS_BLOCKED.some(
    (term) => compact.includes(term) || collapsed.includes(term),
  );
}
