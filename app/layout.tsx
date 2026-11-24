import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/ServiceWorker";
import "@fontsource-variable/familjen-grotesk";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "./globals.css";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const SITE = "https://tuffjocke.github.io/openhood";
const TITLE = "Openhood: the free car fault reader";
const DESCRIPTION =
  "Engine light on? Find out why. Read your car\u2019s fault codes in plain words with a cheap adapter and your browser. Free and open source.";

/**
 * The site only ever loads its own files. Inline scripts and styles are allowed because the
 * static export needs them. Only set in production: the dev server needs eval.
 */
const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE,
    siteName: "Openhood",
    type: "website",
    // Bump ?v= when og.png changes: Facebook and others cache the image by its URL.
    images: [{ url: `${SITE}/og.png?v=2`, width: 1200, height: 630, alt: "Openhood reading a car: live dials and charts, fault codes in plain words" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [`${SITE}/og.png?v=2`] },
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
    { media: "(prefers-color-scheme: light)", color: "#eef1ee" },
    { media: "(prefers-color-scheme: dark)", color: "#151a1c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>{process.env.NODE_ENV === "production" && <meta httpEquiv="Content-Security-Policy" content={CSP} />}</head>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
