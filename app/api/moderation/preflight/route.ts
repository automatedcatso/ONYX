import { z } from "zod";
import {
  mergeModerationResults,
  moderateListingText,
  type ListingModerationResult,
  type ModerationIssue,
} from "@/lib/content-safety";
import { isTrustedMutationRequest, noStoreHeaders } from "@/lib/request-security";
import { createServiceSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const imageSchema = z.object({
  mimeType: z.literal("image/webp"),
  data: z.string().min(20).max(900_000),
  width: z.number().int().min(240).max(12_000),
  height: z.number().int().min(240).max(12_000),
  brightness: z.number().min(0).max(255),
  sharpness: z.number().min(0).max(1_000),
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
  itemVisible: z.boolean(),
  clarity: z.enum(["clear", "usable", "poor", "uncertain"]),
  relevance: z.enum(["relevant", "possibly_relevant", "irrelevant", "uncertain"]),
  summary: z.string().max(500),
  suggestions: z.array(z.string().max(220)).max(6),
});

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

function qualityReview(images: z.infer<typeof imageSchema>[], postType: "sale" | "wanted") {
  const issues: ModerationIssue[] = [];
  const suggestions: string[] = [];
  if (postType === "sale" && images.length === 0) {
    issues.push({ code: "missing_item_photo", field: "image", severity: "block", message: "Add at least one current photo of the actual item." });
  }
  if (!images.length) return { issues, suggestions };

  const unusable = images.map((image, index) => ({
    index,
    tooDark: image.brightness < 17,
    tooBright: image.brightness > 246,
    blurry: image.sharpness < 2.4,
  }));
  const unusableCount = unusable.filter((item) => item.tooDark || item.tooBright || item.blurry).length;
  if (unusableCount === images.length) {
    issues.push({
      code: "all_images_unclear",
      field: "image",
      severity: "block",
      message: "The photos are too dark, washed out, or blurry to verify the item. Retake at least one clear photo in normal light.",
    });
  } else {
    for (const item of unusable) {
      if (item.tooDark || item.tooBright || item.blurry) {
        suggestions.push(`Photo ${item.index + 1} may be hard to verify; keep it only if another photo clearly shows the item.`);
      }
    }
  }
  if (images.every((image) => Math.min(image.width, image.height) < 480)) {
    suggestions.push("A higher-resolution cover photo will help buyers inspect the condition.");
  }
  return { issues, suggestions };
}

function parseGeminiResult(payload: GeminiResponse) {
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) return null;
  const parsed = aiResultSchema.safeParse(JSON.parse(text));
  return parsed.success ? parsed.data : null;
}

async function runGeminiReview(input: z.infer<typeof requestSchema>) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !input.images.length) return null;
  const model = process.env.GEMINI_MODERATION_MODEL || process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const prompt = [
    "Review this campus marketplace listing as a cautious assistant to a human moderator.",
    `Post type: ${input.postType}`,
    `Title: ${input.title}`,
    `Description: ${input.description}`,
    "Detect only clear safety problems: pornographic or explicit sexual imagery, clearly visible vulgar/abusive text, an image unrelated to the described item, or an image too unclear to verify.",
    "Do not flag ordinary people in the background, normal clothing, product packaging, art, skin exposure that is not sexual, medical items, or uncertain content as explicit.",
    "Use low confidence for ambiguity. A human moderator will review all submissions before publication.",
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
        maxOutputTokens: 700,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          required: ["explicitSexualContent", "explicitConfidence", "abusiveTextVisible", "abusiveTextConfidence", "itemVisible", "clarity", "relevance", "summary", "suggestions"],
          properties: {
            explicitSexualContent: { type: "BOOLEAN" },
            explicitConfidence: { type: "NUMBER", minimum: 0, maximum: 1 },
            abusiveTextVisible: { type: "BOOLEAN" },
            abusiveTextConfidence: { type: "NUMBER", minimum: 0, maximum: 1 },
            itemVisible: { type: "BOOLEAN" },
            clarity: { type: "STRING", enum: ["clear", "usable", "poor", "uncertain"] },
            relevance: { type: "STRING", enum: ["relevant", "possibly_relevant", "irrelevant", "uncertain"] },
            summary: { type: "STRING" },
            suggestions: { type: "ARRAY", items: { type: "STRING" } },
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
  if (ai.explicitSexualContent && ai.explicitConfidence >= 0.86) {
    decision = "changes_required";
    issues.push({ code: "explicit_image", field: "image", severity: "block", message: "Remove the sexually explicit image and upload only clear photos of the item." });
  } else if (ai.explicitSexualContent || ai.explicitConfidence >= 0.48) {
    decision = "manual_review";
    issues.push({ code: "uncertain_explicit_image", field: "image", severity: "review", message: "The image received an uncertain explicit-content signal and needs human review." });
  }
  if (ai.abusiveTextVisible && ai.abusiveTextConfidence >= 0.84) {
    decision = "changes_required";
    issues.push({ code: "abusive_text_in_image", field: "image", severity: "block", message: "Remove or replace the image containing clearly vulgar or abusive text." });
  } else if (ai.abusiveTextVisible) {
    if (decision === "allow") decision = "manual_review";
    issues.push({ code: "uncertain_text_in_image", field: "image", severity: "review", message: "Visible text in an image needs a moderator check." });
  }
  if (ai.relevance === "irrelevant" && !ai.itemVisible) {
    decision = "changes_required";
    issues.push({ code: "item_not_visible", field: "image", severity: "block", message: "Upload a current photo where the listed item is clearly visible." });
  } else if (ai.clarity === "poor" || ai.relevance === "uncertain") {
    if (decision === "allow") decision = "manual_review";
    issues.push({ code: "image_needs_human_check", field: "image", severity: "review", message: "A moderator should verify image clarity and relevance." });
  }
  return {
    decision,
    summary: ai.summary,
    issues,
    suggestions: ai.suggestions,
    scores: {
      explicitConfidence: ai.explicitConfidence,
      abusiveTextConfidence: ai.abusiveTextConfidence,
      itemVisible: ai.itemVisible,
      clarity: ai.clarity,
      relevance: ai.relevance,
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
  const { data: profile } = await service.from("profiles").select("suspended_until").eq("id", user.id).maybeSingle();
  if (profile?.suspended_until && new Date(String(profile.suspended_until)).getTime() > Date.now()) {
    return Response.json({ error: "This account is currently suspended from marketplace actions." }, { status: 403, headers: noStoreHeaders });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Enter valid listing text and image previews." }, { status: 400, headers: noStoreHeaders });
  }
  const rules = moderateListingText(parsed.data.title, parsed.data.description);
  const quality = qualityReview(parsed.data.images, parsed.data.postType);
  const rulesWithImages: ListingModerationResult = {
    ...rules,
    decision: quality.issues.some((issue) => issue.severity === "block") ? "changes_required" : rules.decision,
    issues: [...rules.issues, ...quality.issues],
    suggestions: [...rules.suggestions, ...quality.suggestions],
    scores: { ...rules.scores, imageCount: parsed.data.images.length },
  };
  if (rulesWithImages.decision === "changes_required") {
    return Response.json(rulesWithImages, { headers: noStoreHeaders });
  }

  let ai = null;
  try {
    const result = await runGeminiReview(parsed.data);
    ai = result ? aiToModeration(result) : null;
  } catch {
    ai = null;
  }
  const merged = mergeModerationResults(rulesWithImages, ai);
  return Response.json(merged, { headers: noStoreHeaders });
}
