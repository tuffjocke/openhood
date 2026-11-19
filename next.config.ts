import type { NextConfig } from "next";

// Static export so the app can be hosted on GitHub Pages.
// BASE_PATH is set by the Pages workflow ("/openhood"); empty when running locally.
const basePath = process.env.BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  // Exposed to the browser for files Next doesn't prefix itself (service worker, manifest, icons).
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
