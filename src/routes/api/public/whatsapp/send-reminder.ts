/**
 * WhatsApp confirmation / reminder sender.
 *
 * POST /api/public/whatsapp/send-reminder  { appointmentId: string }
 *
 * Sends through Twilio (connector gateway or direct credentials). When
 * TWILIO_WHATSAPP_CONTENT_SID points at an approved Content template with
 * quick-reply buttons, the template is sent so CONFIRM / CANCEL render as real
 * tappable buttons; otherwise the same choices are offered as text replies.
 * Replies land on /api/public/twilio/inbound.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { buildConfirmationBody, formatWhen, sendTwilioMessage } from "@/lib/messaging.server";
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
          .select(
            "*, customer:customers(name,phone), service:services(name,price), business:businesses(name)",
          )
          .eq("id", parsed.data.appointmentId)
          .maybeSingle();
        if (!appointment) return json({ error: "Appointment not found" }, 404);

        const customer = appointment.customer as { name: string; phone: string } | null;
        const service = appointment.service as { name: string; price: number } | null;
        const business = appointment.business as { name: string } | null;
        if (!customer?.phone) return json({ error: "Customer has no phone number" }, 400);

        const businessName = business?.name ?? "our shop";
        const startTime = appointment.start_time as string;
        const body = buildConfirmationBody({
          businessName,
          customerName: customer.name,
          serviceName: service?.name ?? null,
          price: service?.price ?? null,
          startTime,
          channel: "whatsapp",
        });

        const contentSid = process.env["TWILIO_WHATSAPP_CONTENT_SID"] ?? null;
        const result = await sendTwilioMessage({
          channel: "whatsapp",
          to: customer.phone,
          body,
          contentSid,
          contentVariables: contentSid
            ? {
                "1": customer.name,
                "2": service?.name ?? "appointment",
                "3": formatWhen(startTime),
                "4": businessName,
              }
            : null,
        });

        return json({ ...result, actions: ["CONFIRM", "CANCEL"] }, result.error ? 502 : 200);
      },
    },
  },
});
