import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that handle their own auth (API key or admin secret) or are public
const BYPASS_ROUTES = [
  '/api/webhooks',
  '/api/ad-spend',
  '/api/meta-ad-insights',
  '/api/admin/onboard',
  '/api/admin/backfill-acquisition-dials',
  '/api/admin/clients',
  '/api/onboard',
  '/api/billings/reminders',
  '/api/setup',
  '/api/users',
  '/setup',
  '/login',
  '/onboard',
  '/auth',
  '/report',
  '/forms/acquisition',
  '/api/acquisition/forms',
  '/api/acquisition/webhooks',
  '/api/acquisition/ad-insights',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (BYPASS_ROUTES.some(r => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)).*)'],
};
