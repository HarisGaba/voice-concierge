import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, DollarSign, Users, Wallet } from "lucide-react";

import { PaymentBadge, StatusBadge } from "@/components/status-badge";
import { useAppointments, useBusiness, useCustomers } from "@/hooks/use-receptionist";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [
      { title: "Today's Overview | Ava Reception Dashboard" },
      {
        name: "description",
        content:
          "Live view of today's appointments, projected revenue, outstanding balances and total clients.",
      },
      { property: "og:title", content: "Today's Overview | Ava Reception" },
      {
        property: "og:description",
        content: "Live appointments, revenue and outstanding balances for your business.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Overview,
});

function money(value: number) {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function Overview() {
  const { data: business } = useBusiness();
  const { data: appointments = [], isLoading } = useAppointments(business?.id);
  const { data: customers = [] } = useCustomers();

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const today = appointments.filter((a) => {
    const t = new Date(a.start_time);
    return t >= dayStart && t < dayEnd && a.status !== "CANCELLED";
  });

  const projected = today.reduce((sum, a) => sum + (a.service?.price ?? 0), 0);
  const outstanding = customers.reduce((sum, c) => sum + (c.pending_balance ?? 0), 0);

  const kpis = [
    { label: "Appointments today", value: String(today.length), icon: CalendarClock },
    { label: "Projected revenue", value: money(projected), icon: DollarSign },
    { label: "Outstanding balances", value: money(outstanding), icon: Wallet },
    { label: "Total clients", value: String(customers.length), icon: Users },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Today at {business?.name ?? "your business"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {dayStart.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="panel p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {kpi.label}
              </span>
              <kpi.icon className="size-4 text-primary" />
            </div>
            <p className="mt-3 font-display text-3xl font-semibold">{kpi.value}</p>
          </div>
        ))}
      </div>

      <section className="panel overflow-hidden">
        <header className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Upcoming appointments today</h2>
        </header>
        {isLoading ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">Loading schedule…</p>
        ) : today.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">
            Nothing booked yet today — Ava is standing by on the phone line.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-5 py-3 font-medium">Time</th>
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 font-medium">Service</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Payment</th>
                  <th className="px-5 py-3 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {today.map((a) => (
                  <tr key={a.id} className="border-b border-border/60 last:border-0">
                    <td className="whitespace-nowrap px-5 py-3">
                      {new Date(a.start_time).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-3">
                      <span className="block">{a.customer?.name ?? "Walk-in"}</span>
                      <span className="text-xs text-muted-foreground">{a.customer?.phone}</span>
                    </td>
                    <td className="px-5 py-3">{a.service?.name ?? "—"}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="px-5 py-3">
                      <PaymentBadge status={a.payment_status} />
                    </td>
                    <td className="px-5 py-3 text-right">{money(a.service?.price ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
