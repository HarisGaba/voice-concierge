/**
 * Inbound Twilio webhook for SMS / WhatsApp replies.
 *
 * POST /api/public/twilio/inbound   (application/x-www-form-urlencoded)
 *
 * Handles CONFIRM / CANCEL replies from the customer and updates their most
 * recent upcoming appointment. Responds with TwiML so Twilio speaks the reply
 * straight back to the customer.
 *
 * Set this URL as the "A message comes in" webhook on your Twilio number.
 */
import { createFileRoute } from "@tanstack/react-router";

import { getServerClient } from "@/lib/voice.server";

function twiml(message: string) {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</Message></Response>`,
    { status: 200, headers: { "content-type": "text/xml" } },
  );
}

export const Route = createFileRoute("/api/public/twilio/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData();
        const from = String(form.get("From") ?? "").replace("whatsapp:", "").trim();
        const text = String(form.get("Body") ?? "")
          .trim()
          .toUpperCase();
        if (!from) return twiml("Sorry, we couldn't identify your number.");

        const intent = text.startsWith("CONFIRM")
          ? "CONFIRM"
          : text.startsWith("CANCEL")
            ? "CANCEL"
            : null;
        if (!intent) {
          return twiml("Reply CONFIRM to keep your appointment, or CANCEL to release the slot.");
        }

        const db = getServerClient();
        const { data: customer } = await db
          .from("customers")
          .select("id,name")
          .eq("phone", from);
        const customerIds = (customer ?? []).map((c) => c.id);
        if (!customerIds.length) return twiml("We couldn't find a booking for this number.");

        const { data: appointment } = await db
          .from("appointments")
          .select("id,start_time,status")
          .in("customer_id", customerIds)
          .gte("start_time", new Date().toISOString())
          .neq("status", "CANCELLED")
          .order("start_time", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (!appointment) return twiml("You have no upcoming appointments with us.");

        await db
          .from("appointments")
          .update({ status: intent === "CONFIRM" ? "CONFIRMED" : "CANCELLED" })
          .eq("id", appointment.id);

        const when = new Date(appointment.start_time as string).toLocaleString("en-US", {
          weekday: "long",
          hour: "numeric",
          minute: "2-digit",
        });
        return twiml(
          intent === "CONFIRM"
            ? `Thanks ${customer![0]!.name}! Your appointment on ${when} is confirmed. See you then.`
            : `No problem — your appointment on ${when} has been cancelled. Call us any time to rebook.`,
        );
      },
    },
  },
});
