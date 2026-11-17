import { notFound } from "next/navigation";

import { acknowledgeTaskByToken } from "@/lib/task-engine";

export default async function AcknowledgePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ok = await acknowledgeTaskByToken(token);

  if (!ok) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-3xl font-semibold text-brand-forest">Acknowledged</h1>
      <p className="mt-3 text-brand-forest/85">Your assignment has been acknowledged successfully.</p>
    </main>
  );
}
