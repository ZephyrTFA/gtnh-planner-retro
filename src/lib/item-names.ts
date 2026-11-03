import { create } from "zustand";
import { createBrowserDatasetSource } from "@/lib/dataset-engine/browser-source";
import type { DatasetVersion } from "@/lib/datasets/types";
import { setResourceDisplayNames } from "@/lib/model/resources";

/**
 * Item and fluid names in the game's own translations, as a browser setting
 * (the Settings dialog's "Item names"). The rest of the app stays English.
 *
 * Names come from a locale export of the same pack
 * (tools/dataset-pipeline/scripts/run-locale-names-in-docker.sh), one file per
 * dataset and language, holding only the names that differ from English. They
 * are a display overlay (`resourceDisplayLabel`): plans keep English names, so a
 * shared plan reads the same for everyone and switching back loses nothing.
 */

export type ItemLanguage = "en_US" | "ru_RU" | "zh_CN";

export const ITEM_LANGUAGES: ReadonlyArray<{ id: ItemLanguage; label: string }> = [
  { id: "en_US", label: "English" },
  { id: "ru_RU", label: "Русский" },
  { id: "zh_CN", label: "中文" },
];

export const ITEM_LANGUAGE_STORAGE_KEY = "gtnh-item-language";

function isItemLanguage(value: unknown): value is ItemLanguage {
  return ITEM_LANGUAGES.some((option) => option.id === value);
}

export function getStoredItemLanguage(): ItemLanguage {
  if (typeof window === "undefined") return "en_US";
  try {
    const stored = window.localStorage.getItem(ITEM_LANGUAGE_STORAGE_KEY);
    return isItemLanguage(stored) ? stored : "en_US";
  } catch {
    return "en_US";
  }
}

interface ItemNamesState {
  language: ItemLanguage;
  /** Bumped whenever the names in use change; components showing names subscribe to it. */
  version: number;
  /** Which dataset and language the loaded names belong to. */
  loadedKey?: string;
  setLanguage: (language: ItemLanguage) => void;
}

export const useItemNames = create<ItemNamesState>((set) => ({
  language: getStoredItemLanguage(),
  version: 0,
  setLanguage: (language) => {
    try {
      if (language === "en_US") window.localStorage.removeItem(ITEM_LANGUAGE_STORAGE_KEY);
      else window.localStorage.setItem(ITEM_LANGUAGE_STORAGE_KEY, language);
    } catch {
      // A browser without storage still switches for this visit.
    }
    set({ language });
  },
}));

/** Subscribe a component to name changes: it re-renders when the language or dataset's names change. */
export function useItemNamesVersion(): number {
  return useItemNames((state) => state.version);
}

function showNames(names: ReadonlyMap<string, string> | undefined, loadedKey: string | undefined) {
  setResourceDisplayNames(names);
  useItemNames.setState((state) => ({ loadedKey, version: state.version + 1 }));
}

let pending: string | undefined;

/**
 * Puts the names for `version` in `language` in use, or English where that
 * dataset has no such file. A newer call overtakes a slower older one.
 */
export async function loadItemNames(version: DatasetVersion | undefined, language: ItemLanguage): Promise<void> {
  const key = version ? `${version.id}:${language}` : undefined;
  if (key === useItemNames.getState().loadedKey) return;
  pending = key;
  if (!version || language === "en_US" || !version.locales?.includes(language)) {
    showNames(undefined, key);
    return;
  }
  try {
    const source = createBrowserDatasetSource(window.location.origin);
    const file = await source.readGzipJson<{ names: Record<string, string> }>(
      `/datasets/gtnh/${version.id}/locales/${language}.json.gz`,
    );
    if (pending !== key) return;
    showNames(new Map(Object.entries(file.names)), key);
  } catch {
    // Names are a nicety: on a failed fetch the planner stays in English.
    if (pending === key) showNames(undefined, key);
  }
}
