import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { PhoneCall } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Ava Reception" },
      { name: "description", content: "Sign in or create your business account for Ava, the AI voice receptionist." },
      { property: "og:title", content: "Sign in — Ava Reception" },
      { property: "og:description", content: "Owner sign-in for the Ava AI receptionist dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) navigate({ to: "/dashboard", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/dashboard" },
        });
        if (error) throw error;
        if (!data.session) setNotice("Check your email and click the link to confirm your account.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setNotice("If that email has an account, a reset link is on its way.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/auth",
    });
    if (result.error) setError(result.error.message ?? "Google sign-in failed");
  }

  const title = mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset password";

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel w-full max-w-sm p-6">
        <Link to="/" className="mb-6 flex items-center gap-2">
          <span className="signal-surface flex size-9 items-center justify-center rounded-lg">
            <PhoneCall className="size-4 text-primary-foreground" />
          </span>
          <span className="font-display font-semibold">Ava Reception</span>
        </Link>
        <h1 className="font-display text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signup" ? "Set up your AI receptionist in a few minutes." : "Manage your calls, bookings and clients."}
        </p>

        {mode !== "forgot" && (
          <>
            <Button variant="outline" className="mt-6 w-full" onClick={google} type="button">
              Continue with Google
            </Button>
            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}

        <form onSubmit={submit} className={mode === "forgot" ? "mt-6 space-y-4" : "space-y-4"}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {mode !== "forgot" && (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {notice && <p className="text-sm text-primary">{notice}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Please wait..." : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
          </Button>
        </form>

        <div className="mt-4 flex flex-col gap-1 text-center text-sm text-muted-foreground">
          {mode === "signin" && (
            <>
              <button className="hover:text-foreground" onClick={() => setMode("signup")}>New here? Create an account</button>
              <button className="hover:text-foreground" onClick={() => setMode("forgot")}>Forgot password?</button>
            </>
          )}
          {mode !== "signin" && (
            <button className="hover:text-foreground" onClick={() => setMode("signin")}>Back to sign in</button>
          )}
        </div>
      </div>
    </div>
  );
}
