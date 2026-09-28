import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
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
import { useAppointments, useBusiness, useCustomers } from "@/hooks/use-receptionist";
import { settleBalance } from "@/lib/db";
import type { Customer } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/dashboard/customers")({
  head: () => ({
    meta: [
      { title: "Client CRM & Ledger | Ava Reception Dashboard" },
      {
        name: "description",
        content:
          "Search clients, see visits and lifetime spend, and record payments against outstanding balances.",
      },
      { property: "og:title", content: "Client CRM & Ledger | Ava Reception" },
      {
        property: "og:description",
        content: "Client contact details, visit history, lifetime spend and pending balances.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CustomersPage,
});

function money(v: number) {
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function CustomersPage() {
  const { data: business } = useBusiness();
  const { data: customers = [], isLoading } = useCustomers();
  const { data: appointments = [] } = useAppointments(business?.id);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<Customer | null>(null);
  const [amount, setAmount] = useState("");

  const stats = useMemo(() => {
    const map = new Map<string, { visits: number; spend: number }>();
    for (const a of appointments) {
      if (!a.customer_id || a.status === "CANCELLED") continue;
      const entry = map.get(a.customer_id) ?? { visits: 0, spend: 0 };
      entry.visits += 1;
      entry.spend += a.service?.price ?? 0;
      map.set(a.customer_id, entry);
    }
    return map;
  }, [appointments]);

  const filtered = customers.filter((c) => {
    const q = search.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.phone.includes(q);
  });

  const settle = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("No client selected");
      const value = Number(amount);
      if (!value || value <= 0) throw new Error("Enter an amount greater than zero");
      await settleBalance(target.id, value);
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      setTarget(null);
      setAmount("");
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Clients</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone Ava has spoken to, with visits, lifetime spend and what they still owe.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or phone"
          className="pl-9"
        />
      </div>

      <section className="panel overflow-hidden">
        {isLoading ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">Loading clients…</p>
        ) : filtered.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">No clients match that search.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 font-medium">Phone</th>
                  <th className="px-5 py-3 font-medium">Visits</th>
                  <th className="px-5 py-3 font-medium">Lifetime spend</th>
                  <th className="px-5 py-3 font-medium">Balance</th>
                  <th className="px-5 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const s = stats.get(c.id) ?? { visits: 0, spend: 0 };
                  return (
                    <tr key={c.id} className="border-b border-border/60 last:border-0">
                      <td className="px-5 py-3">
                        <span className="block">{c.name}</span>
                        {c.notes && (
                          <span className="text-xs text-muted-foreground">{c.notes}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">{c.phone}</td>
                      <td className="px-5 py-3">{s.visits}</td>
                      <td className="px-5 py-3">{money(s.spend)}</td>
                      <td className="px-5 py-3">
                        <span className={c.pending_balance > 0 ? "text-warning" : undefined}>
                          {money(c.pending_balance)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={c.pending_balance <= 0}
                          onClick={() => {
                            setTarget(c);
                            setAmount(String(c.pending_balance));
                          }}
                        >
                          Record payment
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={Boolean(target)} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment — {target?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="amount">Amount received ($)</Label>
            <Input
              id="amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Current balance: {money(target?.pending_balance ?? 0)}
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => settle.mutate()} disabled={settle.isPending}>
              Settle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
