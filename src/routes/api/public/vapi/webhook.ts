/**
 * Voice AI tool webhook (Vapi.ai / Retell AI function calling).
 *
 * POST /api/public/vapi/webhook
 * Body (either flat, or nested under Vapi's message.functionCall.parameters):
 *   { customerPhone, customerName, requestedDate: "YYYY-MM-DD",
 *     requestedTime: "HH:mm", serviceName }
 *
 * Returns a concise structured payload the voice agent can read back.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { buildConfirmationBody, sendTwilioMessage } from "@/lib/messaging.server";
import { DAY_KEYS, getServerClient, json } from "@/lib/voice.server";

const paramsSchema = z.object({
  customerPhone: z.string().min(5).max(32),
  customerName: z.string().min(1).max(120),
  requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  requestedTime: z.string().regex(/^\d{2}:\d{2}$/),
  serviceName: z.string().min(1).max(120),
});

function extractParams(body: Record<string, unknown>): unknown {
  const message = body["message"] as Record<string, unknown> | undefined;
  const functionCall = message?.["functionCall"] as Record<string, unknown> | undefined;
  const toolCalls = message?.["toolCalls"] as Array<Record<string, unknown>> | undefined;
  if (functionCall?.["parameters"]) return functionCall["parameters"];
  if (toolCalls?.[0]) {
    const fn = toolCalls[0]["function"] as Record<string, unknown> | undefined;
    const args = fn?.["arguments"];
    return typeof args === "string" ? JSON.parse(args) : args;
  }
  return body;
}

function speakTime(date: Date) {
  return date.toLocaleString("en-US", {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export const Route = createFileRoute("/api/public/vapi/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let raw: Record<string, unknown>;
        try {
          raw = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }

        const parsed = paramsSchema.safeParse(extractParams(raw));
        if (!parsed.success) {
          return json(
            {
              available: false,
              result:
                "I'm missing some details. I need the service, the day, the time and your name.",
              issues: parsed.error.flatten().fieldErrors,
            },
            400,
          );
        }
        const p = parsed.data;
        const db = getServerClient();

        // 1. Business + hours
        const businessIdParam = new URL(request.url).searchParams.get("businessId");
        const call = (raw["message"] as Record<string, unknown> | undefined)?.["call"] as
          | Record<string, unknown>
          | undefined;
        const assistantId = (call?.["assistantId"] as string | undefined) ?? null;
        let businessId = businessIdParam;
        if (!businessId && assistantId) {
          const { data: vs } = await db
            .from("voice_settings")
            .select("business_id")
            .eq("vapi_assistant_id", assistantId)
            .maybeSingle();
          businessId = vs?.business_id ?? null;
        }
        if (!businessId) {
          return json({ available: false, result: "This line isn't linked to a business yet." }, 404);
        }
        const { data: business } = await db
          .from("businesses")
          .select("*")
          .eq("id", businessId)
          .maybeSingle();
        if (!business) return json({ available: false, result: "No business configured." }, 404);

        // 2. Resolve the service by fuzzy name match
        const { data: services } = await db
          .from("services")
          .select("*")
          .eq("business_id", business.id);
        const wanted = p.serviceName.toLowerCase();
        const service =
          (services ?? []).find((s) => s.name.toLowerCase() === wanted) ??
          (services ?? []).find(
            (s) => s.name.toLowerCase().includes(wanted) || wanted.includes(s.name.toLowerCase()),
          );
        if (!service) {
          return json({
            available: false,
            result: `I don't have "${p.serviceName}" on the menu. We offer ${(services ?? [])
              .map((s) => s.name)
              .join(", ")}.`,
            services: (services ?? []).map((s) => ({ name: s.name, price: s.price })),
          });
        }

        // 3. Build the requested slot
        const start = new Date(`${p.requestedDate}T${p.requestedTime}:00Z`);
        if (Number.isNaN(start.getTime())) {
          return json({ available: false, result: "That date and time didn't parse." }, 400);
        }
        const end = new Date(start.getTime() + service.duration_min * 60_000);

        // 4. Business hours check
        const hours = (business.business_hours ?? {}) as Record<
          string,
          { open: string; close: string } | null
        >;
        const dayKey = DAY_KEYS[start.getUTCDay()]!;
        const day = hours[dayKey];
        if (!day) {
          return json({
            available: false,
            result: `We're closed that day. Would another day work?`,
          });
        }
        const minutes = start.getUTCHours() * 60 + start.getUTCMinutes();
        const openMin = Number(day.open.slice(0, 2)) * 60 + Number(day.open.slice(3, 5));
        const closeMin = Number(day.close.slice(0, 2)) * 60 + Number(day.close.slice(3, 5));
        if (minutes < openMin || minutes + service.duration_min > closeMin) {
          return json({
            available: false,
            result: `On that day we're open from ${day.open} to ${day.close}. Can I offer you a time inside those hours?`,
          });
        }

        // 5. Conflict check against existing appointments
        const dayStart = new Date(`${p.requestedDate}T00:00:00Z`);
        const dayEnd = new Date(dayStart.getTime() + 86_400_000);
        const { data: sameDay } = await db
          .from("appointments")
          .select("start_time,end_time,status")
          .eq("business_id", business.id)
          .gte("start_time", dayStart.toISOString())
          .lt("start_time", dayEnd.toISOString());

        const booked = (sameDay ?? []).filter((a) => a.status !== "CANCELLED");
        const clash = booked.some(
          (a) => start < new Date(a.end_time) && end > new Date(a.start_time),
        );
        if (clash) {
          const suggestions: string[] = [];
          for (let m = openMin; m + service.duration_min <= closeMin; m += 30) {
            const s = new Date(dayStart.getTime() + m * 60_000);
            const e = new Date(s.getTime() + service.duration_min * 60_000);
            const free = !booked.some(
              (a) => s < new Date(a.end_time) && e > new Date(a.start_time),
            );
            if (free) suggestions.push(s.toISOString().slice(11, 16));
            if (suggestions.length >= 3) break;
          }
          return json({
            available: false,
            result: suggestions.length
              ? `That slot is taken. I can do ${suggestions.join(", ")} instead — which works?`
              : "We're fully booked that day. Could we look at another day?",
            suggestions,
          });
        }

        // 6. Find or create the customer
        const { data: existing } = await db
          .from("customers")
          .select("*")
          .eq("business_id", business.id)
          .eq("phone", p.customerPhone)
          .maybeSingle();
        let customerId = existing?.id;
        if (!customerId) {
          const { data: created, error } = await db
            .from("customers")
            .insert({ business_id: business.id, name: p.customerName, phone: p.customerPhone })
            .select("id")
            .single();
          if (error) return json({ available: false, result: "Couldn't save your details." }, 500);
          customerId = created.id;
        }

        // 7. Book it
        const { data: booking, error: bookError } = await db
          .from("appointments")
          .insert({
            business_id: business.id,
            customer_id: customerId,
            service_id: service.id,
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            status: "CONFIRMED",
            payment_status: "UNPAID",
            notes: "Booked by the voice receptionist.",
          })
          .select("id")
          .single();
        if (bookError || !booking) {
          return json({ available: false, result: "The booking didn't save. Sorry about that." }, 500);
        }

        // 8. Confirmations by SMS and WhatsApp
        const { data: voice } = await db
          .from("voice_settings")
          .select("send_sms,send_whatsapp")
          .eq("business_id", business.id)
          .maybeSingle();

        const confirmationBody = buildConfirmationBody({
          businessName: business.name as string,
          customerName: p.customerName,
          serviceName: service.name,
          price: service.price,
          startTime: start.toISOString(),
          channel: "sms",
        });

        const notifications: Record<string, unknown> = {};
        if (voice?.send_sms !== false) {
          notifications["sms"] = await sendTwilioMessage({
            channel: "sms",
            to: p.customerPhone,
            body: confirmationBody,
          });
        }
        if (voice?.send_whatsapp !== false) {
          const contentSid = process.env["TWILIO_WHATSAPP_CONTENT_SID"] ?? null;
          notifications["whatsapp"] = await sendTwilioMessage({
            channel: "whatsapp",
            to: p.customerPhone,
            body: confirmationBody,
            contentSid,
            contentVariables: contentSid
              ? {
                  "1": p.customerName,
                  "2": service.name,
                  "3": speakTime(start),
                  "4": business.name as string,
                }
              : null,
          });
        }

        return json({
          available: true,
          booked: true,
          result: `Your appointment for ${service.name} is confirmed for ${speakTime(start)}. That's $${service.price}, and it takes about ${service.duration_min} minutes. I'm texting you a confirmation now.`,
          appointmentId: booking.id,
          notifications,
          appointment: {
            service: service.name,
            price: service.price,
            durationMin: service.duration_min,
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            customer: p.customerName,
            phone: p.customerPhone,
          },
        });
      },
    },
  },
});
