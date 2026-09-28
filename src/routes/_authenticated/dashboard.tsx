import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { CalendarDays, LayoutDashboard, LogOut, Mic, PhoneCall, Users, Wrench } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

import { Toaster } from "@/components/ui/sonner";
import { useBusiness } from "@/hooks/use-receptionist";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardLayout,
});

const nav = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/dashboard/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/dashboard/services", label: "Services", icon: Wrench },
  { to: "/dashboard/customers", label: "Clients", icon: Users },
  { to: "/dashboard/voice", label: "Voice agent", icon: Mic },
];

function DashboardLayout() {
  const { data: business, isSuccess } = useBusiness();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isSuccess && !business) navigate({ to: "/onboarding", replace: true });
  }, [isSuccess, business, navigate]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 md:flex">
        <Link to="/" className="mb-8 flex items-center gap-2 px-2">
          <span className="signal-surface flex size-9 items-center justify-center rounded-lg">
            <PhoneCall className="size-4 text-primary-foreground" />
          </span>
          <span className="font-display text-sm font-semibold leading-tight text-sidebar-foreground">
            Ava Reception
            <span className="block text-xs font-normal text-muted-foreground">
              {business?.name ?? "Loading..."}
            </span>
          </span>
        </Link>

        <nav className="flex flex-col gap-1">
          {nav.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="panel mt-auto p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Voice line live</p>
          <p className="mt-1">{business?.phone || "—"}</p>
        </div>
        <button
          onClick={signOut}
          className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        >
          <LogOut className="size-4" /> Sign out
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 overflow-x-auto border-b border-border px-4 py-3 md:hidden">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
            >
              {item.label}
            </Link>
          ))}
          <button onClick={signOut} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            Sign out
          </button>
        </header>
        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
}
