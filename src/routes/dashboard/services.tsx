import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import { useBusiness, useServices } from "@/hooks/use-receptionist";
import { deleteService, upsertService } from "@/lib/db";
import type { Service } from "@/lib/types";

export const Route = createFileRoute("/dashboard/services")({
  head: () => ({
    meta: [
      { title: "Services & Pricing | Ava Reception Dashboard" },
      {
        name: "description",
        content:
          "Create, edit and price the services your AI receptionist offers callers, with duration in minutes.",
      },
      { property: "og:title", content: "Services & Pricing | Ava Reception" },
      {
        property: "og:description",
        content: "Manage the service menu your voice receptionist quotes to callers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ServicesPage,
});

type Draft = { id?: string; name: string; price: string; duration_min: string; description: string };

const emptyDraft: Draft = { name: "", price: "", duration_min: "30", description: "" };

function ServicesPage() {
  const { data: business } = useBusiness();
  const { data: services = [], isLoading } = useServices(business?.id);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["services", business?.id] });

  const save = useMutation({
    mutationFn: async () => {
      if (!business) throw new Error("No business loaded");
      if (!draft.name.trim()) throw new Error("Give the service a name");
      await upsertService({
        ...(draft.id ? { id: draft.id } : {}),
        business_id: business.id,
        name: draft.name.trim(),
        price: Number(draft.price) || 0,
        duration_min: Number(draft.duration_min) || 30,
        description: draft.description,
      });
    },
    onSuccess: () => {
      toast.success(draft.id ? "Service updated" : "Service added");
      setOpen(false);
      setDraft(emptyDraft);
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteService(id),
    onSuccess: () => {
      toast.success("Service removed");
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const edit = (service: Service) => {
    setDraft({
      id: service.id,
      name: service.name,
      price: String(service.price),
      duration_min: String(service.duration_min),
      description: service.description,
    });
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Services</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This is the menu Ava reads out on the phone, with prices and durations.
          </p>
        </div>
        <Button
          onClick={() => {
            setDraft(emptyDraft);
            setOpen(true);
          }}
        >
          <Plus className="size-4" /> New service
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading services…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {services.map((service) => (
            <article key={service.id} className="panel flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-semibold">{service.name}</h2>
                <span className="font-display text-lg text-primary">${service.price}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{service.duration_min} minutes</p>
              {service.description && (
                <p className="mt-3 text-sm text-muted-foreground">{service.description}</p>
              )}
              <div className="mt-5 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => edit(service)}>
                  <Pencil className="size-3.5" /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove.mutate(service.id)}
                  disabled={remove.isPending}
                >
                  <Trash2 className="size-3.5" /> Delete
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit service" : "New service"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Full Interior Detail"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price">Price ($)</Label>
                <Input
                  id="price"
                  inputMode="decimal"
                  value={draft.price}
                  onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Duration (min)</Label>
                <Input
                  id="duration"
                  inputMode="numeric"
                  value={draft.duration_min}
                  onChange={(e) => setDraft({ ...draft, duration_min: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="What's included?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save service
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
