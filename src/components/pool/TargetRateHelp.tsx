import { displayNameFor } from "@/lib/model/resources";
import type { FactoryProject, FactoryStorage, StorageThroughputResult } from "@/lib/model/types";
import { storageTargetMode, TARGET_MODE_LABELS } from "@/lib/model/storage-target";
import { formatPoolRate, isPoolDisplayZero } from "./worksheet-format";
import { td, useT } from "@/lib/i18n";

/** Explain the selected target using the current plan, without guessing a solver cause. */
export function TargetRateHelp({ storage, input, result, project }: {
  storage: FactoryStorage;
  input: boolean;
  result: StorageThroughputResult | undefined;
  project: FactoryProject;
}) {
  const t = useT();
  const mode = storageTargetMode(storage, input ? "source" : "product");
  const actual = input ? result?.consumedPerSecond : result?.producedPerSecond;
  const stopped = actual !== undefined && isPoolDisplayZero(actual);
  const hasRecipes = project.nodes.some(node => node.enabled);
  return <div className="pool-target-explanation">
    <strong className="pool-target-help-name">{displayNameFor(storage.resourceId, storage.displayName ?? storage.resourceId)}</strong>
    <div className="pool-target-help-rates">
      <span>{input ? t("Use {mode}", { mode: td(TARGET_MODE_LABELS[mode]).toLowerCase() }) : t("Make {mode}", { mode: td(TARGET_MODE_LABELS[mode]).toLowerCase() })} <strong className="pool-help-goal">{formatPoolRate(Math.abs(storage.targetPerSecond ?? 0), storage.kind)}</strong></span>
      <span>{input ? t("Currently using") : t("Currently making")} <strong className="pool-help-actual">{formatPoolRate(Math.abs(actual ?? 0), storage.kind)}</strong></span>
    </div>
    {stopped ? <p className="pool-help-actual"><strong>{t("No flow.")}</strong> {t("This target is stopped.")}</p> : null}
    {!hasRecipes ? <p>{input ? t("Add or enable recipes that use this item.") : t("Add or enable recipes that make this item.")}</p> : <p>{t("The solver could not identify which constraint blocks this rate.")}</p>}
  </div>;
}
