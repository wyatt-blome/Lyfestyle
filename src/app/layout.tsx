import type { Metadata, Viewport } from "next";
import { SerwistProvider } from "@serwist/turbopack/react";
import { THEME_BOOT } from "@/lib/themeBoot";
import { Providers } from "@/ui/Providers";
import { TabBar } from "@/ui/TabBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fast & Move",
  description: "Fasting, food timing and a no-decisions workout plan.",
  applicationName: "Fast & Move",
  appleWebApp: { capable: true, title: "Fast & Move", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192" }],
    apple: "/icons/apple-touch-icon.png",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0b0f0e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The boot script may set data-theme before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV === "development"}>
          <Providers>
            {children}
            <TabBar />
          </Providers>
        </SerwistProvider>
      </body>
    </html>
  );
}
