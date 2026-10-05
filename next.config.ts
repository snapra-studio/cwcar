import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The customer page is the home page ("/") and the admin area lives under
  // /admin. Old addresses (shared links, bookmarks) keep working.
  async redirects() {
    return [
      { source: "/availability", destination: "/", permanent: true },
      { source: "/dashboard", destination: "/admin/dashboard", permanent: true },
      { source: "/dashboard/:path*", destination: "/admin/dashboard/:path*", permanent: true },
      { source: "/login", destination: "/admin/login", permanent: true },
    ];
  },
  experimental: {
    serverActions: {
      // Car and background photos are sent as data URLs (up to a few MB).
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
