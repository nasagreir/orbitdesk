import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-heading",
  subsets: ["latin"],
});

const spaceSans = Space_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "OrbitDesk · Starlink Ops",
  description:
    "Monitor and manage Starlink dishes with Home Assistant and Grok.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${spaceSans.variable} ${plexMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#071018] text-slate-100">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
