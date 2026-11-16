import { NextResponse, type NextRequest } from "next/server";
import { PUBLIC_PATHS, SESSION_COOKIE } from "@/lib/auth";

/**
 * Sends signed-out visitors to sign up / log in before they open an app screen.
 * This only checks that a session cookie exists; the backend checks that it's valid on every request.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname) || request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  // No cookie at all usually means a first visit (sessions last 30 days), so offer sign-up; it links to log in.
  const url = request.nextUrl.clone();
  url.pathname = "/signup";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/upload",
    "/library",
    "/study/:path*",
    "/listen/:path*",
    "/practice/:path*",
    "/flashcards",
    "/progress",
    "/projects/:path*",
  ],
};
