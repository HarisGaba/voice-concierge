/**
 * Voice agent sync (Vapi.ai first, Retell-compatible webhook).
 *
 * Builds the live system prompt from the business, its services and the owner's
 * own welcome message / service menu script, then creates or updates the
 * assistant in the connected Vapi account.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

const syncSchema = z.object({ businessId: z.string().uuid() });

interface ServiceRow {
  name: string;
  price: number;
  duration_min: number;
  description: string;
}

function buildSystemPrompt(input: {
  businessName: string;
  address: string;
  hours: Record<string, { open: string; close: string } | null>;
  services: ServiceRow[];
  agentName: string;
  greeting: string;
  menuIntro: string;
  closing: string;
}) {
  const hoursText = Object.entries(input.hours)
    .map(([day, v]) => `${day}: ${v ? `${v.open}–${v.close}` : "closed"}`)
    .join(", ");
  const menu = input.services
    .map(
      (s) =>
        `- ${s.name}: $${s.price}, about ${s.duration_min} minutes${s.description ? ` (${s.description})` : ""}`,
    )
    .join("\n");

  return `## Persona
You are ${input.agentName}, the front-desk receptionist for ${input.businessName}. You are warm, concise and professional. Speak in short spoken sentences, one or two at a time. Never read lists robotically. Do not mention being an AI unless asked directly.

## Business context
- Business: ${input.businessName}
- Address: ${input.address}
- Opening hours: ${hoursText}
- Services and prices:
${menu}

## Call flow
1. Greet with: "${input.greeting}"
2. Identify the intent: booking, rescheduling, cancelling, pricing, or opening hours.
3. When the caller is unsure, say: "${input.menuIntro}" then name two or three services with price and duration and ask which they'd like.
4. Collect, one question at a time: service, preferred day, preferred time, caller's full name, and confirm the phone number on the call.
5. Call the book_appointment tool. Never promise a slot before the tool returns.
6. If available is true, read the confirmation back. If false, apologise briefly and offer the times in suggestions.
7. Close with: "${input.closing}"

## Rules
- Never invent prices, durations or availability — only use the menu above and tool results.
- Confirm the spelling of unusual names and repeat the phone number digit by digit.
- If the caller asks for a time outside opening hours, say so and offer the nearest open slot.
- If the tool errors, apologise and offer a callback instead of guessing.
- Keep the call under three minutes where possible.`;
}

function baseUrl() {
  const origin = getRequestHeader("origin");
  if (origin) return origin;
  const host = getRequestHeader("host");
  const proto = host?.startsWith("localhost") ? "http" : "https";
  return host ? `${proto}://${host}` : "";
}

export const syncVoiceAgent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => syncSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env["VAPI_API_KEY"];
    if (!apiKey) {
      return { ok: false as const, error: "No Vapi API key is configured yet." };
    }

    const { getServerClient } = await import("@/lib/voice.server");
    const db = getServerClient();

    const { data: business } = await db
      .from("businesses")
      .select("*")
      .eq("id", data.businessId)
      .maybeSingle();
    if (!business) return { ok: false as const, error: "Business not found." };

    const [{ data: services }, { data: settings }] = await Promise.all([
      db.from("services").select("*").eq("business_id", data.businessId).order("price"),
      db.from("voice_settings").select("*").eq("business_id", data.businessId).maybeSingle(),
    ]);
    if (!settings) return { ok: false as const, error: "Voice settings not found." };

    const prompt = buildSystemPrompt({
      businessName: business.name as string,
      address: business.address as string,
      hours: (business.business_hours ?? {}) as Record<
        string,
        { open: string; close: string } | null
      >,
      services: (services ?? []) as unknown as ServiceRow[],
      agentName: settings.agent_name as string,
      greeting: settings.greeting as string,
      menuIntro: settings.menu_intro as string,
      closing: settings.closing as string,
    });

    const webhookUrl = `${baseUrl()}/api/public/vapi/webhook`;

    const payload = {
      name: `${business.name} — ${settings.agent_name}`,
      firstMessage: settings.greeting,
      model: {
        provider: "openai",
        model: "gpt-4o",
        messages: [{ role: "system", content: prompt }],
        tools: [
          {
            type: "function",
            async: false,
            server: { url: webhookUrl },
            function: {
              name: "book_appointment",
              description: "Check availability and book an appointment for the caller.",
              parameters: {
                type: "object",
                properties: {
                  customerPhone: { type: "string", description: "E.164 phone number" },
                  customerName: { type: "string" },
                  requestedDate: { type: "string", description: "YYYY-MM-DD" },
                  requestedTime: { type: "string", description: "HH:mm, 24-hour" },
                  serviceName: { type: "string", description: "Must match a service on the menu" },
                },
                required: [
                  "customerPhone",
                  "customerName",
                  "requestedDate",
                  "requestedTime",
                  "serviceName",
                ],
              },
            },
          },
        ],
      },
      voice: { provider: "11labs", voiceId: settings.voice_id },
      transcriber: { provider: "deepgram", model: "nova-2", language: "en" },
    };

    const existingId = (settings.vapi_assistant_id as string) || "";
    const url = existingId
      ? `https://api.vapi.ai/assistant/${existingId}`
      : "https://api.vapi.ai/assistant";

    const response = await fetch(url, {
      method: existingId ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    if (!response.ok) {
      console.error(`Vapi sync failed [${response.status}]: ${text}`);
      return { ok: false as const, error: `Vapi rejected the update (${response.status}): ${text}` };
    }

    const result = JSON.parse(text) as { id?: string };
    const assistantId = result.id ?? existingId;
    await db
      .from("voice_settings")
      .update({ vapi_assistant_id: assistantId, last_synced_at: new Date().toISOString() })
      .eq("id", settings.id as string);

    return { ok: true as const, assistantId, webhookUrl, prompt };
  });

export const previewVoicePrompt = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => syncSchema.parse(input))
  .handler(async ({ data }) => {
    const { getServerClient } = await import("@/lib/voice.server");
    const db = getServerClient();
    const { data: business } = await db
      .from("businesses")
      .select("*")
      .eq("id", data.businessId)
      .maybeSingle();
    const [{ data: services }, { data: settings }] = await Promise.all([
      db.from("services").select("*").eq("business_id", data.businessId).order("price"),
      db.from("voice_settings").select("*").eq("business_id", data.businessId).maybeSingle(),
    ]);
    if (!business || !settings) return { prompt: "", webhookUrl: "" };
    return {
      prompt: buildSystemPrompt({
        businessName: business.name as string,
        address: business.address as string,
        hours: (business.business_hours ?? {}) as Record<
          string,
          { open: string; close: string } | null
        >,
        services: (services ?? []) as unknown as ServiceRow[],
        agentName: settings.agent_name as string,
        greeting: settings.greeting as string,
        menuIntro: settings.menu_intro as string,
        closing: settings.closing as string,
      }),
      webhookUrl: `${baseUrl()}/api/public/vapi/webhook`,
    };
  });
