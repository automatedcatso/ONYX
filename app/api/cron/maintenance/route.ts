import "server-only";
import { timingSafeEqual } from "node:crypto";
import { createServiceSupabaseClient } from "@/lib/supabase-server";
import { noStoreHeaders } from "@/lib/request-security";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401, headers: noStoreHeaders });
  }
  const service = createServiceSupabaseClient();
  if (!service) {
    return Response.json({ error: "Maintenance is not configured." }, { status: 503, headers: noStoreHeaders });
  }

  const { error: expiryError } = await service.rpc("run_expiration_maintenance");
  if (expiryError) {
    return Response.json({ error: "Maintenance failed safely." }, { status: 503, headers: noStoreHeaders });
  }

  const { data: jobs, error: jobsError } = await service
    .from("deletion_jobs")
    .select("id,resource_type,resource_id,attempts")
    .is("completed_at", null)
    .eq("safety_hold", false)
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(50);
  if (jobsError) {
    return Response.json({ error: "Maintenance failed safely." }, { status: 503, headers: noStoreHeaders });
  }

  for (const job of jobs ?? []) {
    let completed = false;
    try {
      if (job.resource_type === "conversation") {
        const { count } = await service.from("reports").select("id", { count: "exact", head: true }).eq("conversation_id", job.resource_id).in("status", ["open", "reviewing"]);
        if (count) {
          await service.from("deletion_jobs").update({ safety_hold: true }).eq("id", job.id);
          continue;
        }
        await service.from("messages").delete().eq("conversation_id", job.resource_id);
        await service.from("conversations").update({ hidden_at: new Date().toISOString(), deletion_due_at: null }).eq("id", job.resource_id);
        completed = true;
      } else if (job.resource_type === "listing_image") {
        const { data: image } = await service.from("listing_images").select("storage_path").eq("id", job.resource_id).maybeSingle();
        if (image?.storage_path) await service.storage.from("listing-images").remove([String(image.storage_path)]);
        await service.from("listing_images").delete().eq("id", job.resource_id);
        completed = true;
      } else if (job.resource_type === "account") {
        const { data: owned } = await service.from("listings").select("id").eq("owner_id", job.resource_id);
        const ids = (owned ?? []).map((listing) => String(listing.id));
        if (ids.length) {
          const { data: images } = await service.from("listing_images").select("storage_path").in("listing_id", ids);
          const paths = (images ?? []).map((image) => String(image.storage_path));
          if (paths.length) await service.storage.from("listing-images").remove(paths);
        }
        const { error } = await service.auth.admin.deleteUser(String(job.resource_id), false);
        if (!error) completed = true;
      }
    } catch {
      completed = false;
    }

    if (completed) {
      await service.from("deletion_jobs").update({ completed_at: new Date().toISOString(), last_error_redacted: null }).eq("id", job.id);
    } else {
      await service.from("deletion_jobs").update({ attempts: 1 + Number(job.attempts ?? 0), last_error_redacted: "maintenance_step_failed" }).eq("id", job.id);
    }
  }

  return Response.json({ status: "ok" }, { headers: noStoreHeaders });
}
