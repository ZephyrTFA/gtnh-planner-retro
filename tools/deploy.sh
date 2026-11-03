#!/usr/bin/env bash
# Build and deploy the live site (static assets + the request Worker).
#
# Run from the repository root:  bash tools/deploy.sh
#
# The site only ever goes up from a clean tree whose HEAD is on origin/main, so
# what is live is always something GitHub has. Secrets come from the
# maintainer's files in ~/.config/gtnh-retro (cloudflare-deploy.env, github.env,
# turnstile.env; mode 600) and go up with the version from a temporary 600 file
# that is shredded on exit. Nothing secret is printed.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Refusing to deploy: uncommitted changes." >&2
  exit 1
fi
git fetch -q origin
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  echo "Refusing to deploy: HEAD is not origin/main (push first, or pull)." >&2
  exit 1
fi
if [[ ! -f public/datasets/gtnh/datasets.manifest.json ]]; then
  echo "Refusing to deploy: no dataset in public/datasets/gtnh (run the dataset pipeline)." >&2
  exit 1
fi

npm run build

umask 077
secrets=$(mktemp)
trap 'shred -u "$secrets" 2>/dev/null || rm -f "$secrets"' EXIT
(
  set -a
  . ~/.config/gtnh-retro/github.env
  . ~/.config/gtnh-retro/turnstile.env
  set +a
  jq -n --arg g "$GITHUB_ACCESS_TOKEN" --arg t "$TURNSTILE_SECRET" \
    '{GITHUB_ACCESS_TOKEN: $g, TURNSTILE_SECRET: $t}' > "$secrets"
)
set -a
. ~/.config/gtnh-retro/cloudflare-deploy.env
set +a
WRANGLER_SEND_METRICS=false npx wrangler deploy --secrets-file "$secrets" 2>&1 | grep -vE '^\s*$|^\+ ' | tail -20
echo "Deployed $(git rev-parse --short HEAD) as $(node -p 'require("./out/version.json").version')."
