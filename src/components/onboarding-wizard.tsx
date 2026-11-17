"use client";

import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatPhoneInput } from "@/lib/phone-format";

type Step = 1 | 2;

type FormState = {
  churchName: string;
  churchAddress: string;
  churchPhone: string;
  churchEmail: string;
  adminName: string;
  adminEmail: string;
  adminPhone: string;
  adminPassword: string;
};

const initialState: FormState = {
  churchName: "",
  churchAddress: "",
  churchPhone: "",
  churchEmail: "",
  adminName: "",
  adminEmail: "",
  adminPhone: "",
  adminPassword: "",
};

const stepLabels: Record<Step, string> = {
  1: "Ministry details",
  2: "Admin user",
};

function Field({
  label,
  required = false,
  helperText,
  children,
}: {
  label: string;
  required?: boolean;
  helperText?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center gap-2 text-sm font-medium text-brand-forest">
        {label}
        {required ? <span className="text-xs uppercase tracking-[0.2em] text-brand-slate">Required</span> : null}
      </span>
      {children}
      {helperText ? <p className="text-xs leading-5 text-brand-forest/70">{helperText}</p> : null}
    </label>
  );
}

export function OnboardingWizard() {
  const [step, setStep] = useState<Step>(1);
  const [submitted, setSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialState);

  const updateField = (field: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const updatePhoneField = (field: "churchPhone" | "adminPhone") => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [field]: formatPhoneInput(event.target.value) }));
  };

  const requiredAdminHint = "Use a role-based address like admin@yourministry.org so the login can stay with the role.";

  const handleNext = () => {
    if (step === 2) {
      void handleSubmit();
      return;
    }

    const formElement = document.querySelector("form[data-onboarding-form='true']") as HTMLFormElement | null;
    if (formElement?.reportValidity()) {
      setStep((current) => (current + 1) as Step);
    }
  };

  const handleBack = () => {
    setStep((current) => (current > 1 ? ((current - 1) as Step) : current));
  };

  const handleSubmit = async () => {
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to complete setup.");
      }

      setSubmitted(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to complete setup.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-[2rem] border border-brand-slate/25 bg-white/85 shadow-[0_24px_80px_rgba(64,78,59,0.12)] backdrop-blur-sm">
      <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative overflow-hidden border-b border-brand-sage/40 bg-[linear-gradient(160deg,rgba(255,255,255,0.98),rgba(230,230,230,0.78))] p-8 lg:border-b-0 lg:border-r lg:p-10">
          <div className="absolute right-[-3rem] top-[-3rem] h-40 w-40 rounded-full bg-brand-sage/35 blur-3xl" />
          <div className="absolute bottom-[-2rem] left-[-2rem] h-32 w-32 rounded-full bg-brand-slate/20 blur-3xl" />

          <div className="relative space-y-6">
            <div className="inline-flex rounded-full border border-brand-sage/60 bg-white/80 px-4 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-brand-forest">
              Setup first
            </div>
            <div className="space-y-4">
              <p className="text-sm uppercase tracking-[0.28em] text-brand-slate">Conference Operations</p>
              <h1 className="max-w-xl text-4xl font-semibold leading-tight text-brand-forest lg:text-5xl">
                I want to get our ministry set up for conferences.
              </h1>
              <p className="max-w-xl text-base leading-7 text-brand-forest/80 lg:text-lg">
                Start with the ministry and create a durable admin login. You can add conference details after the
                account is ready, when the ministry is actually planning an event.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {Object.entries(stepLabels).map(([key, label]) => {
                const currentStep = Number(key) as Step;
                const active = step === currentStep;

                return (
                  <div
                    key={label}
                    className={`rounded-2xl border px-4 py-3 transition-colors ${
                      active
                        ? "border-brand-olive bg-brand-sage/30"
                        : "border-brand-sage/50 bg-white/70"
                    }`}
                  >
                    <p className="text-xs uppercase tracking-[0.24em] text-brand-slate">Step {key}</p>
                    <p className="mt-1 text-sm font-semibold text-brand-forest">{label}</p>
                  </div>
                );
              })}
            </div>

            <div className="rounded-2xl border border-brand-sage/60 bg-brand-mist/60 p-5 text-sm leading-6 text-brand-forest/85">
              This flow is set up to feel like a guided sign-up, but it stays practical for development: you can
              capture the core records in the right order without redoing setup every time.
            </div>
          </div>
        </div>

        <div className="p-8 lg:p-10">
          {submitted ? (
            <div className="flex h-full min-h-[32rem] flex-col justify-between rounded-[1.5rem] border border-brand-sage/50 bg-brand-mist/50 p-6">
              <div className="space-y-4">
                <p className="text-sm uppercase tracking-[0.25em] text-brand-slate">Setup complete</p>
                <h2 className="text-2xl font-semibold text-brand-forest">Your ministry and admin account were created.</h2>
                <p className="text-brand-forest/80">
                  Use the admin email and password you entered to sign in and keep going.
                </p>
              </div>

              <div className="mt-6 rounded-2xl border border-brand-sage/50 bg-white/80 p-4 text-sm text-brand-forest/85">
                <p className="font-semibold text-brand-forest">Created for this setup</p>
                <p className="mt-2">Ministry: {form.churchName}</p>
                <p>Admin: {form.adminName}</p>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Button asChild className="w-full" variant="default">
                  <Link href="/login">Go to login</Link>
                </Button>
                <Button className="w-full" variant="outline" onClick={() => setSubmitted(false)}>
                  Start over
                </Button>
              </div>
            </div>
          ) : (
            <form
              data-onboarding-form="true"
              className="space-y-6"
              onSubmit={(event) => {
                event.preventDefault();
                handleNext();
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-brand-slate">Step {step}</p>
                  <h2 className="text-2xl font-semibold text-brand-forest">{stepLabels[step]}</h2>
                </div>
                <div className="rounded-full border border-brand-sage/60 bg-brand-sage/20 px-4 py-2 text-sm font-medium text-brand-forest">
                  {step === 1 ? "Ministry first" : "Admin next"}
                </div>
              </div>

              {step === 1 ? (
                <div className="grid gap-4">
                  <Field label="Ministry name" required>
                    <input
                      required
                      value={form.churchName}
                      onChange={updateField("churchName")}
                      placeholder="Grace Fellowship Ministry"
                      className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none transition placeholder:text-brand-slate/60 focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                    />
                  </Field>
                  <Field label="Ministry address" required>
                    <input
                      required
                      value={form.churchAddress}
                      onChange={updateField("churchAddress")}
                      placeholder="123 Main Street, Springfield, IL"
                      className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none transition placeholder:text-brand-slate/60 focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Phone" required>
                      <input
                        required
                        value={form.churchPhone}
                        onChange={updatePhoneField("churchPhone")}
                        inputMode="numeric"
                        maxLength={14}
                        placeholder="(555) 555-0100"
                        className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none transition placeholder:text-brand-slate/60 focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                      />
                    </Field>
                    <Field label="Email" required>
                      <input
                        required
                        type="email"
                        value={form.churchEmail}
                        onChange={updateField("churchEmail")}
                        placeholder="hello@ministry.org"
                        className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none transition placeholder:text-brand-slate/60 focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                      />
                    </Field>
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="grid gap-4">
                  <Field label="Admin name" required>
                    <input
                      required
                      value={form.adminName}
                      onChange={updateField("adminName")}
                      placeholder="Conference Administrator"
                      className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none transition placeholder:text-brand-slate/60 focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                    />
                  </Field>
                  <Field label="Admin email" required helperText={requiredAdminHint}>
                    <input
                      required
                      type="email"
                      value={form.adminEmail}
                      onChange={updateField("adminEmail")}
                      placeholder="admin@ministry.org"
                      className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none transition placeholder:text-brand-slate/60 focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                    />
                  </Field>
                  <Field label="Admin phone" required>
                    <input
                      required
                      value={form.adminPhone}
                      onChange={updatePhoneField("adminPhone")}
                      inputMode="numeric"
                      maxLength={14}
                      placeholder="(555) 555-0101"
                      className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none transition placeholder:text-brand-slate/60 focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                    />
                  </Field>
                  <Field label="Admin password" required helperText="Choose a password the ministry can keep in its password manager.">
                    <input
                      required
                      type="password"
                      minLength={8}
                      value={form.adminPassword}
                      onChange={updateField("adminPassword")}
                      placeholder="Enter a strong password"
                      className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none transition placeholder:text-brand-slate/60 focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                    />
                  </Field>
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3 border-t border-brand-sage/40 pt-5">
                <Button type="button" variant="outline" onClick={handleBack} disabled={step === 1}>
                  Back
                </Button>
                <Button type="submit" className="min-w-32" disabled={isSaving}>
                  {isSaving ? "Creating..." : step === 2 ? "Create account" : "Continue"}
                </Button>
              </div>

              {errorMessage ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p>
              ) : null}
            </form>
          )}
        </div>
      </div>
    </section>
  );
}