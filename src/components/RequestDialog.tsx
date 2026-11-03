"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, MessageSquarePlus, X } from "lucide-react";
import {
  CONTACT_MAX,
  DETAILS_MAX,
  DETAILS_MIN,
  REQUEST_KINDS,
  TITLE_MAX,
  TITLE_MIN,
  TURNSTILE_ACTION,
  type RequestKind,
} from "@/lib/requests/request-schema";
import { sendRequest, type SendOutcome } from "@/lib/requests/send-request";
import { loadTurnstile, type TurnstileApi } from "@/lib/requests/turnstile";
import { TURNSTILE_SITE_KEY } from "@/lib/site";
import { APP_VERSION } from "@/lib/version";
import { msg, t, td, useT } from "@/lib/i18n";
import { useFactoryStore } from "@/store/factory-store";

/** What the player is told when sending fails; their text stays in the form. */
export const SEND_ERRORS: Record<Exclude<SendOutcome, "sent">, string> = {
  "rate-limited": msg("Too many requests. Wait a minute and try again."),
  "bot-check-failed": msg("The bot check failed. Wait for a new check, then send again."),
  invalid: msg("The request was refused. Check each field and try again."),
  failed: msg("Couldn't send your request. Try again later."),
};

/**
 * The kinds as the form shows them. The Worker titles issues with the English
 * REQUEST_KIND_LABELS; these are their display twins.
 */
const KIND_DISPLAY_LABELS: Record<RequestKind, string> = {
  bug: msg("Bug"),
  feature: msg("Feature"),
  "recipe-data": msg("Recipe data"),
  other: msg("Other"),
};

type Field = "title" | "details" | "contact";

/** Each field's limit, as the player reads it; the Worker holds the same limits. */
function fieldErrors(form: { title: string; details: string; contact: string }): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  const title = form.title.trim().length;
  if (title < TITLE_MIN || title > TITLE_MAX) {
    errors.title = t("Use {min} to {max} characters.", { min: TITLE_MIN, max: TITLE_MAX });
  }
  const details = form.details.trim().length;
  if (details < DETAILS_MIN || details > DETAILS_MAX) {
    errors.details = t("Use {min} to {max} characters.", { min: DETAILS_MIN, max: DETAILS_MAX.toLocaleString("en-US") });
  }
  if (form.contact.trim().length > CONTACT_MAX) {
    errors.contact = t("Use at most {max} characters.", { max: CONTACT_MAX });
  }
  return errors;
}

/**
 * "Send a request": a bug, a feature, wrong recipe data, anything else. It
 * reaches the maintainer as a private issue through the site's Worker. The
 * only things sent beside the player's words are the app version and the
 * loaded dataset version: no plan, no browser details.
 *
 * The Turnstile check loads with the dialog, never before, and is reset after
 * every send because each token is good for one try.
 */
export function RequestDialog({ onClose, siteKey = TURNSTILE_SITE_KEY }: { onClose: () => void; siteKey?: string }) {
  const t = useT();
  const datasetVersion = useFactoryStore((state) => state.dataset?.datasetVersionId);
  const [kind, setKind] = useState<RequestKind>("bug");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [contact, setContact] = useState("");
  const [triedToSend, setTriedToSend] = useState(false);
  const [status, setStatus] = useState<"editing" | "sending" | "sent">("editing");
  const [failure, setFailure] = useState<Exclude<SendOutcome, "sent">>();

  const [token, setToken] = useState<string>();
  const [checkState, setCheckState] = useState<"loading" | "ready" | "unavailable">("loading");
  const widgetHost = useRef<HTMLDivElement>(null);
  const widget = useRef<{ api: TurnstileApi; id: string }>(undefined);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!siteKey) {
      return;
    }
    let cancelled = false;
    loadTurnstile().then(
      (api) => {
        if (cancelled || !widgetHost.current) {
          return;
        }
        const id = api.render(widgetHost.current, {
          sitekey: siteKey,
          action: TURNSTILE_ACTION,
          theme: "dark",
          size: "flexible",
          callback: (value) => setToken(value),
          "expired-callback": () => setToken(undefined),
          "timeout-callback": () => setToken(undefined),
          "error-callback": () => setToken(undefined),
        });
        if (id !== undefined) {
          widget.current = { api, id };
        }
        setCheckState("ready");
      },
      () => {
        if (!cancelled) {
          setCheckState("unavailable");
        }
      },
    );
    return () => {
      cancelled = true;
      widget.current?.api.remove(widget.current.id);
      widget.current = undefined;
    };
  }, [siteKey]);

  const errors = fieldErrors({ title, details, contact });
  const shownErrors = triedToSend ? errors : {};

  const resetCheck = () => {
    setToken(undefined);
    if (widget.current) {
      widget.current.api.reset(widget.current.id);
    }
  };

  const send = async () => {
    setTriedToSend(true);
    if (Object.keys(errors).length > 0 || !token || status === "sending") {
      return;
    }
    setStatus("sending");
    setFailure(undefined);
    const outcome = await sendRequest({
      kind,
      title: title.trim(),
      details: details.trim(),
      ...(contact.trim() ? { contact: contact.trim() } : {}),
      context: { appVersion: APP_VERSION, ...(datasetVersion ? { datasetVersion } : {}) },
      turnstileToken: token,
    });
    resetCheck();
    if (outcome === "sent") {
      setTitle("");
      setDetails("");
      setContact("");
      setTriedToSend(false);
      setStatus("sent");
    } else {
      setFailure(outcome);
      setStatus("editing");
    }
  };

  const inputClass =
    "w-full rounded border border-line-strong bg-surface-sunken px-2 py-1.5 text-sm text-fg outline-none focus:border-cyan-700";

  return (
    <div
      className={[
        "fixed inset-0 z-[120] grid place-items-center p-4",
        // A full-viewport backdrop-filter repaints the animated board beneath
        // and can crash a phone tab; compact gets a darker opaque sheet.
        "bg-neutral-950/75 backdrop-blur-sm compact:bg-neutral-950/92 compact:[backdrop-filter:none]",
      ].join(" ")}
    >
      {/* No close on a backdrop click: a stray click must not throw away a
          half-written request. Close, Cancel and Escape are deliberate. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-dialog-title"
        className="flex max-h-[calc(92*var(--ui-vh))] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded border border-line-strong bg-surface p-4 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 id="request-dialog-title" className="flex items-center gap-2 text-base font-semibold">
            <MessageSquarePlus aria-hidden className="h-4 w-4" />
            {t("Send a request")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Close")}
            className="rounded p-1 text-fg-subtle hover:bg-surface-raised"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {status === "sent" ? (
          <div role="status" className="flex flex-col gap-3">
            <p className="flex items-center gap-2 text-sm text-emerald-300">
              <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0" />
              {t("Request sent. Thank you.")}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStatus("editing")}
                className="rounded border border-line-strong px-3 py-1.5 text-sm hover:bg-surface-raised"
              >
                {t("Send another")}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-line-strong bg-surface-raised px-3 py-1.5 text-sm font-semibold hover:bg-surface-sunken"
              >
                {t("Close")}
              </button>
            </div>
          </div>
        ) : null}

        <form
          noValidate
          className={status === "sent" ? "hidden" : "flex flex-col gap-3"}
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <p className="text-sm text-fg-muted">
            {t("Requests go to the maintainer privately. Only the app and dataset versions are sent with them.")}
          </p>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">{t("Kind")}</span>
            <select value={kind} onChange={(event) => setKind(event.target.value as RequestKind)} className={inputClass}>
              {REQUEST_KINDS.map((value) => (
                <option key={value} value={value}>
                  {td(KIND_DISPLAY_LABELS[value])}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">{t("Title")}</span>
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={TITLE_MAX}
              aria-invalid={shownErrors.title ? true : undefined}
              aria-describedby={shownErrors.title ? "request-title-error" : undefined}
              className={inputClass}
            />
            {shownErrors.title ? (
              <span id="request-title-error" className="text-xs text-red-400">
                {shownErrors.title}
              </span>
            ) : null}
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="flex items-baseline justify-between">
              <span className="font-semibold">{t("Details")}</span>
              <span className="text-xs tabular-nums text-fg-muted">
                {details.length.toLocaleString("en-US")} / {DETAILS_MAX.toLocaleString("en-US")}
              </span>
            </span>
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={DETAILS_MAX}
              rows={6}
              aria-invalid={shownErrors.details ? true : undefined}
              aria-describedby={shownErrors.details ? "request-details-error" : undefined}
              className={`${inputClass} resize-y`}
            />
            {shownErrors.details ? (
              <span id="request-details-error" className="text-xs text-red-400">
                {shownErrors.details}
              </span>
            ) : null}
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">{t("How can we reach you? Optional.")}</span>
            <input
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              maxLength={CONTACT_MAX}
              aria-invalid={shownErrors.contact ? true : undefined}
              aria-describedby={shownErrors.contact ? "request-contact-error" : undefined}
              className={inputClass}
            />
            {shownErrors.contact ? (
              <span id="request-contact-error" className="text-xs text-red-400">
                {shownErrors.contact}
              </span>
            ) : null}
          </label>

          <div ref={widgetHost} data-testid="turnstile" className="min-h-[65px]" />
          {checkState === "unavailable" ? (
            <p className="text-xs text-red-400">{t("The bot check could not load. Reload the page and try again.")}</p>
          ) : null}

          {failure ? (
            <p role="alert" className="text-sm text-red-400">
              {td(SEND_ERRORS[failure])}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            {!token && checkState !== "unavailable" ? (
              <span className="mr-auto text-xs text-fg-muted">{t("Waiting for the bot check.")}</span>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-line-strong px-3 py-1.5 text-sm hover:bg-surface-raised"
            >
              {t("Cancel")}
            </button>
            <button
              type="submit"
              disabled={!token || status === "sending"}
              className="inline-flex items-center gap-1.5 rounded border border-line-strong bg-surface-raised px-3 py-1.5 text-sm font-semibold hover:bg-surface-sunken disabled:opacity-40"
            >
              {status === "sending" ? <LoaderCircle aria-hidden className="h-3.5 w-3.5 animate-spin" /> : null}
              {t("Send")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
