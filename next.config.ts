import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["file-type", "node:sqlite"],
};

export default nextConfig;
