import { Link, createFileRoute } from "@tanstack/react-router";
import { CalendarCheck, MessageSquare, PhoneCall, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ava — AI Voice Receptionist & Booking for Local Business" },
      {
        name: "description",
        content:
          "Ava answers every call, books appointments into your calendar and sends WhatsApp confirmations for clinics, salons, detailers and repair shops.",
      },
      { property: "og:title", content: "Ava — AI Voice Receptionist & Booking" },
      {
        property: "og:description",
        content:
          "An AI receptionist that answers calls, checks availability and books jobs 24/7, with a live owner dashboard.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: PhoneCall,
    title: "Answers every call",
    body: "A natural-sounding receptionist greets callers, reads your service menu and prices, and never puts anyone on hold.",
  },
  {
    icon: CalendarCheck,
    title: "Books into real availability",
    body: "Checks opening hours and existing jobs in real time before confirming a slot, so double bookings can't happen.",
  },
  {
    icon: MessageSquare,
    title: "WhatsApp confirmations",
    body: "Every booking triggers a message with CONFIRM and CANCEL options, cutting no-shows without a phone call.",
  },
  {
    icon: Wallet,
    title: "Client ledger built in",
    body: "Track visits, lifetime spend and outstanding balances, and settle payments from the dashboard.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="signal-surface flex size-9 items-center justify-center rounded-lg">
            <PhoneCall className="size-4 text-primary-foreground" />
          </span>
          <span className="font-display font-semibold">Ava Reception</span>
        </div>
        <Button asChild size="sm">
          <Link to="/dashboard">Open dashboard</Link>
        </Button>
      </header>

      <section className="hero-surface border-y border-border">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <p className="mb-4 inline-flex rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            For clinics, salons, detailers and repair shops
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight md:text-6xl">
            The receptionist that <span className="text-signal">never misses a call</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            Ava picks up on the first ring, quotes your prices, checks the diary and books the
            job — then hands you a live dashboard of today's schedule, revenue and balances.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/dashboard">See the live dashboard</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/dashboard/calendar">View the calendar</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-4 md:grid-cols-2">
          {features.map((f) => (
            <article key={f.title} className="panel p-6">
              <f.icon className="size-5 text-primary" />
              <h2 className="mt-4 text-lg font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t border-border px-6 py-8 text-center text-xs text-muted-foreground">
        Ava Reception — AI voice booking for local service businesses.
      </footer>
    </div>
  );
}
