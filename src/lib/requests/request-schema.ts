import { z } from "zod";

/**
 * A request sent from the site's "Send a request" form to the Worker in
 * `worker/request.ts`, which files it as a GitHub issue. One schema for both
 * ends: the form checks the same limits before sending, so a player sees the
 * problem at once instead of a refusal from the Worker.
 */

export const REQUEST_KINDS = ["bug", "feature", "recipe-data", "other"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

/** How each kind reads in the form and in the issue title. */
export const REQUEST_KIND_LABELS: Record<RequestKind, string> = {
  bug: "Bug",
  feature: "Feature",
  "recipe-data": "Recipe data",
  other: "Other",
};

export const TITLE_MIN = 3;
export const TITLE_MAX = 120;
export const DETAILS_MIN = 10;
export const DETAILS_MAX = 5000;
export const CONTACT_MAX = 200;
/** App and dataset version ids are short; anything longer is not one of ours. */
export const CONTEXT_FIELD_MAX = 100;
/** Turnstile tokens are at most 2,048 characters. */
export const TURNSTILE_TOKEN_MAX = 2048;
/** The Turnstile action the form's widget names and the Worker insists on. */
export const TURNSTILE_ACTION = "send-request";

/** The Worker's path for a request; the only path under /api/* that does anything. */
export const REQUEST_API_PATH = "/api/request";

const contextField = z.string().max(CONTEXT_FIELD_MAX).optional();

export const requestSchema = z
  .object({
    kind: z.enum(REQUEST_KINDS),
    title: z.string().trim().min(TITLE_MIN).max(TITLE_MAX),
    details: z.string().trim().min(DETAILS_MIN).max(DETAILS_MAX),
    contact: z.string().trim().max(CONTACT_MAX).optional(),
    context: z
      .object({ appVersion: contextField, datasetVersion: contextField, page: contextField })
      .strict()
      .optional(),
    turnstileToken: z.string().min(1).max(TURNSTILE_TOKEN_MAX),
  })
  // Unknown keys are refused rather than dropped: nothing outside this shape
  // has any business in the body, so a body carrying more is not from the form.
  .strict();

export type SiteRequest = z.infer<typeof requestSchema>;

/** The Worker's answer: never the issue (the repository is private) and never the player's text. */
export type RequestResponse = { ok: true } | { ok: false; error: RequestErrorCode };

export type RequestErrorCode =
  | "not-found"
  | "method-not-allowed"
  | "bad-origin"
  | "unsupported-media-type"
  | "too-large"
  | "bad-json"
  | "invalid"
  | "rate-limited"
  | "unavailable"
  | "bot-check-failed"
  | "bot-check-unavailable"
  | "send-failed";
