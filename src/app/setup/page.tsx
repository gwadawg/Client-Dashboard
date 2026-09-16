"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import GlassPane from "@/components/ui/GlassPane";
import StatusBanner from "@/components/ui/StatusBanner";
import TextField from "@/components/ui/TextField";

export default function SetupPage() {
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/setup")
      .then(r => r.json())
      .then(d => {
        if (!d.needsSetup) router.replace("/login");
        else setChecking(false);
      });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match"); return; }
    if (password.length < 8) { setError("Choose a password with at least 8 characters"); return; }

    setLoading(true);
    setError("");

    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const d = await res.json();
    if (!res.ok) { setError(d.error); setLoading(false); return; }

    const supabase = createBrowserSupabaseClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) { setError("Account created, but sign-in failed. Open Sign In and try again."); setLoading(false); return; }

    router.push("/dashboard");
    router.refresh();
  }

  if (checking) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[var(--color-ws-base)]">
        <div className="ws-spinner w-5 h-5 border-2 border-white/30 border-t-[var(--color-ws-accent)] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4 bg-[var(--color-ws-base)]">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-sheet bg-white ring-1 ring-white/10">
            <Image
              src="/mr-waiz-logo.png"
              alt="Mr. Waiz logo"
              width={72}
              height={72}
              className="h-16 w-16 object-contain"
            />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-ws-label)]">
            Create Account
          </h1>
          <p className="mt-2 text-sm text-[var(--color-ws-tertiary)]">Set up the first admin for this dashboard</p>
        </div>

        <GlassPane className="rounded-sheet px-8 py-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <TextField
              id="setup-email"
              label="Email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />

            <TextField
              id="setup-password"
              label="Password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              helper="Choose a password with at least 8 characters"
            />

            <TextField
              id="setup-confirm"
              label="Confirm Password"
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />

            {error && <StatusBanner tone="error">{error}</StatusBanner>}

            <Button type="submit" disabled={loading} block>
              {loading ? "Creating Account…" : "Create Account"}
            </Button>
          </form>
        </GlassPane>

        <p className="text-center text-[var(--color-ws-quaternary)] text-xs mt-6">
          This page is only available before the first account is created.
        </p>
      </div>
    </div>
  );
}
