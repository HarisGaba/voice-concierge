/**
 * Twilio messaging helper (SMS + WhatsApp).
 *
 * Two credential paths are supported, checked in this order:
 *  1. Lovable connector gateway — LOVABLE_API_KEY + TWILIO_API_KEY (set when the
 *     Twilio connector is linked to the project).
 *  2. Direct Twilio REST — TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN.
 *
 * With neither configured, sends are "simulated": the exact payload is returned
 * so the flow can be demoed and inspected without credentials.
 */

export type SendChannel = "sms" | "whatsapp";

export interface SendResult {
  sent: boolean;
  simulated: boolean;
  channel: SendChannel;
  to: string;
  body: string;
  sid?: string;
  error?: unknown;
}

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export function twilioConfigured() {
  const gateway = Boolean(env("LOVABLE_API_KEY") && env("TWILIO_API_KEY"));
  const direct = Boolean(env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN"));
  return {
    gateway,
    direct,
    any: gateway || direct,
    smsFrom: env("TWILIO_SMS_FROM") ?? env("TWILIO_PHONE_NUMBER") ?? null,
    whatsappFrom: env("TWILIO_WHATSAPP_FROM") ?? null,
  };
}

/** Normalises a phone number into the Twilio channel address. */
function address(channel: SendChannel, phone: string) {
  const clean = phone.trim();
  return channel === "whatsapp" ? `whatsapp:${clean}` : clean;
}

export async function sendTwilioMessage(options: {
  channel: SendChannel;
  to: string;
  body: string;
  /** Optional approved Twilio Content template (quick-reply buttons). */
  contentSid?: string | null;
  contentVariables?: Record<string, string> | null;
}): Promise<SendResult> {
  const { channel, to, body } = options;
  const config = twilioConfigured();
  const from = channel === "whatsapp" ? config.whatsappFrom : config.smsFrom;

  if (!config.any || !from || !to) {
    return { sent: false, simulated: true, channel, to, body };
  }

  const form = new URLSearchParams({
    To: address(channel, to),
    From: address(channel, from),
  });
  if (options.contentSid) {
    form.set("ContentSid", options.contentSid);
    if (options.contentVariables) {
      form.set("ContentVariables", JSON.stringify(options.contentVariables));
    }
  } else {
    form.set("Body", body);
  }

  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  let url: string;

  if (config.gateway) {
    url = `${GATEWAY_URL}/Messages.json`;
    headers["Authorization"] = `Bearer ${env("LOVABLE_API_KEY")}`;
    headers["X-Connection-Api-Key"] = env("TWILIO_API_KEY")!;
  } else {
    const sid = env("TWILIO_ACCOUNT_SID")!;
    const token = env("TWILIO_AUTH_TOKEN")!;
    url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    headers["Authorization"] = `Basic ${btoa(`${sid}:${token}`)}`;
  }

  const response = await fetch(url, { method: "POST", headers, body: form });
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    console.error(`Twilio ${channel} send failed [${response.status}]: ${text}`);
    return { sent: false, simulated: false, channel, to, body, error: payload };
  }

  return {
    sent: true,
    simulated: false,
    channel,
    to,
    body,
    sid: typeof payload["sid"] === "string" ? payload["sid"] : undefined,
  };
}

export function formatWhen(startTime: string) {
  return new Date(startTime).toLocaleString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function buildConfirmationBody(input: {
  businessName: string;
  customerName?: string | null;
  serviceName?: string | null;
  price?: number | null;
  startTime: string;
  channel: SendChannel;
}) {
  const when = formatWhen(input.startTime);
  const lines = [
    `Hi ${input.customerName ?? "there"}! Your ${input.serviceName ?? "appointment"} at ${input.businessName} is booked for ${when}.`,
  ];
  if (typeof input.price === "number") lines.push(`Total: $${input.price}.`);
  lines.push("");
  lines.push("Reply CONFIRM to lock it in, or CANCEL to release the slot.");
  return lines.join("\n");
}
