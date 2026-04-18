import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSbJsClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as CookieOptions)
            );
          } catch {
            // Called from a Server Component without a mutable cookie store. Safe to ignore
            // when middleware is refreshing the session on every request.
          }
        },
      },
    }
  );
}

// Service-role client for paths that need to bypass RLS. Not used by pages in MVP —
// reserved for admin/debug routes in Phase 2.
export function createServiceClient() {
  return createSbJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
