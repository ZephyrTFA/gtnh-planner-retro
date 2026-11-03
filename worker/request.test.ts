import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SITE_ORIGIN,
  MAX_BODY_BYTES,
  SITEVERIFY_URL,
  fenceFor,
  handle,
  issueBody,
  issueTitle,
  neutralise,
  type Env,
  type RateLimiter,
} from "./request";
import { TURNSTILE_ACTION, type SiteRequest } from "../src/lib/requests/request-schema";

const ISSUES_URL = "https://api.github.com/repos/ZephyrTFA/gtnh-planner-retro/issues";
const ZWJ = "‍";

function limiter(allow: number): RateLimiter & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    limit: vi.fn(async ({ key }: { key: string }) => {
      calls.push(key);
      return { success: calls.length <= allow };
    }),
  };
}

function makeEnv(overrides: Partial<Env> = {}) {
  const perIp = limiter(3);
  const global = limiter(20);
  const assets = { fetch: vi.fn(async () => new Response("asset", { status: 200 })) };
  const env: Env = {
    ASSETS: assets,
    REQUEST_LIMIT_PER_IP: perIp,
    REQUEST_LIMIT_GLOBAL: global,
    SITE_ORIGIN: DEFAULT_SITE_ORIGIN,
    GITHUB_REPO: "ZephyrTFA/gtnh-planner-retro",
    GITHUB_ACCESS_TOKEN: "github-token",
    TURNSTILE_SECRET: "turnstile-secret",
    ...overrides,
  };
  return { env, perIp, global, assets };
}

type Siteverify = { success: boolean; hostname?: string; action?: string };

/** Network stand-in: siteverify and GitHub answer as told; anything else is a test failure. */
function network({
  siteverify = { success: true, hostname: "gtnhplanretro.tfaluc.com", action: TURNSTILE_ACTION } as Siteverify | "down",
  github = [201] as number[],
} = {}) {
  const githubCalls: { url: string; body: Record<string, unknown>; headers: Headers }[] = [];
  const siteverifyCalls: Record<string, unknown>[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    if (url === SITEVERIFY_URL) {
      siteverifyCalls.push(body);
      if (siteverify === "down") throw new TypeError("network down");
      return Response.json(siteverify);
    }
    if (url === ISSUES_URL) {
      githubCalls.push({ url, body, headers: new Headers(init?.headers) });
      const status = github[Math.min(githubCalls.length - 1, github.length - 1)]!;
      return Response.json(
        status === 201 ? { number: 7, html_url: "https://github.com/x/y/issues/7" } : { message: "secret detail" },
        { status },
      );
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, githubCalls, siteverifyCalls, calls: fetchImpl.mock.calls };
}

const valid = {
  kind: "bug",
  title: "Solver hangs",
  details: "The solver never finishes on this board.",
  contact: "me on Discord",
  context: { appVersion: "1.0.0", datasetVersion: "stable-2.9.0" },
  turnstileToken: "token",
};

function post(body: unknown, headers: Record<string, string> = {}, path = "/api/request") {
  return new Request(`https://gtnhplanretro.tfaluc.com${path}`, {
    method: "POST",
    headers: {
      Origin: DEFAULT_SITE_ORIGIN,
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.9",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function json(response: Response) {
  return (await response.json()) as { ok: boolean; error?: string };
}

describe("POST /api/request", () => {
  it("files a labelled issue and answers ok without the issue", async () => {
    const { env } = makeEnv();
    const net = network();
    const response = await handle(post(valid), env, net.fetchImpl);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: true });
    expect(text).not.toContain("issues/7");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");

    expect(net.siteverifyCalls).toEqual([
      { secret: "turnstile-secret", response: "token", remoteip: "203.0.113.9" },
    ]);
    expect(net.githubCalls).toHaveLength(1);
    const call = net.githubCalls[0]!;
    expect(call.headers.get("Authorization")).toBe("Bearer github-token");
    expect(call.headers.get("User-Agent")).toBeTruthy();
    expect(call.headers.get("X-GitHub-Api-Version")).toBe("2022-11-28");
    expect(call.body.title).toBe("[Bug] Solver hangs");
    expect(call.body.labels).toEqual(["from-site", "kind:bug"]);
    expect(String(call.body.body)).toContain("The solver never finishes on this board.");
    expect(String(call.body.body)).toContain("| App version | ` 1.0.0 ` |");
    expect(String(call.body.body)).toContain("| Dataset | ` stable-2.9.0 ` |");
  });

  it("takes the largest request the form can send", async () => {
    const { env } = makeEnv();
    const net = network();
    const largest = {
      ...valid,
      title: "字".repeat(120),
      details: "字".repeat(5000),
      contact: "字".repeat(200),
      context: { appVersion: "字".repeat(100), datasetVersion: "字".repeat(100), page: "字".repeat(100) },
      turnstileToken: "t".repeat(2048),
    };
    expect((await handle(post(largest), env, net.fetchImpl)).status).toBe(200);
  });

  it("files the issue again without labels when GitHub refuses them", async () => {
    const { env } = makeEnv();
    const net = network({ github: [422, 201] });
    const response = await handle(post(valid), env, net.fetchImpl);
    expect(await json(response)).toEqual({ ok: true });
    expect(net.githubCalls).toHaveLength(2);
    expect(net.githubCalls[0]!.body.labels).toEqual(["from-site", "kind:bug"]);
    expect(net.githubCalls[1]!.body).not.toHaveProperty("labels");
    expect(net.githubCalls[1]!.body.title).toBe("[Bug] Solver hangs");
  });

  it("answers 502 when GitHub fails, without GitHub's words", async () => {
    for (const status of [401, 403, 500]) {
      const { env } = makeEnv();
      const net = network({ github: [status] });
      const response = await handle(post(valid), env, net.fetchImpl);
      expect(response.status).toBe(502);
      const text = await response.text();
      expect(JSON.parse(text)).toEqual({ ok: false, error: "send-failed" });
      expect(text).not.toContain("secret detail");
    }
  });

  it("answers 502 when GitHub cannot be reached", async () => {
    const { env } = makeEnv();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === SITEVERIFY_URL) {
        return Response.json({ success: true, hostname: "gtnhplanretro.tfaluc.com", action: TURNSTILE_ACTION });
      }
      throw new TypeError("connection reset");
    }) as unknown as typeof fetch;
    const response = await handle(post(valid), env, fetchImpl);
    expect(response.status).toBe(502);
    expect(await json(response)).toEqual({ ok: false, error: "send-failed" });
  });

  it("never echoes the sender's text in a refusal", async () => {
    const { env } = makeEnv();
    const net = network();
    const marker = "ECHO-MARKER-<script>";
    const response = await handle(post({ ...valid, title: marker.repeat(20) }), env, net.fetchImpl);
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("ECHO-MARKER");
  });
});

describe("refusals, cheapest first, before Turnstile or GitHub", () => {
  async function refused(request: Request, envOverrides: Partial<Env> = {}) {
    const ctx = makeEnv(envOverrides);
    const net = network();
    const response = await handle(request, ctx.env, net.fetchImpl);
    const isJson = response.headers.get("Content-Type")?.startsWith("application/json");
    return { response, body: isJson ? await json(response.clone()) : undefined, net, ...ctx };
  }

  it("serves every path outside /api/* from the assets", async () => {
    const { response, net, assets, perIp } = await refused(new Request("https://gtnhplanretro.tfaluc.com/missing.js"));
    expect(await response.text()).toBe("asset");
    expect(assets.fetch).toHaveBeenCalledTimes(1);
    expect(net.calls).toHaveLength(0);
    expect(perIp.calls).toHaveLength(0);
  });

  it("answers 404 for any other /api path", async () => {
    for (const path of ["/api", "/api/", "/api/requests", "/api/request/x", "/api/feedback"]) {
      const { response, body, net, assets } = await refused(post(valid, {}, path));
      expect(response.status).toBe(404);
      expect(body).toEqual({ ok: false, error: "not-found" });
      expect(net.calls).toHaveLength(0);
      expect(assets.fetch).not.toHaveBeenCalled();
    }
  });

  it("answers 405 to anything but POST", async () => {
    for (const method of ["GET", "HEAD", "PUT", "DELETE", "OPTIONS"]) {
      const { response, net } = await refused(
        new Request("https://gtnhplanretro.tfaluc.com/api/request", { method }),
      );
      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("POST");
      expect(net.calls).toHaveLength(0);
    }
  });

  it("refuses a missing or foreign Origin with 403", async () => {
    for (const origin of [
      undefined,
      "null",
      "https://evil.example",
      "https://gtnhplanretro.tfaluc.com.evil.example",
      "http://gtnhplanretro.tfaluc.com",
      "http://localhost:8787",
    ]) {
      const request = post(valid, origin === undefined ? {} : { Origin: origin });
      if (origin === undefined) request.headers.delete("Origin");
      const { response, body, net, perIp } = await refused(request);
      expect(response.status).toBe(403);
      expect(body?.error).toBe("bad-origin");
      expect(net.calls).toHaveLength(0);
      expect(perIp.calls).toHaveLength(0);
    }
  });

  it("takes localhost origins only under LOCAL_DEV", async () => {
    const { body } = await refused(post(valid, { Origin: "http://localhost:8787" }), { LOCAL_DEV: "true" });
    expect(body?.error).not.toBe("bad-origin");
    for (const origin of ["http://localhost.evil.example", "https://localhost", "http://localhost:8787/x"]) {
      const other = await refused(post(valid, { Origin: origin }), { LOCAL_DEV: "true" });
      expect(other.body?.error).toBe("bad-origin");
    }
  });

  it("refuses anything but JSON with 415", async () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data", "application/json; charset=latin1", ""]) {
      const { response, net } = await refused(post(valid, { "Content-Type": type }));
      expect(response.status).toBe(415);
      expect(net.calls).toHaveLength(0);
    }
    const ok = await refused(post(valid, { "Content-Type": "application/json; charset=UTF-8" }));
    expect(ok.response.status).toBe(200);
  });

  it("refuses an oversized body with 413, counting bytes rather than trusting Content-Length", async () => {
    const big = { ...valid, details: "x".repeat(MAX_BODY_BYTES) };
    const declared = await refused(post(big));
    expect(declared.response.status).toBe(413);
    expect(declared.net.calls).toHaveLength(0);
    expect(declared.perIp.calls).toHaveLength(0);

    // A chunked body with no Content-Length, streamed past the cap.
    const encoder = new TextEncoder();
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 4096;
        controller.enqueue(encoder.encode("x".repeat(4096)));
        if (sent > MAX_BODY_BYTES * 4) controller.close();
      },
    });
    const chunked = new Request("https://gtnhplanretro.tfaluc.com/api/request", {
      method: "POST",
      headers: { Origin: DEFAULT_SITE_ORIGIN, "Content-Type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(chunked.headers.get("Content-Length")).toBeNull();
    const streamed = await refused(chunked);
    expect(streamed.response.status).toBe(413);
    expect(sent).toBeLessThan(MAX_BODY_BYTES * 2);
    expect(streamed.net.calls).toHaveLength(0);

    // A Content-Length that lies low is caught by the count.
    const lying = await refused(post(big, { "Content-Length": "10" }));
    expect(lying.response.status).toBe(413);
  });

  it("refuses broken JSON with 400", async () => {
    for (const text of ["{", "", "nul", "￿{}"]) {
      const { response, body, net } = await refused(post(text));
      expect(response.status).toBe(400);
      expect(body?.error).toBe("bad-json");
      expect(net.calls).toHaveLength(0);
    }
  });

  it("refuses a body outside the schema with 400", async () => {
    const cases: unknown[] = [
      [],
      JSON.stringify("a string"),
      { ...valid, kind: "question" },
      { ...valid, title: "ab" },
      { ...valid, title: "x".repeat(121) },
      { ...valid, details: "too short" },
      { ...valid, details: "x".repeat(5001) },
      { ...valid, contact: "x".repeat(201) },
      { ...valid, context: { appVersion: "x".repeat(101) } },
      { ...valid, context: { plan: "everything" } },
      { ...valid, turnstileToken: "" },
      { ...valid, turnstileToken: "x".repeat(2049) },
      { ...valid, turnstileToken: undefined },
      { ...valid, extra: true },
    ];
    for (const body of cases) {
      const { response, body: answer, net, perIp } = await refused(post(body));
      expect(response.status).toBe(400);
      expect(answer?.error).toBe("invalid");
      expect(net.calls).toHaveLength(0);
      expect(perIp.calls).toHaveLength(0);
    }
  });

  it("answers 503 when the Worker is missing its secrets", async () => {
    const { response, net } = await refused(post(valid), { GITHUB_ACCESS_TOKEN: undefined });
    expect(response.status).toBe(503);
    expect(net.calls).toHaveLength(0);
  });

  it("rate limits per address, then for the whole site, before Turnstile", async () => {
    const { env, perIp, global } = makeEnv();
    const net = network();
    const statuses = [];
    for (let i = 0; i < 4; i++) {
      statuses.push((await handle(post(valid), env, net.fetchImpl)).status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(perIp.calls).toEqual(Array(4).fill("203.0.113.9"));
    // The refused fourth never reached the site-wide limit, siteverify or GitHub.
    expect(global.calls).toHaveLength(3);
    expect(net.siteverifyCalls).toHaveLength(3);
    expect(net.githubCalls).toHaveLength(3);

    const site = makeEnv({ REQUEST_LIMIT_GLOBAL: limiter(0) });
    const siteNet = network();
    const response = await handle(post(valid), site.env, siteNet.fetchImpl);
    expect(response.status).toBe(429);
    expect(await json(response)).toEqual({ ok: false, error: "rate-limited" });
    expect(siteNet.calls).toHaveLength(0);
  });

  it("refuses a failed bot check with 403 and never calls GitHub", async () => {
    const cases: Siteverify[] = [
      { success: false },
      { success: true, hostname: "evil.example", action: TURNSTILE_ACTION },
      { success: true, hostname: "gtnhplanretro.tfaluc.com", action: "something-else" },
      { success: true, hostname: "gtnhplanretro.tfaluc.com" },
    ];
    for (const siteverify of cases) {
      const { env } = makeEnv();
      const net = network({ siteverify });
      const response = await handle(post(valid), env, net.fetchImpl);
      expect(response.status).toBe(403);
      expect(await json(response)).toEqual({ ok: false, error: "bot-check-failed" });
      expect(net.githubCalls).toHaveLength(0);
    }
  });

  it("answers 502 when siteverify is down, never calling GitHub", async () => {
    const { env } = makeEnv();
    const net = network({ siteverify: "down" });
    const response = await handle(post(valid), env, net.fetchImpl);
    expect(response.status).toBe(502);
    expect(await json(response)).toEqual({ ok: false, error: "bot-check-unavailable" });
    expect(net.githubCalls).toHaveLength(0);
  });

  it("accepts Turnstile's test answers only for a test secret under LOCAL_DEV", async () => {
    const testAnswer = { success: true, hostname: "example.com", action: "test" };
    const secret = "1x0000000000000000000000000000000AA";
    const dev = makeEnv({ LOCAL_DEV: "true", TURNSTILE_SECRET: secret });
    expect((await handle(post(valid), dev.env, network({ siteverify: testAnswer }).fetchImpl)).status).toBe(200);
    const prod = makeEnv({ TURNSTILE_SECRET: secret });
    expect((await handle(post(valid), prod.env, network({ siteverify: testAnswer }).fetchImpl)).status).toBe(403);
  });

  it("ignores GITHUB_API_BASE outside LOCAL_DEV", async () => {
    const { env } = makeEnv({ GITHUB_API_BASE: "https://stub.example" });
    const net = network();
    expect((await handle(post(valid), env, net.fetchImpl)).status).toBe(200);
    expect(net.githubCalls).toHaveLength(1);
  });
});

describe("the issue", () => {
  const request = (overrides: Partial<SiteRequest>): SiteRequest => ({ ...(valid as SiteRequest), ...overrides });

  it("breaks mentions and issue references so no one is pinged and nothing is backlinked", () => {
    const text = "cc @octocat and @org/team, see #12, GH-34, gh-5 and owner/repo#56; mail me@example.com";
    const out = neutralise(text);
    expect(out).not.toMatch(/@[\w-]/);
    expect(out).not.toMatch(/#\d/);
    expect(out).not.toMatch(/GH-\d/i);
    expect(out).toContain(`@${ZWJ}octocat`);
    expect(out).toContain(`owner/repo#${ZWJ}56`);
    expect(out.replaceAll(ZWJ, "")).toBe(text);
  });

  it("titles the issue by kind, on one line, with control characters gone", () => {
    expect(issueTitle(request({ kind: "recipe-data", title: "Wrong\u0000 output\n@admin #1‮" }))).toBe(
      `[Recipe data] Wrong output @${ZWJ}admin #${ZWJ}1`,
    );
  });

  it("fences the details longer than any backtick run inside them", () => {
    expect(fenceFor("no ticks")).toBe("```");
    expect(fenceFor("a ``` b")).toBe("````");
    expect(fenceFor("``````` seven")).toBe("````````");
    const details = "Closing it early:\n```\n# Heading\n<img src=x onerror=alert(1)>\n````\n![x](https://evil.example/x.png)";
    const body = issueBody(request({ details }));
    const fence = "`````";
    expect(body).toContain(`${fence}text\n`);
    const inside = body.split(`${fence}text\n`)[1]!.split(`\n${fence}\n`)[0]!;
    expect(inside.replaceAll(ZWJ, "")).toBe(details);
    // Nothing outside the fence carries the sender's words.
    const outside = body.replace(inside, "");
    expect(outside).not.toContain("onerror");
    expect(outside).not.toContain("evil.example");
  });

  it("puts contact and context in code spans, one line each, pipes escaped", () => {
    const body = issueBody(
      request({
        contact: "a | b\n| injected | row |",
        context: { appVersion: "1.0.0`x`", datasetVersion: "@here", page: "/plans" },
      }),
    );
    expect(body).toContain("| Contact | ` a \\| b \\| injected \\| row \\| ` |");
    expect(body).toContain("| App version | `` 1.0.0`x` `` |");
    expect(body).toContain(`| Dataset | \` @${ZWJ}here \` |`);
    expect(body).toContain("| Page | ` /plans ` |");
    expect(body.split("\n").filter((line) => line.startsWith("| Contact"))).toHaveLength(1);
  });

  it("leaves out rows the sender did not fill", () => {
    const body = issueBody(request({ contact: undefined, context: undefined }));
    expect(body).not.toContain("Contact");
    expect(body).not.toContain("App version");
    expect(body).toContain("| Kind | ` Bug ` |");
  });
});
