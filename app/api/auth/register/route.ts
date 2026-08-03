import { z } from "zod";
import { isAllowedAlias } from "@/lib/alias-safety";
import { sendSecurityEmail } from "@/lib/email";
import { createServiceSupabaseClient } from "@/lib/supabase-server";
import {
  isTrustedMutationRequest,
  noStoreHeaders,
  publicAppUrl,
} from "@/lib/request-security";

export const dynamic = "force-dynamic";

const registrationSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(10).max(128),
  alias: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_-]{2,23}$/),
  locationSlug: z.string().trim().regex(/^[a-z0-9-]{2,64}$/),
});

const genericMessage = "If the request can be completed, check your inbox to finish registration.";

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) {
    return Response.json({ error: "Request rejected." }, { status: 403, headers: noStoreHeaders });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 4_096) {
    return Response.json({ error: "Request is too large." }, { status: 413, headers: noStoreHeaders });
  }

  const parsed = registrationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Enter a valid email address, alias, location, and a 10+ character password." }, { status: 400, headers: noStoreHeaders });
  }

  if (!isAllowedAlias(parsed.data.alias)) {
    return Response.json(
      { error: "Choose a respectful alias. English abuse and Hindi abuse written in English are not allowed." },
      { status: 400, headers: noStoreHeaders },
    );
  }

  const appUrl = publicAppUrl();
  const service = createServiceSupabaseClient();
  if (!appUrl || !service || !process.env.SMTP_FROM) {
    return Response.json({ error: "Registration is not configured." }, { status: 503, headers: noStoreHeaders });
  }

  const { data, error } = await service.auth.admin.generateLink({
    type: "signup",
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      redirectTo: `${appUrl}/auth/sign-in`,
      data: { alias: parsed.data.alias, location_slug: parsed.data.locationSlug },
    },
  });

  const actionLink = data?.properties?.action_link;
  if (!error && actionLink) {
    try {
      await sendSecurityEmail(
        parsed.data.email,
        "Confirm your ONYX registration",
        `Confirm your ONYX registration using this one-time link:\n\n${actionLink}\n\nIf you did not request this, ignore this email.`,
      );
    } catch {
      return Response.json({ error: "Registration email is temporarily unavailable." }, { status: 503, headers: noStoreHeaders });
    }
  }

  return Response.json({ message: genericMessage }, { status: 202, headers: noStoreHeaders });
}
