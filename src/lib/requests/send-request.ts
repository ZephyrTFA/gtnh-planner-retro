import { REQUEST_API_PATH, type RequestResponse, type SiteRequest } from "./request-schema";

/**
 * The menu asks for the request dialog by event: the dialog lives in the
 * header, so the Help dropdown and the compact menu can close behind it
 * without unmounting it.
 */
export const OPEN_REQUEST_DIALOG_EVENT = "gtnh:open-request-dialog";

export function openRequestDialog(): void {
  window.dispatchEvent(new Event(OPEN_REQUEST_DIALOG_EVENT));
}

/** What the form tells the player: sent, or which kind of failure. */
export type SendOutcome = "sent" | "rate-limited" | "bot-check-failed" | "invalid" | "failed";

/** Posts the request to this site's Worker. Never throws. */
export async function sendRequest(request: SiteRequest, fetchImpl: typeof fetch = fetch): Promise<SendOutcome> {
  try {
    const response = await fetchImpl(REQUEST_API_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      credentials: "omit",
      cache: "no-store",
    });
    const answer = (await response.json().catch(() => undefined)) as RequestResponse | undefined;
    if (response.ok && answer?.ok) {
      return "sent";
    }
    if (response.status === 429) {
      return "rate-limited";
    }
    if (answer && !answer.ok && answer.error === "bot-check-failed") {
      return "bot-check-failed";
    }
    if (answer && !answer.ok && answer.error === "invalid") {
      return "invalid";
    }
    return "failed";
  } catch {
    return "failed";
  }
}
