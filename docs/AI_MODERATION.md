# AI Moderation

## Purpose

AI is a narrow safety screen for submitted image previews. It does not publish listings, ban accounts, approve listings, judge product quality, or replace human moderation.

## Deterministic checks

Application and database rules still handle:

- Clear vulgar or explicit listing text
- Common English and Romanized-Hindi abuse
- Separator and leetspeak evasion
- Off-platform contact details
- At least one current image for sale listings
- Minimum image dimensions and safe browser-side WebP re-encoding

These rules do not automatically reject a photo for being dark, blurry, badly framed, unattractive, or imperfectly composed.

## Narrow multimodal check

When Gemini is configured, the model may evaluate only:

- Clearly pornographic or sexually explicit imagery
- Clearly readable vulgar, abusive, hateful, or sexually explicit text inside an image

The model is explicitly prohibited from judging:

- Whether the image matches the title or description
- Category, price, condition, or product relevance
- Item visibility
- Lighting, sharpness, blur, composition, centering, or photographic quality
- Ordinary clothing, swimwear, nonsexual skin exposure, people in the background, mannequins, medical products, anatomy material, artwork, or product packaging as violations by themselves

High-confidence prohibited content requires replacement. Medium-confidence signals enter human review. Low-confidence and ambiguous signals do not block submission.

## Guardrails

- The user explicitly submits the preview.
- Image payloads are bounded.
- A verified, active account is required.
- Distributed rate limits protect the route.
- Model output must satisfy a strict four-field schema.
- Listing title and description are not supplied to the image model for relevance comparison.
- Failure falls back to deterministic checks and human review.
- Provider findings are visible to authorized moderators and remain advisory.

## Moderator interpretation

Inspect the original image yourself. Decide whether it actually represents the listing and whether a clearer photo should be requested. Do not treat an absent AI signal as approval, and do not remove a listing solely because a photograph is aesthetically weak.
