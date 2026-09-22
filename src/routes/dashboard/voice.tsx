import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Loader2, PhoneCall, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useBusiness, useServices } from "@/hooks/use-receptionist";
import { getVoiceSettings, updateVoiceSettings } from "@/lib/db";
import { previewVoicePrompt, syncVoiceAgent } from "@/lib/voice-agent.functions";
import type { VoiceSettings } from "@/lib/types";

export const Route = createFileRoute("/dashboard/voice")({
  component: VoicePage,
  head: () => ({
    meta: [
      { title: "Voice agent script | Ava Reception" },
      {
        name: "description",
        content:
          "Record your own welcome message and spoken service menu, then push the script live to your AI phone receptionist.",
      },
      { property: "og:title", content: "Voice agent script | Ava Reception" },
      {
        property: "og:description",
        content: "Write the greeting, menu and sign-off your AI receptionist speaks on every call.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const VOICES = [
  { id: "sarah", label: "Sarah — warm, neutral" },
  { id: "jennifer", label: "Jennifer — bright, upbeat" },
  { id: "mark", label: "Mark — calm, low" },
  { id: "ryan", label: "Ryan — friendly, energetic" },
];

function VoicePage() {
  const queryClient = useQueryClient();
  const { data: business } = useBusiness();
  const { data: services } = useServices(business?.id);
  const businessId = business?.id;

  const { data: settings } = useQuery({
    queryKey: ["voice-settings", businessId],
    queryFn: () => getVoiceSettings(businessId!),
    enabled: Boolean(businessId),
  });

  const [form, setForm] = useState<Partial<VoiceSettings>>({});
  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const preview = useServerFn(previewVoicePrompt);
  const sync = useServerFn(syncVoiceAgent);

  const { data: promptPreview } = useQuery({
    queryKey: ["voice-prompt", businessId, settings?.updated_at],
    queryFn: () => preview({ data: { businessId: businessId! } }),
    enabled: Boolean(businessId),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!settings) return;
      await updateVoiceSettings(settings.id, {
        agent_name: form.agent_name ?? settings.agent_name,
        greeting: form.greeting ?? settings.greeting,
        menu_intro: form.menu_intro ?? settings.menu_intro,
        closing: form.closing ?? settings.closing,
        voice_id: form.voice_id ?? settings.voice_id,
        phone_number: form.phone_number ?? settings.phone_number,
        send_sms: form.send_sms ?? settings.send_sms,
        send_whatsapp: form.send_whatsapp ?? settings.send_whatsapp,
      });
    },
    onSuccess: () => {
      toast.success("Script saved");
      queryClient.invalidateQueries({ queryKey: ["voice-settings"] });
      queryClient.invalidateQueries({ queryKey: ["voice-prompt"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const publish = useMutation({
    mutationFn: async () => {
      await save.mutateAsync();
      return sync({ data: { businessId: businessId! } });
    },
    onSuccess: (result) => {
      if (result?.ok) {
        toast.success("Voice agent updated — callers hear the new script now.");
        queryClient.invalidateQueries({ queryKey: ["voice-settings"] });
      } else {
        toast.error(result?.error ?? "Could not update the voice agent.");
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const field = (key: keyof VoiceSettings) => String(form[key] ?? "");
  const set = (key: keyof VoiceSettings, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const spokenMenu = (services ?? [])
    .map((s) => `${s.name} — $${s.price}, about ${s.duration_min} minutes`)
    .join("\n");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Voice agent</h1>
          <p className="text-sm text-muted-foreground">
            Write the welcome message and service menu your phone receptionist speaks on every call.
          </p>
        </div>
        <Button onClick={() => publish.mutate()} disabled={publish.isPending || !businessId}>
          {publish.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 size-4" />
          )}
          Save &amp; publish to phone line
        </Button>
      </header>

      <section className="panel space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="agent_name">Receptionist name</Label>
            <Input
              id="agent_name"
              value={field("agent_name")}
              onChange={(e) => set("agent_name", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="voice_id">Voice</Label>
            <select
              id="voice_id"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={field("voice_id")}
              onChange={(e) => set("voice_id", e.target.value)}
            >
              {VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="greeting">Welcome message</Label>
          <Textarea
            id="greeting"
            rows={2}
            value={field("greeting")}
            onChange={(e) => set("greeting", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            This is the first thing every caller hears.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="menu_intro">Service menu intro</Label>
          <Textarea
            id="menu_intro"
            rows={2}
            value={field("menu_intro")}
            onChange={(e) => set("menu_intro", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Said before reading the menu. Prices and durations come from your Services page, so they
            are always current:
          </p>
          <pre className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
            {spokenMenu || "Add services to build the spoken menu."}
          </pre>
        </div>

        <div className="space-y-2">
          <Label htmlFor="closing">Sign-off</Label>
          <Textarea
            id="closing"
            rows={2}
            value={field("closing")}
            onChange={(e) => set("closing", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone_number">Phone number callers dial</Label>
          <Input
            id="phone_number"
            value={field("phone_number")}
            onChange={(e) => set("phone_number", e.target.value)}
            placeholder="+1 415 555 0112"
          />
        </div>

        <div className="flex flex-wrap gap-6 pt-2">
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={Boolean(form.send_sms)}
              onCheckedChange={(v) => set("send_sms", v)}
            />
            Text an SMS confirmation after booking
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={Boolean(form.send_whatsapp)}
              onCheckedChange={(v) => set("send_whatsapp", v)}
            />
            Send a WhatsApp confirmation after booking
          </label>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => save.mutate()} disabled={save.isPending}>
            Save draft
          </Button>
        </div>
      </section>

      <section className="panel space-y-3 p-5">
        <div className="flex items-center gap-2">
          <PhoneCall className="size-4 text-primary" />
          <h2 className="font-display text-sm font-semibold">Booking webhook</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Paste this into your Vapi or Retell tool definition as the server URL for
          <code className="mx-1">book_appointment</code>.
        </p>
        <div className="flex items-center gap-2">
          <Input readOnly value={promptPreview?.webhookUrl ?? ""} className="font-mono text-xs" />
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              void navigator.clipboard.writeText(promptPreview?.webhookUrl ?? "");
              toast.success("Copied");
            }}
          >
            <Copy className="size-4" />
          </Button>
        </div>
        {settings?.vapi_assistant_id ? (
          <p className="text-xs text-muted-foreground">
            Live assistant: <span className="font-mono">{settings.vapi_assistant_id}</span>
            {settings.last_synced_at
              ? ` · last published ${new Date(settings.last_synced_at).toLocaleString()}`
              : null}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Not published yet — hit “Save &amp; publish to phone line”.
          </p>
        )}
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="font-display text-sm font-semibold">What the agent is told</h2>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
          {promptPreview?.prompt || "Loading…"}
        </pre>
      </section>
    </div>
  );
}
