import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { fetchRole } from "@/lib/auth/role";

const PUBLIC_PATHS = ["/login"];
// Authenticates itself via CRON_SECRET (see src/app/api/cron/daily/route.ts) — Vercel
// Cron invocations carry no user session, so the normal session check doesn't apply here.
const BEARER_AUTH_PATHS = ["/api/cron"];

// Deny-by-default for any non-admin role: list what sales CAN reach rather than
// enumerating admin-only paths, so a new route added later doesn't silently stay open
// to sales just because nobody remembered to add it to a blocklist.
const SALES_ALLOWED = [
  "/dashboard/weekly",
  "/api/dashboard/weekly-by-line",
  "/login",
  "/territories/rules",
  "/territories/trends",
];
// "/territories" (the map) must match ONLY exactly -- it's a textual prefix of
// "/territories/settlements" (admin-only), so it can't go through the prefix-matching
// list above without also opening settlements via pathname.startsWith(p + "/").
const SALES_ALLOWED_EXACT = ["/territories"];

function isSalesAllowed(pathname: string): boolean {
  if (SALES_ALLOWED_EXACT.includes(pathname)) return true;
  return SALES_ALLOWED.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(request: NextRequest) {
  if (BEARER_AUTH_PATHS.some((p) => request.nextUrl.pathname.startsWith(p))) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!user && !isPublic) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && request.nextUrl.pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (user) {
    const role = await fetchRole(supabase, user.id);
    if (role !== "admin" && !isSalesAllowed(request.nextUrl.pathname)) {
      if (request.nextUrl.pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/dashboard/weekly", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
