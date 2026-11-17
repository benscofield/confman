import { AccountManager } from "@/components/account-manager";

export default function AccountPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-brand-forest">Organization Account</h1>
      <p className="mt-2 text-brand-forest/80">
        Manage reusable people and templates at the organization level.
      </p>

      <AccountManager />
    </main>
  );
}
