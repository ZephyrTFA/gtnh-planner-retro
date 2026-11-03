"use client";

import { Gauge, Sprout, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { useFactoryStore } from "@/store/factory-store";

/**
 * Spawners for the three non-recipe cards, at the top of the items column: a
 * generator (the power catalog), a custom rate node and a crop farm. Styled
 * quietly like the column's own keys (no plate, uncoloured icons). `leading`
 * is the column's fold-away key, placed at the row's start.
 */
export function SpawnKeys({ leading }: { leading?: ReactNode }) {
  const t = useT();
  const isReadOnly = useFactoryStore((state) => state.isReadOnly);
  const openPowerMenu = useFactoryStore((state) => state.openPowerMenu);
  const addCustomRateNode = useFactoryStore((state) => state.addCustomRateNode);
  const addCropFarmNode = useFactoryStore((state) => state.addCropFarmNode);
  // The columns' own hide keys' dress (the right column's "Hide" key): no
  // ground of their own, the column's border, a plain lift on hover - keys that act,
  // a step apart from the filter chips under them, which only narrow.
  const key =
    "flex h-7 min-w-0 flex-auto items-center justify-center gap-1 whitespace-nowrap rounded border border-neutral-700 px-1 text-[12px]! leading-3 font-medium text-neutral-300 hover:border-neutral-500 hover:text-neutral-100";
  if (isReadOnly) return <div className="mx-2 mt-2 flex shrink-0 gap-1">{leading}</div>;
  return (
    <div className="mx-2 mt-2 flex shrink-0 gap-1">
      {leading}
      <button
        type="button"
        onClick={openPowerMenu}
        className={key}
        title={t("Place a generator")}
        aria-label={t("Place a generator")}
      >
        <Zap className="h-3 w-3 shrink-0" />
        {t("Power")}
      </button>
      <button
        type="button"
        onClick={addCustomRateNode}
        className={key}
        title={t("Add custom rate node")}
        aria-label={t("Add custom rate node")}
      >
        <Gauge className="h-3 w-3 shrink-0" />
        {t("Custom")}
      </button>
      <button
        type="button"
        onClick={addCropFarmNode}
        className={key}
        title={t("Add crop farm")}
        aria-label={t("Add crop farm")}
      >
        <Sprout className="h-3 w-3 shrink-0" />
        {t("Farm")}
      </button>
    </div>
  );
}
