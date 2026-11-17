"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { conferenceCookieName } from "@/lib/auth-cookies";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setIsSigningIn(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        throw new Error(error.message);
      }

      document.cookie = `${conferenceCookieName}=; Path=/; Max-Age=0; SameSite=Lax`;
      router.push("/conferences");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-12">
      <section className="w-full rounded-[2rem] border border-brand-slate/25 bg-white/90 p-8 shadow-[0_24px_80px_rgba(64,78,59,0.12)]">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.28em] text-brand-slate">Login</p>
          <h1 className="text-3xl font-semibold text-brand-forest">Sign in to continue</h1>
          <p className="max-w-xl text-brand-forest/80">
            Use the admin email and password you created during onboarding.
          </p>
        </div>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-brand-forest">Email</span>
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none transition placeholder:text-brand-slate/60 focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
              placeholder="admin@ministry.org"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-brand-forest">Password</span>
            <input
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none transition placeholder:text-brand-slate/60 focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
              placeholder="Enter the admin password"
            />
          </label>

          {errorMessage ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p>
          ) : null}

          <Button type="submit" className="w-full" disabled={isSigningIn}>
            {isSigningIn ? "Signing in..." : "Sign in"}
          </Button>

          <p className="text-center text-sm text-brand-forest/75">
            Need to create a ministry account?{" "}
            <Link href="/setup" className="font-semibold text-brand-forest underline decoration-brand-sage underline-offset-4">
              Start setup
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}