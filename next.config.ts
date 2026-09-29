import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep starting the local preview from creating unrelated root documents.
  agentRules: false,
};

export default nextConfig;
