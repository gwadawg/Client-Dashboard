"use client";

import Image from "next/image";
import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import GlassPane from "@/components/ui/GlassPane";
import StatusBanner from "@/components/ui/StatusBanner";
import TextField from "@/components/ui/TextField";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("Unable to sign in. Check the email and password, then try again.");
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
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
              priority
              className="h-16 w-16 object-contain"
            />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-ws-label)]">
            Mr. Waiz
          </h1>
          <p className="mt-2 text-sm text-[var(--color-ws-tertiary)]">Sign in to the reporting dashboard</p>
        </div>

        <GlassPane className="rounded-sheet px-8 py-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <TextField
              id="login-email"
              label="Email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />

            <TextField
              id="login-password"
              label="Password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />

            {error && <StatusBanner tone="error">{error}</StatusBanner>}

            <Button type="submit" disabled={loading} block>
              {loading ? "Signing In…" : "Sign In"}
            </Button>
          </form>
        </GlassPane>

        <p className="text-center text-[var(--color-ws-quaternary)] text-xs mt-6">
          Need access? Contact your account administrator.
        </p>
      </div>
    </div>
  );
}
