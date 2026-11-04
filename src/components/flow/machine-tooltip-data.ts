import type { FactoryNode, MachineHandler, NodeThroughputResult, Recipe } from "@/lib/model/types";
import { applyMachineHandlerToRecipe, getRecipeMachineConfigTierControls, type MachineConfigTierControl } from "@/lib/model/recipe-rules";
import { formatCompact } from "@/lib/model";
import { getOverclockedRecipeStats } from "@/lib/solver/overclock";
import { getNodePowerReport, getNodeSteamReport, hasPowerReport, describePowerStall, describeSteamGate } from "@/lib/solver/power-report";
import { getMachineParallelMultiplier } from "@/lib/solver/machine-effects";
import { isMultiblockRecipe } from "@/lib/solver/power";
import { getMachineBehaviour, getMachineTableControls } from "@/lib/machines/machine-table";
import { t, td } from "@/lib/i18n";
import type { RecipeTooltipView, TooltipMode } from "./recipe-tooltip-data";

const number = (value: number) => value > 0 && value < 0.001 ? "<0.001" : value.toLocaleString(undefined, { maximumFractionDigits: 3 });

/**
 * `addon` names the mod an addon machine comes from (machineAddon). Without a
 * curated machine-table entry its speed, power and parallels are only what its
 * tooltip claims, so the hover says so.
 */
export function buildMachineTooltip(recipe: Recipe, handler: MachineHandler, node: FactoryNode, mode: TooltipMode, result?: NodeThroughputResult, title?: string, addon?: string): RecipeTooltipView {
  const selectedNode = { ...node, machineHandlerId: handler.id };
  const effective = applyMachineHandlerToRecipe(recipe, selectedNode);
  const stats = getOverclockedRecipeStats(recipe, selectedNode);
  const steam = getNodeSteamReport(recipe, selectedNode);
  const power = !steam && hasPowerReport(effective) ? getNodePowerReport(recipe, selectedNode) : undefined;
  const parallels = power?.parallels ?? getMachineParallelMultiplier(effective, selectedNode);
  const count = mode === "build" ? node.machineCount : node.solvePin ?? result?.theoreticalMachinesRequired;
  const rows = [
    { label: mode === "build" ? t("Installed machines") : node.solvePin ? t("Pinned machines") : t("Required machines"), value: count === undefined ? t("Unavailable") : number(count) },
    ...(power ? [{ label: t("Configured tier"), value: stats.tier }] : []),
    { label: t("Time per operation"), value: stats.durationTicks > 0 ? `${number(stats.durationTicks / 20)} s` : t("Instant") },
    ...(steam ? [{ label: t("Steam per machine"), value: `${formatCompact(steam.drawSteamPerTick * 20)} L/s` }]
      : power ? [{ label: t("Draw per machine"), value: `${formatCompact(power.drawEuT)} EU/t` }] : []),
    ...(parallels > 1 ? [{ label: t("Parallel operations"), value: number(parallels) }] : []),
  ];
  const curated = getMachineBehaviour(effective.machineType);
  const unchecked = addon && !curated;
  return {
    title: title ?? handler.label, subtitle: isMultiblockRecipe(effective) ? t("Multiblock") : t("Machine"), mode, rows,
    ...(unchecked ? {
      status: { label: t("Unchecked"), tone: "warning" as const },
      bullets: [t("From {addon}.", { addon }), t("Speed, power and parallels are read from its tooltip, not checked against the mod.")],
    } : {}),
    requirement: curated?.note ? td(curated.note) : undefined,
    reason: power && power.state !== "ok" ? describePowerStall(power) : steam ? describeSteamGate(steam) : undefined,
  };
}

/** Show effective configuration values, never tooltip-scraped effect claims. */
export function buildConfigTooltip(recipe: Recipe, node: FactoryNode, control: MachineConfigTierControl): RecipeTooltipView {
  const effective = applyMachineHandlerToRecipe(recipe, node);
  const stats = getOverclockedRecipeStats(recipe, node);
  const steam = getNodeSteamReport(recipe, node);
  const power = !steam && hasPowerReport(effective) ? getNodePowerReport(recipe, node) : undefined;
  const selected = getRecipeMachineConfigTierControls(effective, node).find(c => c.id === control.id) ?? control;
  // Only curated control notes: arbitrary scraped tooltips can claim effects
  // the machine never receives. These explain source/glass requirements too.
  const curatedControl = getMachineTableControls(effective.machineType).find(c => c.id === control.id);
  // A typed number never matches a listed rung; its one rung carries the help.
  const curatedOption = curatedControl?.tiers.find(tier => tier.key === selected.current.key)
    ?? (control.numeric ? curatedControl?.tiers[0] : undefined);
  return {
    title: td(control.label), subtitle: td(selected.current.label),
    bullets: curatedOption?.resource.tooltip?.map((line) => td(line)),
    rows: [
      ...(control.numeric ? [{ label: t("Range"), value: control.numeric.max === undefined
        ? t("{min} or more", { min: control.numeric.min }) : t("{min} to {max}", { min: control.numeric.min, max: control.numeric.max }) }] : []),
      { label: t("Time per operation"), value: stats.durationTicks > 0 ? `${number(stats.durationTicks / 20)} s` : t("Instant") },
      ...(steam ? [{ label: t("Steam per machine"), value: `${formatCompact(steam.drawSteamPerTick * 20)} L/s` }]
        : power ? [{ label: t("Draw per machine"), value: `${formatCompact(power.drawEuT)} EU/t` }] : []),
      { label: t("Parallel operations"), value: number(power?.parallels ?? getMachineParallelMultiplier(effective, node)) },
    ],
    reason: power && power.state !== "ok" ? describePowerStall(power) : steam ? describeSteamGate(steam) : undefined,
    actions: control.numeric ? [{ gesture: "left", label: t("Type a value") }, { gesture: "wheel", label: t("Step") }]
      : control.tiers.length > 1 ? [{ gesture: "left", label: t("Change setting") }] : [],
  };
}
