import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

/**
 * A fully static site: `next build` writes out/, which any static host serves
 * as it is. There is no server, so no rewrites or headers here (public/_headers
 * and tools/security-headers.mjs carry the host's headers); recipe search
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
  // `next dev` would otherwise append its own block to AGENTS.md on every run;
  // the project's agent notes are hand-written.
  agentRules: false,
};

export default function config(phase: string): NextConfig {
  // A release names its own address (canonical links, the sitemap, shared
  // links). Without one it would publish localhost; .env.production sets it.
  if (phase === PHASE_PRODUCTION_BUILD && !process.env.NEXT_PUBLIC_SITE_URL?.trim()) {
    throw new Error("NEXT_PUBLIC_SITE_URL must be set for a production build (see .env.production).");
  }
  return nextConfig;
}
