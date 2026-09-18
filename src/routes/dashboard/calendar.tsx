import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAppointments, useBusiness, useServices } from "@/hooks/use-receptionist";
import {
  createAppointment,
  deleteAppointment,
  findOrCreateCustomer,
  updateAppointment,
} from "@/lib/db";
import type { AppointmentStatus, AppointmentWithRelations } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/calendar")({
  head: () => ({
    meta: [
      { title: "Booking Calendar | Ava Reception Dashboard" },
      {
        name: "description",
        content:
          "Daily and weekly booking grid. Add, reschedule, cancel or block slots such as lunch breaks and holidays.",
      },
      { property: "og:title", content: "Booking Calendar | Ava Reception" },
      {
        property: "og:description",
        content: "Manage the diary: add, reschedule, cancel or block appointment slots.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CalendarPage,
});

const START_HOUR = 8;
const END_HOUR = 20;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * 86_400_000);
}
function startOfWeek(d: Date) {
  const c = startOfDay(d);
  return addDays(c, -c.getDay());
}
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Draft = {
  id?: string;
  customerName: string;
  customerPhone: string;
  serviceId: string;
  start: string;
  durationMin: number;
  status: AppointmentStatus;
  notes: string;
  blocked: boolean;
};

function CalendarPage() {
  const { data: business } = useBusiness();
  const { data: services = [] } = useServices(business?.id);
  const { data: appointments = [] } = useAppointments(business?.id);
  const queryClient = useQueryClient();

  const [view, setView] = useState<"day" | "week">("week");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [draft, setDraft] = useState<Draft | null>(null);

  const days = useMemo(() => {
    if (view === "day") return [anchor];
    const first = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(first, i));
  }, [view, anchor]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["appointments", business?.id] });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      if (!business) throw new Error("No business loaded");
      const start = new Date(d.start);
      const service = services.find((s) => s.id === d.serviceId);
      const duration = d.blocked ? d.durationMin : (service?.duration_min ?? d.durationMin);
      const end = new Date(start.getTime() + duration * 60_000);

      let customerId: string | null = null;
      if (!d.blocked && d.customerPhone.trim()) {
        const customer = await findOrCreateCustomer(
          d.customerName.trim() || "Walk-in",
          d.customerPhone.trim(),
        );
        customerId = customer.id;
      }

      const payload = {
        business_id: business.id,
        customer_id: customerId,
        service_id: d.blocked ? null : (d.serviceId || null),
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: d.status,
        notes: d.blocked ? d.notes || "Blocked" : d.notes,
      };
      if (d.id) await updateAppointment(d.id, payload);
      else await createAppointment(payload);
    },
    onSuccess: () => {
      toast.success("Calendar updated");
      setDraft(null);
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteAppointment(id),
    onSuccess: () => {
      toast.success("Slot removed");
      setDraft(null);
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendReminder = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/public/whatsapp/send-reminder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appointmentId: id }),
      });
      if (!res.ok) throw new Error("Message could not be sent");
      return (await res.json()) as { simulated?: boolean };
    },
    onSuccess: (r) =>
      toast.success(
        r.simulated
          ? "WhatsApp confirmation simulated (add Twilio details to send for real)"
          : "WhatsApp confirmation sent",
      ),
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = (day: Date, hour: number) => {
    const start = new Date(day);
    start.setHours(hour, 0, 0, 0);
    setDraft({
      customerName: "",
      customerPhone: "",
      serviceId: services[0]?.id ?? "",
      start: toLocalInput(start),
      durationMin: services[0]?.duration_min ?? 30,
      status: "CONFIRMED",
      notes: "",
      blocked: false,
    });
  };

  const openExisting = (a: AppointmentWithRelations) => {
    const minutes =
      (new Date(a.end_time).getTime() - new Date(a.start_time).getTime()) / 60_000;
    setDraft({
      id: a.id,
      customerName: a.customer?.name ?? "",
      customerPhone: a.customer?.phone ?? "",
      serviceId: a.service?.id ?? "",
      start: toLocalInput(new Date(a.start_time)),
      durationMin: minutes,
      status: a.status,
      notes: a.notes,
      blocked: !a.service_id && !a.customer_id,
    });
  };

  const forSlot = (day: Date, hour: number) =>
    appointments.filter((a) => {
      const s = new Date(a.start_time);
      return (
        s.getFullYear() === day.getFullYear() &&
        s.getMonth() === day.getMonth() &&
        s.getDate() === day.getDate() &&
        s.getHours() === hour
      );
    });

  const label =
    view === "day"
      ? anchor.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
      : `${startOfWeek(anchor).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${addDays(
          startOfWeek(anchor),
          6,
        ).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Click any empty slot to add a booking or block time off.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setAnchor(addDays(anchor, view === "day" ? -1 : -7))}
            aria-label="Previous"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-44 text-center text-sm">{label}</span>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setAnchor(addDays(anchor, view === "day" ? 1 : 7))}
            aria-label="Next"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(startOfDay(new Date()))}>
            Today
          </Button>
          <Button
            size="sm"
            variant={view === "day" ? "default" : "ghost"}
            onClick={() => setView("day")}
          >
            Day
          </Button>
          <Button
            size="sm"
            variant={view === "week" ? "default" : "ghost"}
            onClick={() => setView("week")}
          >
            Week
          </Button>
        </div>
      </div>

      <div className="panel overflow-x-auto">
        <div
          className="min-w-[720px]"
          style={{ display: "grid", gridTemplateColumns: `72px repeat(${days.length}, 1fr)` }}
        >
          <div className="border-b border-border p-2" />
          {days.map((d) => (
            <div
              key={d.toISOString()}
              className="border-b border-l border-border p-2 text-center text-xs"
            >
              <span className="block font-medium">
                {d.toLocaleDateString("en-US", { weekday: "short" })}
              </span>
              <span className="text-muted-foreground">{d.getDate()}</span>
            </div>
          ))}

          {HOURS.map((hour) => (
            <div key={hour} className="contents">
              <div className="border-b border-border p-2 text-right text-xs text-muted-foreground">
                {hour}:00
              </div>
              {days.map((day) => {
                const items = forSlot(day, hour);
                return (
                  <button
                    key={`${day.toISOString()}-${hour}`}
                    type="button"
                    onClick={() => (items[0] ? openExisting(items[0]) : openNew(day, hour))}
                    className="min-h-14 space-y-1 border-b border-l border-border p-1 text-left transition-colors hover:bg-accent/40"
                  >
                    {items.map((a) => (
                      <span
                        key={a.id}
                        className={cn(
                          "block truncate rounded-md border px-2 py-1 text-xs",
                          a.status === "CANCELLED"
                            ? "border-destructive/30 bg-destructive/10 text-destructive line-through"
                            : !a.service_id && !a.customer_id
                              ? "border-border bg-muted text-muted-foreground"
                              : "border-primary/30 bg-primary/10 text-primary",
                        )}
                      >
                        {a.service?.name ?? a.notes ?? "Blocked"}
                        {a.customer?.name ? ` · ${a.customer.name}` : ""}
                      </span>
                    ))}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <Dialog open={Boolean(draft)} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {draft?.id ? "Edit slot" : "New slot"}
              {draft?.id && (
                <span className="ml-2 align-middle">
                  <StatusBadge status={draft.status} />
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {draft && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={draft.blocked ? "ghost" : "default"}
                  onClick={() => setDraft({ ...draft, blocked: false })}
                >
                  Appointment
                </Button>
                <Button
                  size="sm"
                  variant={draft.blocked ? "default" : "ghost"}
                  onClick={() => setDraft({ ...draft, blocked: true })}
                >
                  Block time
                </Button>
              </div>

              {!draft.blocked && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="cname">Client name</Label>
                      <Input
                        id="cname"
                        value={draft.customerName}
                        onChange={(e) => setDraft({ ...draft, customerName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cphone">Phone</Label>
                      <Input
                        id="cphone"
                        value={draft.customerPhone}
                        onChange={(e) => setDraft({ ...draft, customerPhone: e.target.value })}
                        placeholder="+1 415 555 0101"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Service</Label>
                    <Select
                      value={draft.serviceId}
                      onValueChange={(v) => setDraft({ ...draft, serviceId: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pick a service" />
                      </SelectTrigger>
                      <SelectContent>
                        {services.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} · ${s.price} · {s.duration_min}m
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start">Starts</Label>
                  <Input
                    id="start"
                    type="datetime-local"
                    value={draft.start}
                    onChange={(e) => setDraft({ ...draft, start: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dur">Duration (min)</Label>
                  <Input
                    id="dur"
                    inputMode="numeric"
                    value={String(draft.durationMin)}
                    onChange={(e) =>
                      setDraft({ ...draft, durationMin: Number(e.target.value) || 30 })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={draft.status}
                  onValueChange={(v) => setDraft({ ...draft, status: v as AppointmentStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"] as const).map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.charAt(0) + s.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  placeholder={draft.blocked ? "Lunch break, holiday…" : "Anything to remember"}
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            {draft?.id && (
              <>
                <Button
                  variant="ghost"
                  onClick={() => sendReminder.mutate(draft.id!)}
                  disabled={sendReminder.isPending}
                >
                  <MessageSquare className="size-4" /> WhatsApp
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => save.mutate({ ...draft, status: "CANCELLED" })}
                >
                  Cancel booking
                </Button>
                <Button variant="ghost" onClick={() => remove.mutate(draft.id!)}>
                  Delete
                </Button>
              </>
            )}
            <Button onClick={() => draft && save.mutate(draft)} disabled={save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
