import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    optimizePackageImports: ["@mantine/core", "@mantine/hooks"],
  },
  serverExternalPackages: ["socket.io"],
  allowedDevOrigins: ["192.168.31.113", "localhost"],
};

export default nextConfig;
