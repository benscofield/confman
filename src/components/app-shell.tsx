"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { conferenceCookieName } from "@/lib/auth-cookies";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  matchPrefix?: boolean;
  children?: NavItem[];
};

const navItems: NavItem[] = [
  { href: "/conferences", label: "Conferences", matchPrefix: true },
  { href: "/dashboard", label: "Dashboard" },
  {
    href: "/preachers",
    label: "Preachers",
    matchPrefix: true,
    children: [{ href: "/preachers/assistants", label: "Assistans" }],
  },
  { href: "/calendar", label: "Conference Calendar", matchPrefix: true },
  { href: "/volunteers", label: "Volunteers" },
  { href: "/tasks", label: "Tasks", matchPrefix: true },
  { href: "/musicians", label: "Worship" },
  { href: "/bookstore", label: "Bookstore" },
];

const hiddenShellPrefixes = ["/login", "/setup"];
const conferenceScopedPrefixes = ["/conferences", "/dashboard", "/tasks", "/preachers", "/calendar", "/musicians", "/bookstore", "/volunteers"];

type SelectedConference = {
  name: string;
  startDate: string;
  endDate: string;
  city: string | null;
  locationName: string | null;
};

function formatDateRange(startDate: string, endDate: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${formatter.format(new Date(startDate))} - ${formatter.format(new Date(endDate))}`;
}

function isCurrentPath(pathname: string, item: NavItem) {
  if (item.href === "/") {
    return pathname === "/";
  }

  if (item.matchPrefix) {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  return pathname === item.href;
}

function Navigation({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="space-y-2">
      {navItems.map((item) => {
        const active = isCurrentPath(pathname, item);
        const showChildren = active && Boolean(item.children?.length);

        return (
          <div key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "block rounded-xl px-4 py-3 text-sm font-medium transition",
                active
                  ? "bg-brand-sage/45 text-brand-forest"
                  : "text-brand-forest/80 hover:bg-brand-sage/30 hover:text-brand-forest",
              )}
            >
              {item.label}
            </Link>
            {showChildren ? (
              <div className="mt-1 space-y-1 pl-4">
                {item.children?.map((child) => {
                  const childActive = isCurrentPath(pathname, child);

                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={onNavigate}
                      className={cn(
                        "block rounded-lg px-3 py-2 text-sm transition",
                        childActive
                          ? "bg-brand-sage/35 font-medium text-brand-forest"
                          : "text-brand-forest/75 hover:bg-brand-sage/20 hover:text-brand-forest",
                      )}
                    >
                      {child.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [selectedConference, setSelectedConference] = useState<SelectedConference | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();

    let mounted = true;

    const syncSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted || error) {
        return;
      }

      setIsAuthenticated(Boolean(data.session));
    };

    void syncSession();

    const { data: authSubscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) {
        return;
      }

      setIsAuthenticated(Boolean(session));
    });

    return () => {
      mounted = false;
      authSubscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isAuthenticated) {
      setSelectedConference(null);
      return;
    }

    let mounted = true;

    const loadSelectedConference = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;

        const response = await fetch("/api/conferences", {
          cache: "no-store",
          headers: accessToken
            ? {
                Authorization: `Bearer ${accessToken}`,
              }
            : undefined,
        });
        if (!mounted || !response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          selectedConferenceId?: string | null;
          items?: Array<{
            id: string;
            name: string;
            start_date: string;
            end_date: string;
            city: string | null;
            location_name: string | null;
          }>;
        };

        const selectedId = payload.selectedConferenceId ?? null;
        const selected = payload.items?.find((item) => item.id === selectedId) ?? null;
        setSelectedConference(
          selected
            ? {
                name: selected.name,
                startDate: selected.start_date,
                endDate: selected.end_date,
                city: selected.city,
                locationName: selected.location_name,
              }
            : null,
        );
      } catch {
        if (mounted) {
          setSelectedConference(null);
        }
      }
    };

    void loadSelectedConference();

    return () => {
      mounted = false;
    };
  }, [isAuthenticated, pathname]);

  const currentPathname = useMemo(() => pathname ?? "/", [pathname]);
  const hideShellForRoute = useMemo(
    () => hiddenShellPrefixes.some((prefix) => currentPathname === prefix || currentPathname.startsWith(`${prefix}/`)),
    [currentPathname],
  );
  const showConferenceBanner = useMemo(
    () => conferenceScopedPrefixes.some((prefix) => currentPathname === prefix || currentPathname.startsWith(`${prefix}/`)),
    [currentPathname],
  );

  const handleLogout = async () => {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    document.cookie = `${conferenceCookieName}=; Path=/; Max-Age=0; SameSite=Lax`;
    setMobileMenuOpen(false);
    router.push("/login");
    router.refresh();
  };

  if (hideShellForRoute || !isAuthenticated) {
    return <div>{children}</div>;
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[16.5rem_minmax(0,1fr)]">
      <aside className="hidden border-r border-brand-sage/45 bg-white/70 p-5 backdrop-blur-sm md:sticky md:top-0 md:block md:h-screen">
        <div className="mb-6 rounded-2xl border border-brand-sage/50 bg-white/80 p-4">
          <p className="text-xs uppercase tracking-[0.26em] text-brand-slate">ConfMan</p>
          <p className="mt-2 text-xl font-semibold text-brand-forest">Control Center</p>
        </div>
        <Navigation pathname={currentPathname} />
        <div className="mt-6 border-t border-brand-sage/45 pt-4">
          <Button asChild variant="ghost" className="mb-2 w-full justify-start rounded-xl px-4">
            <Link href="/account">Account</Link>
          </Button>
          <Button variant="ghost" className="w-full justify-start rounded-xl px-4" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 border-b border-brand-sage/45 bg-white/85 px-4 py-3 backdrop-blur-sm md:hidden">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-brand-slate">ConfMan</p>
              <p className="text-lg font-semibold text-brand-forest">Navigation</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setMobileMenuOpen((current) => !current)}>
              {mobileMenuOpen ? "Close" : "Menu"}
            </Button>
          </div>
        </header>

        {mobileMenuOpen ? (
          <div className="fixed inset-0 z-50 bg-brand-forest/35 md:hidden" onClick={() => setMobileMenuOpen(false)}>
            <aside
              className="h-full w-72 max-w-[84vw] border-r border-brand-sage/45 bg-white p-5 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-5 flex items-center justify-between">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-brand-slate">Menu</p>
                <Button variant="ghost" size="sm" onClick={() => setMobileMenuOpen(false)}>
                  Close
                </Button>
              </div>
              <Navigation pathname={currentPathname} onNavigate={() => setMobileMenuOpen(false)} />
              <div className="mt-6 border-t border-brand-sage/45 pt-4">
                <Button asChild variant="ghost" className="mb-2 w-full justify-start rounded-xl px-4">
                  <Link href="/account" onClick={() => setMobileMenuOpen(false)}>
                    Account
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start rounded-xl px-4"
                  onClick={() => {
                    void handleLogout();
                  }}
                >
                  Logout
                </Button>
              </div>
            </aside>
          </div>
        ) : null}

        {showConferenceBanner ? (
          <div className="border-b border-brand-sage/45 bg-brand-mist/65 px-4 py-3">
            <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-sage/55 bg-white/75 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-brand-slate">Active conference</p>
                <p className="text-lg font-semibold text-brand-forest">
                  {selectedConference?.name ?? "No conference selected"}
                </p>
                {selectedConference ? (
                  <p className="mt-1 text-sm text-brand-forest/80">
                    {formatDateRange(selectedConference.startDate, selectedConference.endDate)} | {selectedConference.city ?? selectedConference.locationName ?? "City not set"}
                  </p>
                ) : null}
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/conferences">Switch conference</Link>
              </Button>
            </div>
          </div>
        ) : null}

        <div>{children}</div>
      </div>
    </div>
  );
}