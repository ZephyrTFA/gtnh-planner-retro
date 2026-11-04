import { LANGUAGE_STORAGE_KEY, LANGUAGE_URL_PARAM, setCatalog, type Catalog, type Language } from "./index";

/**
 * Loading and choosing the interface language. Only the app imports this
 * module, so the catalogs stay out of the web-worker bundles that import
 * `t()` (src/lib/i18n/index.ts).
 */

async function loadCatalog(language: Exclude<Language, "en_US">): Promise<Catalog> {
  switch (language) {
    case "ru_RU":
      return (await import("./ru_RU")).default;
    case "zh_CN":
      return (await import("./zh_CN")).default;
  }
}

/** Puts `language` in use once its catalog has loaded. */
export async function applyLanguage(language: Language): Promise<void> {
  setCatalog(language, language === "en_US" ? undefined : await loadCatalog(language));
}

/**
 * Saves a new interface language and reloads, so every cached string is
 * rebuilt. The reload drops `?lang=`, which would otherwise win over the
 * language just chosen.
 */
export function chooseLanguage(language: Language): void {
  const url = new URL(window.location.href);
  const hadParam = url.searchParams.has(LANGUAGE_URL_PARAM);
  url.searchParams.delete(LANGUAGE_URL_PARAM);
  try {
    if (language === "en_US") window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    else window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Without storage the choice cannot outlive the reload; apply it in place.
    if (hadParam) window.history.replaceState(null, "", url);
    void applyLanguage(language);
    return;
  }
  if (hadParam) window.location.replace(url);
  else window.location.reload();
}
