/**
 * WhatsApp confirmation / reminder sender.
 *
 * POST /api/public/whatsapp/send-reminder  { appointmentId: string }
 *
 * If TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM are set the
 * message is sent through Twilio; otherwise the payload is returned as a
 * simulated send so the flow can be demoed without credentials.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { getServerClient, json } from "@/lib/voice.server";

const bodySchema = z.object({ appointmentId: z.string().uuid() });

export const Route = createFileRoute("/api/public/whatsapp/send-reminder")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) return json({ error: "appointmentId is required" }, 400);

        const db = getServerClient();
        const { data: appointment } = await db
          .from("appointments")
          .select("*, customer:customers(name,phone), service:services(name,price)")
          .eq("id", parsed.data.appointmentId)
          .maybeSingle();
        if (!appointment) return json({ error: "Appointment not found" }, 404);

        const customer = appointment.customer as { name: string; phone: string } | null;
        const service = appointment.service as { name: string; price: number } | null;
        const when = new Date(appointment.start_time).toLocaleString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });

        const body =
          `Hi ${customer?.name ?? "there"}! Your ${service?.name ?? "appointment"} is booked for ${when}.\n` +
          `Total: $${service?.price ?? 0}.\n\n` +
          `Reply CONFIRM to lock it in, or CANCEL to release the slot.`;

        const sid = process.env["TWILIO_ACCOUNT_SID"];
        const token = process.env["TWILIO_AUTH_TOKEN"];
        const from = process.env["TWILIO_WHATSAPP_FROM"];

        if (!sid || !token || !from || !customer?.phone) {
          return json({
            sent: false,
            simulated: true,
            to: customer?.phone ?? null,
            body,
            actions: ["CONFIRM", "CANCEL"],
          });
        }

        const form = new URLSearchParams({
          To: `whatsapp:${customer.phone}`,
          From: from,
          Body: body,
        });
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
              "content-type": "application/x-www-form-urlencoded",
            },
            body: form,
          },
        );
        const result = (await res.json()) as Record<string, unknown>;
        if (!res.ok) return json({ sent: false, error: result }, 502);
        return json({ sent: true, sid: result["sid"], to: customer.phone, body });
      },
    },
  },
});
