import { SITE_URL } from "@/lib/site";
import { APP_VERSION } from "@/lib/version";

/**
 * The site as one page of markdown for language-model crawlers (the llms.txt
 * convention), which run no JavaScript and so see the planner as an empty
 * page. Written at build time: the site is static.
 */
export const dynamic = "force-static";

export function GET() {
  const base = SITE_URL;
  const lines = [
    "# GTNH Planner Retro",
    "",
    "> Free browser-based factory planner and recipe calculator for GregTech: New Horizons (GTNH), the Minecraft expert modpack. Draw production chains on an interactive flowchart, balance machine ratios, compute EU/t power draw and throughput, and share plans as links. No account and no install needed.",
    "",
    "Key facts:",
    "",
    "- Carries full recipe data for GTNH 2.9, exported from the game itself, including multiblock machines, ore dictionary alternatives, and programmed circuit settings.",
    "- Models GregTech mechanics faithfully: voltage tiers and overclocking, parallel processing on multiblocks, heat bonuses on the Electric Blast Furnace family, machine-specific speed and power coefficients.",
    "- A solver computes steady-state flow for the whole factory at once: what every machine produces and consumes per second, where the bottleneck is, and how full each machine runs.",
    "- Plans export as shareable links, JSON, PNG, or GIF. Opening a shared link loads the full plan, editable, with nothing to sign up for.",
    "- The planner is a static, client-side application: recipe search runs in the browser.",
    `- Version ${APP_VERSION} as of this file.`,
    "",
    "## Start here",
    "",
    `- [The planner](${base}/): the app itself. Everything happens on one page.`,
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
