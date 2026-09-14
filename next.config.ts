import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root so Turbopack doesn't infer a parent dir
  // (a stray package-lock.json lives in the home directory).
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
