import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GTNH Planner Retro",
    short_name: "GTNH Planner Retro",
    description:
      "Factory planner and recipe calculator for GregTech: New Horizons.",
    start_url: "/",
    display: "standalone",
    background_color: "#1b1d21",
    theme_color: "#1b1d21",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
