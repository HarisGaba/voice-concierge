/**
 * Server-side database access for public API routes (voice webhook, bookings REST,
 * WhatsApp reminders). Uses the publishable key — the demo tables allow anon access.
 */
import { createClient } from "@supabase/supabase-js";

export function getServerClient() {
  const url = process.env["VITE_SUPABASE_URL"] ?? import.meta.env["VITE_SUPABASE_URL"];
  const key =
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
    import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  return createClient(url as string, key as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
