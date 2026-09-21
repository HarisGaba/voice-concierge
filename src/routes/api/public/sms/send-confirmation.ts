/**
 * SMS confirmation sender.
 *
 * POST /api/public/sms/send-confirmation  { appointmentId: string }
 *
 * Sends the booking confirmation by SMS through Twilio (connector gateway or
 * direct credentials). Without credentials the payload is returned as a
 * simulated send.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { buildConfirmationBody, sendTwilioMessage } from "@/lib/messaging.server";
import { getServerClient, json } from "@/lib/voice.server";

const bodySchema = z.object({ appointmentId: z.string().uuid() });

export const Route = createFileRoute("/api/public/sms/send-confirmation")({
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

        const body = buildConfirmationBody({
          businessName: business?.name ?? "our shop",
          customerName: customer.name,
          serviceName: service?.name ?? null,
          price: service?.price ?? null,
          startTime: appointment.start_time as string,
          channel: "sms",
        });

        const result = await sendTwilioMessage({ channel: "sms", to: customer.phone, body });
        return json(result, result.error ? 502 : 200);
      },
    },
  },
});
