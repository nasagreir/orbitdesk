import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
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
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OrbitDesk",
  },
  formatDetection: {
    telephone: false,
  },
};

/** Cover Duo outer side-controls + notch; fluid CSS px across 382–951. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#071018" },
    { color: "#071018" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${spaceSans.variable} ${plexMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Static so Lightning CSS does not strip Duo fold media features */}
        <link rel="stylesheet" href="/duo-fold.css" />
      </head>
      <body className="flex min-h-dvh flex-col bg-background text-foreground">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
