import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hokusan Insights",
  description: "Weekly pulse, outreach queue, and campaign briefs for Hokusan Tea Canada.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
