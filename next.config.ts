import type { NextConfig } from "next";

/**
 * A fully static site: `next build` writes out/, which any static host serves
 * as it is. There is no server, so no rewrites or headers here; recipe search
 * runs in the browser's dataset worker over the dataset files in
 * public/datasets/gtnh (see src/lib/dataset-engine).
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: false,
  images: { unoptimized: true },
  outputFileTracingRoot: process.cwd(),
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
