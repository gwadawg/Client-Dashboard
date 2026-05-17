"use client";

import Image from "next/image";
import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";

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
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "linear-gradient(145deg, #f8fafc 0%, #eef2f7 48%, #dbe3ef 100%)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto mb-6 flex h-28 w-28 items-center justify-center rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
            <Image
              src="/mr-waiz-logo.png"
              alt="Mr. Waiz logo"
              width={96}
              height={96}
              priority
              className="h-24 w-24 object-contain"
            />
          </div>
          <h1 className="text-4xl font-black tracking-tight text-slate-950">
            Mr. Waiz
          </h1>
          <p className="mt-2 text-sm text-slate-500">Sign in to your reporting dashboard</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white px-8 py-8 shadow-xl shadow-slate-200/70"
        >
          <div>
            <label className="block text-slate-600 text-sm mb-1.5 font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-950 placeholder-slate-400 outline-none transition-colors focus:border-slate-950 focus:bg-white"
              placeholder="you@agency.com"
            />
          </div>

          <div>
            <label className="block text-slate-600 text-sm mb-1.5 font-medium">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-950 placeholder-slate-400 outline-none transition-colors focus:border-slate-950 focus:bg-white"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-lg bg-slate-950 py-2.5 font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-center text-slate-400 text-xs mt-6">
          Need access? Contact your account administrator.
        </p>
      </div>
    </div>
  );
}
