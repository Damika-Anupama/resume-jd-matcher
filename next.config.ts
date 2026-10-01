import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a standalone server bundle so the production Docker image stays minimal
  // (only the files needed to run are copied into the runner stage).
  output: "standalone",
};

export default nextConfig;
