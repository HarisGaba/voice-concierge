/**
 * Server-side database access for external webhooks (voice, Twilio).
 * These callers have no user session, so they use the privileged server client
 * and must always scope queries to a single business themselves.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function getServerClient() {
  return supabaseAdmin;
}

export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
