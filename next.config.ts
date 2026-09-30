import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Car and background photos are sent as data URLs (up to a few MB).
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
