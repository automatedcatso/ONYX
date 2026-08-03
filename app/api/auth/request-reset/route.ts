import { z } from "zod";
import { sendSecurityEmail } from "@/lib/email";
import { createServiceSupabaseClient } from "@/lib/supabase-server";
import {
  isTrustedMutationRequest,
  noStoreHeaders,
  publicAppUrl,
} from "@/lib/request-security";

export const dynamic = "force-dynamic";

const resetSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
});

const genericMessage = "If an account exists, a reset link will arrive shortly.";

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) {
    return Response.json({ error: "Request rejected." }, { status: 403, headers: noStoreHeaders });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 1_024) {
    return Response.json({ error: "Request is too large." }, { status: 413, headers: noStoreHeaders });
  }

  const parsed = resetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ message: genericMessage }, { status: 202, headers: noStoreHeaders });
  }

  const appUrl = publicAppUrl();
  const service = createServiceSupabaseClient();
  if (!appUrl || !service || !process.env.SMTP_FROM) {
    return Response.json({ error: "Password reset is not configured." }, { status: 503, headers: noStoreHeaders });
  }

  const { data, error } = await service.auth.admin.generateLink({
    type: "recovery",
    email: parsed.data.email,
    options: { redirectTo: `${appUrl}/auth/update-password` },
  });
  const actionLink = data?.properties?.action_link;
  if (!error && actionLink) {
    try {
      await sendSecurityEmail(
        parsed.data.email,
        "Reset your ONYX password",
        `Reset your password using this one-time link:\n\n${actionLink}\n\nIf you did not request this, ignore this email.`,
      );
    } catch {
      // Preserve the same response so mail or account state cannot be probed.
    }
  }

  return Response.json({ message: genericMessage }, { status: 202, headers: noStoreHeaders });
}
