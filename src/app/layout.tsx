import type { Metadata } from "next";
import "./globals.css";

import { AppShell } from "@/components/app-shell";
import { PWARegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: "Conference Management PWA",
  description: "Operational platform for Christian conference teams.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <PWARegister />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
