import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  // Do not fail build on ESLint errors during hackathon dev
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Do not fail build on TypeScript errors during hackathon dev
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
