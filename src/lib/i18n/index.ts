import { create } from "zustand";

/**
 * The planner's interface language. Keys are the English text itself, so a
 * string missing from a catalog shows in English rather than as a key, and
 * the source reads as it always did.
 *
 * - `t("Inputs")`, `t("{count} machines", { count })`: one form.
 * - `tPlural(n, "{count} recipe", "{count} recipes", { count: n })`: plural
 *   forms; a catalog gives one string per CLDR category of its language
 *   (Russian one/few/many/other, Chinese other).
 * - `msg("Any")` marks text kept in a constant; `td(text)` shows it translated.
 * - Components call `useT()` so they repaint when the language arrives. Text
 *   built in useMemo/useCallback lists the language as a dependency.
 *
 * Keys must be string literals (i18n-catalogs.test.ts reads them out of the
 * source to check both catalogs cover every one). Data never goes through
 * here: plans, ids, machine and recipe-map names stay English.
 *
 * The page is prerendered in English, so the first render is English (it
 * must match the HTML); FactoryPlannerApp switches to the saved language in a
 * layout effect, before the first paint (`applyLanguage` in ./apply.ts). A
 * `?lang=` in the address wins over the saved language for that page.
 * Choosing another language in Settings saves it and reloads the page.
 */

export type Language = "en_US" | "ru_RU" | "zh_CN";

export const LANGUAGES: ReadonlyArray<{ id: Language; label: string }> = [
  { id: "en_US", label: "English" },
  { id: "ru_RU", label: "Русский" },
  { id: "zh_CN", label: "中文" },
];

export const LANGUAGE_STORAGE_KEY = "gtnh-item-language";

/** English text -> translation, or plural forms by CLDR category. */
export type Catalog = Record<string, string | Partial<Record<Intl.LDMLPluralRule, string>>>;

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((option) => option.id === value);
}

export function getStoredLanguage(): Language {
  if (typeof window === "undefined") return "en_US";
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : "en_US";
  } catch {
    return "en_US";
  }
}

/**
 * `?lang=zh_cn` picks the language for this page without saving it, so a link
 * can open the planner in a language and a reload keeps it. Choosing a
 * language in Settings saves it and drops the parameter (./apply.ts).
 */
export const LANGUAGE_URL_PARAM = "lang";

/**
 * A language written the way people write it: any case, `_` or `-`, or just
 * the language (`zh_cn`, `zh-CN`, `ru`, `en`). Undefined for anything else.
 */
export function parseLanguage(value: string | null | undefined): Language | undefined {
  const wanted = value?.trim().toLowerCase().replace(/-/g, "_");
  if (!wanted) return undefined;
  return LANGUAGES.find(
    (option) => option.id.toLowerCase() === wanted || option.id.slice(0, 2) === wanted,
  )?.id;
}

/** The language the address asks for, if it names one the planner has. */
export function getUrlLanguage(): Language | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return parseLanguage(new URLSearchParams(window.location.search).get(LANGUAGE_URL_PARAM));
  } catch {
    return undefined;
  }
}

/** The language this page shows: the address's `?lang=`, else the saved choice. */
export function getActiveLanguage(): Language {
  return getUrlLanguage() ?? getStoredLanguage();
}

interface LanguageState {
  /** The language the interface is showing now (English until the catalog arrives). */
  language: Language;
}

export const useLanguage = create<LanguageState>(() => ({ language: "en_US" }));

let catalog: Catalog | undefined;
let pluralRules: Intl.PluralRules | undefined;

/**
 * Puts a loaded catalog in use (./apply.ts loads it). Kept apart from the
 * loader so code bundled into web workers can import t()/msg() without the
 * catalogs; workers only ever speak English (they render nothing).
 */
export function setCatalog(language: Language, next: Catalog | undefined): void {
  catalog = next;
  pluralRules = next ? new Intl.PluralRules(language.replace("_", "-")) : undefined;
  useLanguage.setState({ language });
}

function fill(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/** `english` in the interface language, with `{name}` placeholders filled from `vars`. */
export function t(english: string, vars?: Record<string, string | number>): string {
  const entry = catalog?.[english];
  return fill(typeof entry === "string" ? entry : english, vars);
}

/**
 * Marks interface text defined away from where it is shown (an option list, a
 * machine-table note): returns it unchanged, so the catalog test can collect
 * it. Show it with `td(text)`.
 */
export function msg(english: string): string {
  return english;
}

/** Translates text that was marked with `msg()` where it was defined. */
export function td(english: string, vars?: Record<string, string | number>): string {
  return t(english, vars);
}

/**
 * A count-dependent phrase. English picks `one` for 1 and `other` otherwise;
 * a catalog keyed `"<one>|<other>"` gives its language's own forms.
 */
export function tPlural(
  count: number,
  one: string,
  other: string,
  vars?: Record<string, string | number>,
): string {
  const entry = catalog?.[`${one}|${other}`];
  if (entry && typeof entry === "object" && pluralRules) {
    const form = entry[pluralRules.select(count)] ?? entry.other;
    if (form) return fill(form, vars);
  }
  return fill(count === 1 ? one : other, vars);
}

/** The translator, for a component: it re-renders when the language changes. */
export function useT(): typeof t {
  useLanguage((state) => state.language);
  return t;
}
