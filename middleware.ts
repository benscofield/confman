import { NextRequest, NextResponse } from "next/server";

import { getAccessTokenFromCookies, getSelectedConferenceIdFromCookies } from "@/lib/auth-cookies";

const REDIRECT_IF_AUTHENTICATED = new Set(["/login", "/setup"]);
const REQUIRES_CONFERENCE_PREFIXES = ["/dashboard", "/tasks", "/preachers", "/calendar", "/musicians", "/bookstore", "/volunteers"];
const AUTH_REQUIRED_PREFIXES = ["/account", "/conferences", ...REQUIRES_CONFERENCE_PREFIXES];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isJwtExpired(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return true;
  }

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    if (typeof payload.exp !== "number") {
      return false;
    }

    return payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

function hasSupabaseSession(request: NextRequest): boolean {
  const token = getAccessTokenFromCookies(request.cookies.getAll());
  if (!token) {
    return false;
  }

  return !isJwtExpired(token);
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname.replace(/\/$/, "") || "/";
  const loggedIn = hasSupabaseSession(request);

  if (REDIRECT_IF_AUTHENTICATED.has(pathname) && loggedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/conferences";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (matchesPrefix(pathname, AUTH_REQUIRED_PREFIXES) && !loggedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (!matchesPrefix(pathname, REQUIRES_CONFERENCE_PREFIXES)) {
    return NextResponse.next();
  }

  if (getSelectedConferenceIdFromCookies(request.cookies.getAll())) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/conferences";
  url.search = "";

  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/setup",
    "/conferences/:path*",
    "/account/:path*",
    "/dashboard/:path*",
    "/tasks/:path*",
    "/preachers/:path*",
    "/calendar/:path*",
    "/musicians/:path*",
    "/bookstore/:path*",
    "/volunteers/:path*",
  ],
};