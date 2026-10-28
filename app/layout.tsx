import type { Metadata } from "next";
import "./globals.css";
import EventLogClient from "@/components/EventLogClient";

export const metadata: Metadata = {
  title: "Atlas — Advertising Intelligence",
  description:
    "Atlas judges ad performance on cost per closed outcome and collected revenue, not platform vanity metrics.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-fg antialiased">
        <EventLogClient />
        {children}
      </body>
    </html>
  );
}
