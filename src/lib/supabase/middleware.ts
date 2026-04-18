import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieSetter = Array<{ name: string; value: string; options?: CookieOptions }>;

// Gates every /pulse, /queue, /campaigns route on a live Supabase session whose email
// matches the allowlist. Unauthenticated → redirect to /login.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieSetter) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname === "/" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && !isEmailAllowed(user.email)) {
    // Signed in but wrong domain — bounce to /login with a reason.
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "not_allowed");
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const domain = (process.env.ALLOWED_EMAIL_DOMAIN || "hokusan.ca").toLowerCase();
  return email.toLowerCase().endsWith(`@${domain}`);
}
