import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { claimDemoBusiness, createBusiness, getBusiness } from "@/lib/db";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your business — Ava Reception" },
      { name: "description", content: "Tell Ava about your business so it can answer calls and book appointments." },
      { property: "og:title", content: "Set up your business — Ava Reception" },
      { property: "og:description", content: "Business onboarding for the Ava AI receptionist." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Onboarding,
});

type Svc = { name: string; price: number; duration_min: number; description: string };

const VERTICALS: Record<string, { label: string; services: Svc[] }> = {
  salon: {
    label: "Salon / beauty parlor",
    services: [
      { name: "Haircut", price: 35, duration_min: 45, description: "Wash, cut and style" },
      { name: "Hair Color", price: 90, duration_min: 120, description: "Full color" },
      { name: "Manicure", price: 25, duration_min: 30, description: "Classic manicure" },
      { name: "Facial", price: 60, duration_min: 60, description: "Deep-cleansing facial" },
    ],
  },
  detailing: {
    label: "Car detailing",
    services: [
      { name: "Express Wash", price: 39, duration_min: 30, description: "Exterior wash and dry" },
      { name: "Full Interior Detail", price: 149, duration_min: 120, description: "Vacuum, shampoo, wipe-down" },
      { name: "Ceramic Coating", price: 399, duration_min: 240, description: "Long-lasting paint protection" },
    ],
  },
  dental: {
    label: "Dentist",
    services: [
      { name: "Checkup & Cleaning", price: 120, duration_min: 60, description: "Exam and cleaning" },
      { name: "Teeth Whitening", price: 250, duration_min: 60, description: "In-office whitening" },
      { name: "Filling", price: 180, duration_min: 45, description: "Composite filling" },
    ],
  },
  clinic: {
    label: "Clinic",
    services: [
      { name: "General Consultation", price: 80, duration_min: 30, description: "Doctor visit" },
      { name: "Follow-up Visit", price: 50, duration_min: 20, description: "Review and follow-up" },
      { name: "Physiotherapy Session", price: 90, duration_min: 45, description: "Treatment session" },
    ],
  },
  other: { label: "Other", services: [] },
};

const DEFAULT_HOURS = {
  sun: null,
  mon: { open: "09:00", close: "18:00" },
  tue: { open: "09:00", close: "18:00" },
  wed: { open: "09:00", close: "18:00" },
  thu: { open: "09:00", close: "18:00" },
  fri: { open: "09:00", close: "18:00" },
  sat: { open: "10:00", close: "16:00" },
};

function Onboarding() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [vertical, setVertical] = useState("salon");
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBusiness().then((b) => b && navigate({ to: "/dashboard", replace: true }));
  }, [navigate]);

  async function done() {
    await qc.invalidateQueries();
    navigate({ to: "/dashboard", replace: true });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createBusiness({
        ...form,
        vertical,
        business_hours: DEFAULT_HOURS,
        services: VERTICALS[vertical]!.services,
      });
      await done();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create business");
      setBusy(false);
    }
  }

  async function demo() {
    setBusy(true);
    setError(null);
    try {
      const id = await claimDemoBusiness();
      if (!id) throw new Error("The demo business has already been claimed.");
      await done();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load demo");
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="font-display text-3xl font-semibold">Set up your business</h1>
      <p className="mt-2 text-muted-foreground">
        Ava uses this to greet callers, read your menu and book into your hours. You can change everything later.
      </p>

      <form onSubmit={submit} className="panel mt-8 space-y-5 p-6">
        <div className="space-y-2">
          <Label>Type of business</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(VERTICALS).map(([key, v]) => (
              <button
                type="button"
                key={key}
                onClick={() => setVertical(key)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  vertical === key ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
          {VERTICALS[vertical]!.services.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Starter menu: {VERTICALS[vertical]!.services.map((s) => s.name).join(", ")}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Business name</Label>
          <Input id="name" required value={form.name} onChange={set("name")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" value={form.phone} onChange={set("phone")} placeholder="+1 555 123 4567" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bemail">Email</Label>
            <Input id="bemail" type="email" value={form.email} onChange={set("email")} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="address">Address</Label>
          <Input id="address" value={form.address} onChange={set("address")} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Setting up..." : "Create my business"}
        </Button>
      </form>

      <button onClick={demo} disabled={busy} className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground">
        Just exploring? Load the demo business instead
      </button>
    </div>
  );
}
