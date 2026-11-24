# GTNH Planner Retro

A production-chain planner for GregTech: New Horizons, at
[gtnhplanretro.tfaluc.com](https://gtnhplanretro.tfaluc.com).

GTNH Planner Retro keeps the GTNH Factory Flow 3.x board (Build, Solve and Pool modes, the
Raw/Net switch, the classic cards) and carries its own recipe data, built from the official
GTNH pack. It does not depend on any other planner site. Bug fixes from later upstream
versions are brought over where the bug exists here.

Search the real GTNH recipe set, place recipes as machine cards on a board, wire outputs
to inputs, and the solver works out rates, machine counts, power, bottlenecks and
surplus for the whole plan.

## Run

```bash
npm install
bash tools/dataset-pipeline/scripts/run-dataset-in-docker.sh stable   # builds the recipe dataset (Docker)
npm run dev        # http://localhost:3000
npm run typecheck
npm run test
```

The dataset build downloads the official GTNH pack, runs a headless client with the
exporter mod, and writes the dataset to `public/datasets/gtnh/` (ignored by git).
Community features need Supabase; see [docs/COMMUNITY.md](docs/COMMUNITY.md).

## How it fits together

- `tools/dataset-pipeline/`: a Forge mod runs inside a real GTNH client and exports every
  recipe, NEI layout, machine and rendered icon; Node scripts normalize it into the
  dataset the app reads. Recipe data never comes from wikis or hand-written tables.
- `src/lib/`: the domain model, machine math (overclocks, parallels, curated per-machine
  behaviour checked against the mod source) and an LP-based solver.
- `src/components/`, `src/store/`: the Next.js + React Flow UI and Zustand stores.

Working notes for contributors and AI agents are in [AGENTS.md](AGENTS.md) and the
`AGENTS.md` file in each area's folder.

## License and credits

Code is MIT licensed. GTNH, Minecraft, mod assets, generated datasets and icons are not
included and remain under their owners' licenses.

Built on [GTNH Factory Flow](https://github.com/jackwrichards/gtnh-factory-flow) 3.11.1 by
jackwrichards, itself started as a fork of
[Samiracle64/gtnh-factory-flow](https://github.com/Samiracle64/gtnh-factory-flow). Both are
MIT licensed and their copyright is retained in `LICENSE`.
