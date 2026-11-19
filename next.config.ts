import type { NextConfig } from "next";

// Static export so the app can be hosted on GitHub Pages.
// BASE_PATH is set by the Pages workflow ("/openhood"); empty when running locally.
const nextConfig: NextConfig = {
  output: "export",
  basePath: process.env.BASE_PATH || "",
  trailingSlash: true,
};

export default nextConfig;
