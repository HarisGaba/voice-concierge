/**
 * REST endpoints for booking operations.
 *
 * GET    /api/bookings?from=ISO&to=ISO   list appointments (defaults to today)
 * POST   /api/bookings                   create an appointment
 * PATCH  /api/bookings                   update an appointment by id
 * DELETE /api/bookings?id=...            delete an appointment
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { createClient } from "@supabase/supabase-js";

import { json } from "@/lib/voice.server";

/** Signed-in owner client: RLS limits every query to the caller's own business. */
async function getOwnerClient(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const db = createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}`, apikey: key } },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return db;
}

const SELECT = "*, customer:customers(id,name,phone), service:services(id,name,price,duration_min)";

const createSchema = z.object({
  businessId: z.string().uuid(),
  customerId: z.string().uuid().nullable().optional(),
  serviceId: z.string().uuid().nullable().optional(),
  startTime: z.string(),
  endTime: z.string(),
  status: z.enum(["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"]).optional(),
  paymentStatus: z.enum(["PAID", "UNPAID", "PARTIAL"]).optional(),
  notes: z.string().max(1000).optional(),
});

const patchSchema = createSchema.partial().extend({ id: z.string().uuid() });

export const Route = createFileRoute("/api/bookings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const now = new Date();
        const from = url.searchParams.get("from") ?? new Date(now.setHours(0, 0, 0, 0)).toISOString();
        const to =
          url.searchParams.get("to") ??
          new Date(new Date(from).getTime() + 86_400_000).toISOString();
        const db = await getOwnerClient(request);
        if (!db) return json({ error: "Unauthorized" }, 401);
        const { data, error } = await db
          .from("appointments")
          .select(SELECT)
          .gte("start_time", from)
          .lt("start_time", to)
          .order("start_time", { ascending: true });
        if (error) return json({ error: error.message }, 500);
        return json({ appointments: data ?? [] });
      },

      POST: async ({ request }) => {
        const parsed = createSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
        const b = parsed.data;
        const db = await getOwnerClient(request);
        if (!db) return json({ error: "Unauthorized" }, 401);
        const { data, error } = await db
          .from("appointments")
          .insert({
            business_id: b.businessId,
            customer_id: b.customerId ?? null,
            service_id: b.serviceId ?? null,
            start_time: b.startTime,
            end_time: b.endTime,
            status: b.status ?? "PENDING",
            payment_status: b.paymentStatus ?? "UNPAID",
            notes: b.notes ?? "",
          })
          .select(SELECT)
          .single();
        if (error) return json({ error: error.message }, 500);
        return json({ appointment: data }, 201);
      },

      PATCH: async ({ request }) => {
        const parsed = patchSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
        const b = parsed.data;
        const update: Record<string, unknown> = {};
        if (b.customerId !== undefined) update["customer_id"] = b.customerId;
        if (b.serviceId !== undefined) update["service_id"] = b.serviceId;
        if (b.startTime) update["start_time"] = b.startTime;
        if (b.endTime) update["end_time"] = b.endTime;
        if (b.status) update["status"] = b.status;
        if (b.paymentStatus) update["payment_status"] = b.paymentStatus;
        if (b.notes !== undefined) update["notes"] = b.notes;

        const db = await getOwnerClient(request);
        if (!db) return json({ error: "Unauthorized" }, 401);
        const { data, error } = await db
          .from("appointments")
          .update(update)
          .eq("id", b.id)
          .select(SELECT)
          .single();
        if (error) return json({ error: error.message }, 500);
        return json({ appointment: data });
      },

      DELETE: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("id");
        if (!id) return json({ error: "id query param is required" }, 400);
        const db = await getOwnerClient(request);
        if (!db) return json({ error: "Unauthorized" }, 401);
        const { error } = await db.from("appointments").delete().eq("id", id);
        if (error) return json({ error: error.message }, 500);
        return json({ deleted: true });
      },
    },
  },
});
