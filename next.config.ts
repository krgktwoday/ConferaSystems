import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Explicitly set workspace root to avoid false Turbopack root detection
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
