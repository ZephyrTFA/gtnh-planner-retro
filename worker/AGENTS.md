# Request Worker (worker/index.ts, worker/request.ts)

The site's only server code. `index.ts` is the entry and exports the handler only (the
runtime refuses a main module with any other named export); the logic is `request.ts`. `POST /api/request` takes the Help menu's "Send a request"
form (`src/components/RequestDialog.tsx`) and files it as an issue on the private
repository. The schema both ends share is `src/lib/requests/request-schema.ts`.
Tests: `worker/request.test.ts`, `src/components/RequestDialog.test.tsx`,
`tools/security-headers.test.mjs`.

## Only /api/* runs code

- `wrangler.jsonc` sets `assets.run_worker_first: ["/api/*"]` and nothing wider. Every
  page, script and dataset file is a static asset: free, unmetered, nothing for anyone to
  run up. Never set it to `true`, add paths, or put logic on asset paths.
- Cloudflare's docs say a request that matches no asset and is not a page navigation (a
  missing file fetched by script) may still reach the script; `wrangler dev` serves those
  from the 404 page without running it. Either way the script hands anything outside
  /api/* straight back to `env.ASSETS`; keep that branch free of work.
- Under /api/* only `POST /api/request` does anything; other paths answer 404, other
  methods 405, without touching GitHub.

## Checks, cheapest first

Method, Origin (exactly `SITE_ORIGIN`; `http://localhost:*` only with `LOCAL_DEV=true`),
`Content-Type: application/json`, the body read to at most 24 KB counting bytes (the largest honest request is about 19 KB), JSON,
the schema, the per-address rate limit, Turnstile siteverify (success,
`hostname` = the origin's, `action` = `send-request`), the site-wide rate limit (after the
bot check, so junk with bad tokens cannot spend real players' allowance), and only then GitHub. Turnstile
and GitHub are never called for a request that fails an earlier check.

## The issue

- Title `[<Kind>] <title>`, one line, control characters gone. Labels `from-site` and
  `kind:<kind>`; GitHub's 422 for a missing label files the issue again without labels.
- The sender's details go in a code fence longer than any backtick run in them; contact
  and context are code spans in a table. A zero-width joiner after `@`, `#` and `GH-`
  keeps mentions from pinging and references from backlinking, everywhere.
- Responses are `{ ok: true }` or `{ ok: false, error: <code> }`, `no-store`, with the
  site's nosniff/no-frame headers. Never the issue URL (the repository is private), never
  the sender's text. Logs carry status codes only: no text, no addresses.

## Deploying it

- Secrets (`npx wrangler secret put <NAME>`): `GITHUB_ACCESS_TOKEN`, a fine-grained token
  with Issues read/write on `GITHUB_REPO` and nothing else; `TURNSTILE_SECRET`, the
  widget's secret key. The widget's site key is public: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
  at build time. Without it the menu item is hidden and the CSP names no third party.
  `tools/deploy.sh` reads both halves from the maintainer's `turnstile.env`, so they
  always belong to one widget. No env file is tracked, public values included:
  `.env.production` is local and `.env.example` names the variables.
- Vars in `wrangler.jsonc`: `SITE_ORIGIN`, `GITHUB_REPO`. The Turnstile widget's allowed
  hostnames must include the site's.
- Labels to create on the repository first (the token cannot): `from-site`, `kind:bug`,
  `kind:feature`, `kind:recipe-data`, `kind:other`.
- Rate limits are the `ratelimits` bindings (3 a minute per address, 20 a minute for the
  site). Cloudflare counts them per location, so they brake floods rather than count
  exactly.

## Running it locally

`npm run build`, then `npx wrangler dev --local --local-upstream localhost:8787` with
`--var` for `LOCAL_DEV:true`, Turnstile's test secret
(`1x0000000000000000000000000000000AA`; build with the test site key
`1x00000000000000000000AA`), a dummy `GITHUB_ACCESS_TOKEN`, and `GITHUB_API_BASE`
pointing at a local stub. Without `--local-upstream`, wrangler dev rewrites Origin to the
custom domain over http and every POST is refused as a foreign origin. `GITHUB_API_BASE`
and the test keys' canned siteverify answers are honoured only with `LOCAL_DEV`, which
production never sets. On NixOS, workerd in node_modules needs patchelf against nix glibc.
