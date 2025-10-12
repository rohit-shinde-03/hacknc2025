import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  // Silence workspace root inference warning and point tracing to project root
  outputFileTracingRoot: "/Users/joshchen/Desktop/comp_projects/hacknc2025/hacknc2025",
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
