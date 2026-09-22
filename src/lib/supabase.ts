import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function requireEnv(name: string, value: string | undefined): string {
  const v = value?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

// Service role client — full DB access, server-side only, never expose to browser
export function createServiceClient() {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL ?? supabaseUrl),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY ?? supabaseServiceKey),
    {
      auth: { persistSession: false },
    },
  );
}

/** Anon client for public, read-only surfaces (e.g. loanofficer.me card pages). */
export function createAnonClient() {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL ?? supabaseUrl),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? supabaseAnonKey),
    {
      auth: { persistSession: false },
    },
  );
}

// Session-aware server client — reads auth cookies, use in API routes and server components
export async function createAuthClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // setAll throws in Server Components — safe to ignore, middleware handles refresh
        }
      },
    },
  });
}
