import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans"
});

export const metadata: Metadata = {
  title: "Invoice Tracker Pro",
  description:
    "A premium invoice command center for receivables, payables, alerts, and executive analytics."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={geist.variable} data-scroll-behavior="smooth">
      <body className="font-sans antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
