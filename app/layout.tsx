import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Openhood",
  description: "Browser-based diagnostics for K-line era cars. Live data, fault codes and drive logging with a cheap USB cable.",
  manifest: `${base}/manifest.webmanifest`,
  icons: {
    icon: [{ url: `${base}/favicon-32.png`, sizes: "32x32", type: "image/png" }],
    apple: `${base}/apple-touch-icon.png`,
  },
  appleWebApp: { capable: true, title: "Openhood", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eeece5" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0f0e" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
