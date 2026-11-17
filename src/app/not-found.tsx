export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-3xl font-semibold text-brand-forest">Link Unavailable</h1>
      <p className="mt-3 text-brand-forest/85">This acknowledgment link is invalid or already used.</p>
    </main>
  );
}
