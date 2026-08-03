import { z } from "zod";
import {
  mergeModerationResults,
  moderateListingText,
  type ListingModerationResult,
  type ModerationIssue,
} from "@/lib/content-safety";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { isTrustedMutationRequest, noStoreHeaders } from "@/lib/request-security";
import { createServiceSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const imageSchema = z.object({
  mimeType: z.literal("image/webp"),
  data: z.string().min(20).max(900_000),
  width: z.number().int().min(240).max(12_000),
  height: z.number().int().min(240).max(12_000),
});

const requestSchema = z.object({
  title: z.string().trim().min(3).max(70),
  description: z.string().trim().min(10).max(5_000),
  postType: z.enum(["sale", "wanted"]),
  images: z.array(imageSchema).max(8),
});

const aiResultSchema = z.object({
  explicitSexualContent: z.boolean(),
  explicitConfidence: z.number().min(0).max(1),
  abusiveTextVisible: z.boolean(),
  abusiveTextConfidence: z.number().min(0).max(1),
});

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

function imageRequirementReview(images: z.infer<typeof imageSchema>[], postType: "sale" | "wanted") {
  const issues: ModerationIssue[] = [];
  if (postType === "sale" && images.length === 0) {
    issues.push({
      code: "missing_item_photo",
      field: "image",
      severity: "block",
      message: "Add at least one current photo of the actual item.",
    });
  }
  return { issues, suggestions: [] as string[] };
}

function parseGeminiResult(payload: GeminiResponse) {
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) return null;
  try {
    const parsed = aiResultSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function runGeminiReview(input: z.infer<typeof requestSchema>) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !input.images.length) return null;
  const model = process.env.GEMINI_MODERATION_MODEL || process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const prompt = [
    "Inspect only the supplied marketplace images for a narrow safety screen.",
    "Do not decide whether an image matches a listing title, description, category, price, or condition.",
    "Do not assess image quality, lighting, sharpness, composition, item visibility, relevance, or attractiveness.",
    "Set explicitSexualContent=true only for clearly pornographic imagery, visible genitals presented sexually, or explicit sexual activity.",
    "Set abusiveTextVisible=true only when clearly readable vulgar, abusive, hateful, or sexually explicit words are visible inside the image.",
    "Normal clothing, swimwear, ordinary skin exposure, people in the background, mannequins, medical products, anatomy material, artwork, product packaging, and ambiguous content are not violations by themselves.",
    "Use low confidence whenever uncertain. Human moderators review every submitted listing before publication.",
    "Return only the requested JSON fields.",
  ].join("\n");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { text: prompt },
          ...input.images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.data } })),
        ],
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 220,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          required: ["explicitSexualContent", "explicitConfidence", "abusiveTextVisible", "abusiveTextConfidence"],
          properties: {
            explicitSexualContent: { type: "BOOLEAN" },
            explicitConfidence: { type: "NUMBER", minimum: 0, maximum: 1 },
            abusiveTextVisible: { type: "BOOLEAN" },
            abusiveTextConfidence: { type: "NUMBER", minimum: 0, maximum: 1 },
          },
        },
      },
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return null;
  return parseGeminiResult(await response.json() as GeminiResponse);
}

function aiToModeration(ai: z.infer<typeof aiResultSchema>): Omit<ListingModerationResult, "provider"> {
  const issues: ModerationIssue[] = [];
  let decision: ListingModerationResult["decision"] = "allow";

  // High thresholds are deliberate. The image model is a narrow pornography/
  // vulgar-text screen, not a relevance or quality judge.
  if (ai.explicitSexualContent && ai.explicitConfidence >= 0.94) {
    decision = "changes_required";
    issues.push({
      code: "explicit_image",
      field: "image",
      severity: "block",
      message: "Remove the clearly pornographic or sexually explicit image before submitting.",
    });
  } else if (ai.explicitSexualContent && ai.explicitConfidence >= 0.72) {
    decision = "manual_review";
    issues.push({
      code: "uncertain_explicit_image",
      field: "image",
      severity: "review",
      message: "An uncertain explicit-content signal was sent to the human moderation queue.",
    });
  }

  if (ai.abusiveTextVisible && ai.abusiveTextConfidence >= 0.92) {
    decision = "changes_required";
    issues.push({
      code: "abusive_text_in_image",
      field: "image",
      severity: "block",
      message: "Replace the image containing clearly readable vulgar, abusive, hateful, or sexually explicit text.",
    });
  } else if (ai.abusiveTextVisible && ai.abusiveTextConfidence >= 0.72) {
    if (decision === "allow") decision = "manual_review";
    issues.push({
      code: "uncertain_text_in_image",
      field: "image",
      severity: "review",
      message: "Uncertain visible text was sent to the human moderation queue.",
    });
  }

  return {
    decision,
    summary: decision === "changes_required"
      ? "A high-confidence prohibited image signal must be corrected before submission."
      : decision === "manual_review"
        ? "The listing can be submitted and the uncertain image signal will be checked by a human moderator."
        : "No high-confidence pornographic imagery or clearly vulgar text was detected in the submitted previews.",
    issues,
    suggestions: [],
    scores: {
      explicitConfidence: ai.explicitConfidence,
      abusiveTextConfidence: ai.abusiveTextConfidence,
      narrowImageSafetyOnly: true,
    },
  };
}

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) {
    return Response.json({ error: "Request rejected." }, { status: 403, headers: noStoreHeaders });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 3_200_000) {
    return Response.json({ error: "Moderation preview is too large." }, { status: 413, headers: noStoreHeaders });
  }
  const service = createServiceSupabaseClient();
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const user = service && token ? (await service.auth.getUser(token)).data.user : null;
  if (!service || !user?.email_confirmed_at) {
    return Response.json({ error: "Verified account required." }, { status: 401, headers: noStoreHeaders });
  }
  const rateLimit = await consumeRateLimit({
    request,
    scope: "moderation-preflight",
    identity: user.id,
    limit: 24,
    networkLimit: 100,
    windowSeconds: 10 * 60,
    failClosed: true,
  });
  const limitedHeaders = { ...noStoreHeaders, ...rateLimitHeaders(rateLimit, 24) };
  if (!rateLimit.allowed) {
    const status = rateLimit.configured ? 429 : 503;
    const error = rateLimit.configured
      ? "Too many moderation checks. Try again later."
      : "Moderation security controls are not configured.";
    return Response.json({ error }, { status, headers: limitedHeaders });
  }
  const { data: profile } = await service.from("profiles").select("suspended_until").eq("id", user.id).maybeSingle();
  if (profile?.suspended_until && new Date(String(profile.suspended_until)).getTime() > Date.now()) {
    return Response.json({ error: "This account is currently suspended from marketplace actions." }, { status: 403, headers: limitedHeaders });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Enter valid listing text and image previews." }, { status: 400, headers: limitedHeaders });
  }
  const rules = moderateListingText(parsed.data.title, parsed.data.description);
  const imageRequirements = imageRequirementReview(parsed.data.images, parsed.data.postType);
  const rulesWithImages: ListingModerationResult = {
    ...rules,
    decision: imageRequirements.issues.some((issue) => issue.severity === "block") ? "changes_required" : rules.decision,
    issues: [...rules.issues, ...imageRequirements.issues],
    suggestions: [...rules.suggestions, ...imageRequirements.suggestions],
    scores: { ...rules.scores, imageCount: parsed.data.images.length },
  };
  if (rulesWithImages.decision === "changes_required") {
    return Response.json(rulesWithImages, { headers: limitedHeaders });
  }

  let ai = null;
  try {
    const result = await runGeminiReview(parsed.data);
    ai = result ? aiToModeration(result) : null;
  } catch {
    ai = null;
  }
  const merged = mergeModerationResults(rulesWithImages, ai);
  return Response.json(merged, { headers: limitedHeaders });
}
