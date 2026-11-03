# AGENTS.md

GTNH Planner Retro: a production-chain planner for GregTech: New Horizons, kept on the
3.x board (Build, Solve and Pool) with its own recipe data, at
https://gtnhplanretro.tfaluc.com. Forked from GTNH Factory Flow 3.11.1
(jackwrichards/gtnh-factory-flow, MIT). Next.js App Router, TypeScript strict, Tailwind,
React Flow, Zustand, Zod, Vitest.

This file is the always-loaded core. Each area keeps its own rules in a `CLAUDE.md`
beside its code, which Claude Code loads when you open files there. Read the area file
before changing that area; it names the tests that pin its behaviour.

| Area | Notes |
|---|---|
| Board: cards, drawers, boards, wires, routing, arrange, board perf | `src/components/flow/CLAUDE.md` |
| App UI: interface scale, compact mode, recipe search, inspector, sounds | `src/components/CLAUDE.md` |
| Pool worksheet | `src/components/pool/CLAUDE.md` |
| Solver: LP books, Build/Solve/Pool, drawers, shared machines, verdicts | `src/lib/solver/CLAUDE.md` |
| Machine math: overclocks, parallels, curated machine table, special machines | `src/lib/machines/CLAUDE.md` |
| Domain model: resources, cells vs fluids, oredict context, sections, boards | `src/lib/model/CLAUDE.md` |
| Power generation | `src/lib/power/CLAUDE.md` |
| Designs, tabs, saving, account sync, plan import/export, public view | `src/store/CLAUDE.md` |
| Server, recipe API, Supabase | `src/lib/server/CLAUDE.md` |
| Request Worker: `/api/request`, Turnstile, GitHub issues, its secrets and labels | `worker/CLAUDE.md` |
| Dataset pipeline: export, normalize, rebuild, publish | `tools/dataset-pipeline/CLAUDE.md` |

Longer references, read on demand: `docs/solver-equations.md` (solver doctrine),
`docs/power-planner-math.md` (the decoded power workbook), `docs/COMMUNITY.md`.

## Commands

```bash
npm run dev          # http://localhost:3000
npm run typecheck
npm run test         # full vitest suite, must be green
```

Scratch harnesses are `*.local.test.ts` (excluded from the suite); run one with
`npx vitest run <file> --config vitest.local.config.ts`.

## Working rules

- Push only to `origin` (`ZephyrTFA/gtnh-planner-retro`). `upstream`
  (`jackwrichards/gtnh-factory-flow`) is read-only: fixes come over by cherry-pick with
  `-x`, and only when the bug exists in this codebase.
- Commit finished work unless told otherwise. Never reset or revert changes you did not make.
- CI runs typecheck, the full suite and a Chromium/Firefox icon-sizing check on every PR
  and push to main. No tolerated failures. A test that pins player-facing copy changes in
  the same commit as the copy.
- Nothing generated goes in the repo root. Screenshots, probe scripts, captures and logs go
  in the session scratchpad or `scratch/` (gitignored). Delete screenshots once you have
  looked at them.
- Check UI changes in the real app with Playwright; unit tests cannot see routing,
  layering or hover. Board performance changes need a before/after profile.
- Comments state the rule and why. No dates, names or "used to" stories; git has those.
- Nothing may depend on gtnhplanner.com at runtime. The site's name, address and links
  live in `src/lib/site.ts` and the environment.
- Only /api/* may run code. The site is static assets plus one Worker
  (`worker/request.ts`, the request form) that `run_worker_first` reaches for /api/*
  alone; asset requests stay free and unmetered. Its secrets (`GITHUB_ACCESS_TOKEN`,
  `TURNSTILE_SECRET`, set with `wrangler secret put`) and the issue labels it needs are
  in `worker/CLAUDE.md`.

## Player-facing copy

- Plain and short: the number, the rule, the consequence. No quips, no internal jargon,
  no em dashes.
- Recipes are read-only in the UI. No manual recipe editing unless asked.

## Releases and deploys

- Deploy only when explicitly told to, with `bash tools/deploy.sh` (needs `nix shell nixpkgs#nodejs_22 nixpkgs#jq` on NixOS):
  it builds and deploys only a clean HEAD that is on origin/main. `APP_VERSION` in `src/lib/version.ts` is bumped
  once per release, with an entry in `src/lib/changelog.ts`: concrete bullets about what
  changed for players.
- The recipe dataset is built here from the official GTNH pack:
  `bash tools/dataset-pipeline/scripts/run-dataset-in-docker.sh stable` (Docker, a headless
  client, about 30 min). Output lands in `public/datasets/gtnh/` (gitignored).
- Only GTNH 2.9 datasets are supported.

## Invariants across the app

- Raw exporter data is normalized by the pipeline before UI or solver code sees it.
  Prefer exported NEI/runtime data over hand-written tables and broad fallbacks.
- Board performance is a requirement: no DOM measurement per edge or per frame, nothing
  O(nodes x edges) per frame, hover never rebuilds the board.
- Every plan that arrives (import, paste, link, community copy) opens as a NEW design.
  Nothing overwrites the open design; no app path calls `setProject`.
- Display dials (rate units, power display) repaint numbers only. They never re-solve.
- A setting with no visible control must never be persisted: players get stuck in it,
  and a `finally` that restores it is not a durable undo.

## Probing the real app

- Playwright (`playwright-core` is a devDependency), always headless: a headed run takes
  over the owner's screen. Use `waitUntil: "load"`. Write probes into `scratch/probes/`.
- A hidden browser pane never fires `requestAnimationFrame`; shim it. A fresh profile
  lands on the Welcome tab. Production has no `window.__gtnhFlow`.
- The board pane is a million px square under the scroll camera: aim at the `.react-flow`
  wrapper's box. Tooltips move `title` to `data-tip-title`.
- Compare against old behaviour with `git worktree add` at that commit. A worktree needs
  its own `npm install`: never junction `node_modules` into one (Turbopack crashes, and
  `git worktree remove --force` follows the junction and empties the main repo's
  `node_modules`). Diff exported plans rather than trusting "same board" by eye.
- Measure performance on the static build (`npm run build`, then serve `out/` with its
  `_headers`), not on the dev server.
