import { t } from "@/lib/i18n";
import type { LibrarySyncStatus } from "./library-sync";

export function accountSaveStatus(
  signedIn: boolean,
  sync: LibrarySyncStatus,
): { text: string; error: boolean } {
  // Refused (too large, not valid, library full): nothing retries until the
  // design changes, and the tooltip carries the reason.
  if (sync.state === "error" && sync.refused) {
    return { text: t("Not saved to account"), error: true };
  }
  if (sync.state === "error" || (signedIn && sync.state === "off" && sync.message)) {
    return { text: t("Not saved to account — retrying"), error: true };
  }
  if (!signedIn) return { text: t("Saved on this device"), error: false };
  if (sync.state === "idle" && sync.lastSyncedAt) {
    return { text: t("Saved to account"), error: false };
  }
  return { text: t("Saving to account…"), error: false };
}
