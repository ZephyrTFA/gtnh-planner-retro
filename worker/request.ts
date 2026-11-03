import "../src/lib/zod-config";
import {
  REQUEST_API_PATH,
  REQUEST_KIND_LABELS,
  TURNSTILE_ACTION,
  requestSchema,
  type RequestErrorCode,
  type RequestKind,
  type SiteRequest,
} from "../src/lib/requests/request-schema";

/**
 * The site's one piece of server code: `POST /api/request` files the "Send a
 * request" form as an issue on the private GitHub repository.
 *
 * wrangler.jsonc routes only /api/* here first (`run_worker_first`); every
 * page, script and dataset file is a static asset served without running this
 * script, so it costs nothing and gives an attacker nothing to run up. A path
 * outside /api/* that does reach it (Cloudflare may run the Worker for an
 * unmatched non-navigation request) is handed straight back to the assets for
 * the 404 page.
 *
 * Every check runs cheapest first, and the two that cost something real
 * (Turnstile's siteverify, then GitHub) only for a well-formed request from
 * the site that is inside the rate limits. Nothing the sender wrote is ever
 * echoed in a response or a log, and no address is logged.
 */

/** A Workers rate limit binding (`ratelimits` in wrangler.jsonc). */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Per sender, keyed on CF-Connecting-IP. */
  REQUEST_LIMIT_PER_IP: RateLimiter;
  /** For the whole site, whoever sends. */
  REQUEST_LIMIT_GLOBAL: RateLimiter;
  /** The site's origin; the only Origin a request may come from. */
  SITE_ORIGIN?: string;
  /** owner/repo the issues are filed on. */
  GITHUB_REPO?: string;
  /** Secret: a fine-grained token with Issues read/write on GITHUB_REPO only. */
  GITHUB_ACCESS_TOKEN?: string;
  /** Secret: the Turnstile widget's secret key. */
  TURNSTILE_SECRET?: string;
  /**
   * "true" only under `wrangler dev`: also accepts http://localhost origins,
   * honours GITHUB_API_BASE, and takes Turnstile's test keys' canned answers.
   */
  LOCAL_DEV?: string;
  /** A stand-in for api.github.com, for local runs. Ignored unless LOCAL_DEV. */
  GITHUB_API_BASE?: string;
}

export const DEFAULT_SITE_ORIGIN = "https://gtnhplanretro.tfaluc.com";
export const DEFAULT_GITHUB_REPO = "ZephyrTFA/gtnh-planner-retro";
const GITHUB_API = "https://api.github.com";
export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * The largest body the form can honestly send is about 19 KB: 5,000 characters
 * of details at 3 UTF-8 bytes each (CJK), the other fields at their limits and
 * a 2,048-character token. The limit is read off the bytes, not Content-Length.
 */
export const MAX_BODY_BYTES = 24 * 1024;

/** Issues carry this label and `kind:<kind>`. The labels must exist: the token cannot create them. */
export const FROM_SITE_LABEL = "from-site";

/**
 * Turnstile's published test secrets. They only accept the dummy token any
 * page can mint, and siteverify answers them with a canned hostname and
 * action, so those two checks are skipped for them, and only under LOCAL_DEV.
 */
const TURNSTILE_TEST_SECRETS = new Set([
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
]);

const STATUS: Record<RequestErrorCode, number> = {
  "not-found": 404,
  "method-not-allowed": 405,
  "bad-origin": 403,
  "unsupported-media-type": 415,
  "too-large": 413,
  "bad-json": 400,
  invalid: 400,
  "rate-limited": 429,
  unavailable: 503,
  "bot-check-failed": 403,
  "bot-check-unavailable": 502,
  "send-failed": 502,
};

/**
 * The site's own security headers (tools/security-headers.mjs) do not reach
 * Worker responses, so API answers carry their own: never cached, never
 * sniffed into something renderable, never framed.
 */
const API_HEADERS: Record<string, string> = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};

function answer(body: { ok: true } | { ok: false; error: RequestErrorCode }, extra?: Record<string, string>): Response {
  const status = body.ok ? 200 : STATUS[body.error];
  return new Response(JSON.stringify(body), { status, headers: { ...API_HEADERS, ...extra } });
}

const refuse = (error: RequestErrorCode, extra?: Record<string, string>) => answer({ ok: false, error }, extra);

export async function handle(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname !== REQUEST_API_PATH) {
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return refuse("not-found");
    }
    return env.ASSETS.fetch(request);
  }
  if (request.method !== "POST") {
    return refuse("method-not-allowed", { Allow: "POST" });
  }

  const localDev = env.LOCAL_DEV === "true";
  const origin = request.headers.get("Origin");
  if (!origin || !originAllowed(origin, env.SITE_ORIGIN?.trim() || DEFAULT_SITE_ORIGIN, localDev)) {
    return refuse("bad-origin");
  }
  if (!isJson(request.headers.get("Content-Type"))) {
    return refuse("unsupported-media-type");
  }

  const bytes = await readCapped(request, MAX_BODY_BYTES);
  if (bytes === "too-large") {
    return refuse("too-large");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return refuse("bad-json");
  }
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return refuse("invalid");
  }

  const repo = env.GITHUB_REPO?.trim() || DEFAULT_GITHUB_REPO;
  if (!env.GITHUB_ACCESS_TOKEN || !env.TURNSTILE_SECRET || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    console.error("request: the Worker is missing GITHUB_ACCESS_TOKEN, TURNSTILE_SECRET or a valid GITHUB_REPO");
    return refuse("unavailable");
  }

  // Per address before the bot check, so one sender cannot run up siteverify calls.
  const ip = request.headers.get("CF-Connecting-IP") ?? "";
  if (!(await env.REQUEST_LIMIT_PER_IP.limit({ key: ip || "no-address" })).success) {
    return refuse("rate-limited");
  }

  const verdict = await verifyTurnstile(
    {
      secret: env.TURNSTILE_SECRET,
      token: parsed.data.turnstileToken,
      ip,
      hostname: new URL(origin).hostname,
      acceptTestAnswers: localDev && TURNSTILE_TEST_SECRETS.has(env.TURNSTILE_SECRET),
    },
    fetchImpl,
  );
  if (verdict !== "passed") {
    return refuse(verdict === "failed" ? "bot-check-failed" : "bot-check-unavailable");
  }
  // The site-wide limit counts only senders who passed the bot check: counted
  // before it, junk with bad tokens would spend everyone's allowance and shut
  // the form for real players.
  if (!(await env.REQUEST_LIMIT_GLOBAL.limit({ key: "site" })).success) {
    return refuse("rate-limited");
  }

  const apiBase = localDev && env.GITHUB_API_BASE ? env.GITHUB_API_BASE.replace(/\/+$/, "") : GITHUB_API;
  const sent = await createIssue(
    { apiBase, repo, token: env.GITHUB_ACCESS_TOKEN },
    { title: issueTitle(parsed.data), body: issueBody(parsed.data), labels: issueLabels(parsed.data.kind) },
    fetchImpl,
  );
  return sent ? answer({ ok: true }) : refuse("send-failed");
}

/** The site itself, or (local runs only) a page on localhost. */
export function originAllowed(origin: string, siteOrigin: string, localDev: boolean): boolean {
  if (origin === siteOrigin.replace(/\/+$/, "")) {
    return true;
  }
  return localDev && /^http:\/\/localhost(?::\d{1,5})?$/.test(origin);
}

/** `application/json`, with at most a UTF-8 charset. */
function isJson(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }
  const [type, ...params] = contentType.split(";").map((part) => part.trim().toLowerCase());
  return type === "application/json" && params.every((p) => p === "" || p === "charset=utf-8");
}

/**
 * The body, stopping at `max` bytes. Content-Length is only a quick early
 * refusal: a chunked body has none and a lying one is caught by the count.
 */
export async function readCapped(request: Request, max: number): Promise<Uint8Array | "too-large"> {
  const declared = request.headers.get("Content-Length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > max) {
    return "too-large";
  }
  if (!request.body) {
    return new Uint8Array();
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return "too-large";
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}

/**
 * Siteverify: the token must be fresh and unspent, and minted on this site's
 * hostname by the form's own widget action, so a token from someone else's
 * page with our (public) site key is refused.
 */
export async function verifyTurnstile(
  check: { secret: string; token: string; ip: string; hostname: string; acceptTestAnswers: boolean },
  fetchImpl: typeof fetch,
): Promise<"passed" | "failed" | "unavailable"> {
  let outcome: { success?: unknown; hostname?: unknown; action?: unknown };
  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: check.secret, response: check.token, ...(check.ip ? { remoteip: check.ip } : {}) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error(`request: siteverify answered ${response.status}`);
      return "unavailable";
    }
    outcome = (await response.json()) as typeof outcome;
  } catch {
    console.error("request: siteverify could not be reached");
    return "unavailable";
  }
  if (outcome.success !== true) {
    return "failed";
  }
  if (check.acceptTestAnswers) {
    return "passed";
  }
  return outcome.hostname === check.hostname && outcome.action === TURNSTILE_ACTION ? "passed" : "failed";
}

/**
 * Files the issue as the token's account. Labels the token cannot apply
 * (missing from the repository) come back as 422, so the issue is filed again
 * without them rather than lost. Failures are logged by status only.
 */
export async function createIssue(
  target: { apiBase: string; repo: string; token: string },
  issue: { title: string; body: string; labels: string[] },
  fetchImpl: typeof fetch,
): Promise<boolean> {
  const post = (payload: object) =>
    fetchImpl(`${target.apiBase}/repos/${target.repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${target.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "gtnh-planner-retro-requests",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
  try {
    let response = await post(issue);
    if (response.status === 422) {
      console.warn("request: GitHub refused the labels (422); filing without them");
      response = await post({ title: issue.title, body: issue.body });
    }
    if (!response.ok) {
      console.error(`request: GitHub answered ${response.status}`);
      return false;
    }
    return true;
  } catch {
    console.error("request: GitHub could not be reached");
    return false;
  }
}

const ZWJ = "‍";
/** Bidirectional overrides and isolates: they make text read differently from what it is. */
const BIDI_CONTROLS = /[‪-‮⁦-⁩]/g;

/**
 * Text that cannot ping anyone or link another issue: a zero-width joiner
 * after `@` breaks a mention, and after `#` or `GH-` breaks an issue
 * reference (owner/repo#1 included), so no one is notified and no backlink
 * lands on another issue.
 */
export function neutralise(text: string): string {
  return text
    .replace(/@(?=[\w-])/g, `@${ZWJ}`)
    .replace(/#(?=\d)/g, `#${ZWJ}`)
    .replace(/\b(GH)-(?=\d)/gi, `$1-${ZWJ}`);
}

/** One line of text: control characters (newlines included) become spaces. */
function oneLine(text: string): string {
  return text.replace(BIDI_CONTROLS, "").replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim();
}

export function issueTitle(request: SiteRequest): string {
  return `[${REQUEST_KIND_LABELS[request.kind]}] ${neutralise(oneLine(request.title))}`;
}

export function issueLabels(kind: RequestKind): string[] {
  return [FROM_SITE_LABEL, `kind:${kind}`];
}

/** A backtick run longer than any inside the text: nothing in it can close the fence. */
export function fenceFor(text: string, minimum = 3): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((run) => run[0].length));
  return "`".repeat(Math.max(minimum, longest + 1));
}

/**
 * A table cell as a code span: GitHub renders no links, mentions, HTML or
 * formatting inside one. Pipes are escaped, as tables need even in code.
 */
function cell(text: string): string {
  const value = neutralise(oneLine(text)).replace(/\|/g, "\\|");
  if (!value) {
    return "";
  }
  const fence = fenceFor(value, 1);
  return `${fence} ${value} ${fence}`;
}

/**
 * The issue: what the sender wrote, verbatim inside a code fence (GitHub
 * renders nothing inside one: no HTML, images, links, mentions or
 * references), then the context they sent in a small table.
 */
export function issueBody(request: SiteRequest): string {
  const details = neutralise(
    request.details.replace(/\r\n?/g, "\n").replace(BIDI_CONTROLS, "").replace(/[^\P{Cc}\n\t]/gu, ""),
  );
  const fence = fenceFor(details);
  const rows: [string, string | undefined][] = [
    ["Kind", REQUEST_KIND_LABELS[request.kind]],
    ["Contact", request.contact],
    ["App version", request.context?.appVersion],
    ["Dataset", request.context?.datasetVersion],
    ["Page", request.context?.page],
  ];
  return [
    "Sent with the site's request form. The text is the sender's, with mentions and issue references broken so they notify no one.",
    "",
    `${fence}text`,
    details,
    fence,
    "",
    "| | |",
    "|---|---|",
    ...rows.filter(([, value]) => value?.trim()).map(([name, value]) => `| ${name} | ${cell(value!)} |`),
  ].join("\n");
}
