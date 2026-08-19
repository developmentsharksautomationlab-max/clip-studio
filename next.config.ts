import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A lockfile one directory up (outside this project) otherwise makes
  // Turbopack misdetect the workspace root.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
