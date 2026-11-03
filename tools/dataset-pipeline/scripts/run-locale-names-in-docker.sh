#!/usr/bin/env bash
# Item and fluid names in another language for an English dataset that already
# exists: runs the client export alone with the game set to <locale>, then keeps
# the names that differ (extract-locale-names.mjs) as
# <datasets root>/<dataset id>/locales/<locale>.json.gz.
#
#   bash tools/dataset-pipeline/scripts/run-locale-names-in-docker.sh ru_RU [addon set]
#
# The pack ships its own translations, so nothing is downloaded beyond the pack.
set -euo pipefail

locale="${1:?Usage: run-locale-names-in-docker.sh <locale, e.g. ru_RU> [addon set id]}"
addon_set="${2:-}"
# Addon jars mirrored on this repo's private releases download with a token; gh's login
# stands in when GITHUB_TOKEN is unset.
if [[ -z "${GITHUB_TOKEN:-}" ]] && command -v gh >/dev/null 2>&1; then
  GITHUB_TOKEN="$(gh auth token 2>/dev/null || true)"
fi
image="${GTNH_DATASET_DOCKER_IMAGE:-gtnh-factory-flow-dataset:java21}"
dataset_root="${GTNH_DATASETS_ROOT:-public/datasets/gtnh}"
case "$dataset_root" in
  /*) dataset_root_abs="$dataset_root" ;;
  *) dataset_root_abs="$PWD/$dataset_root" ;;
esac
if [[ ! "$locale" =~ ^[a-z]{2}_[A-Z]{2}$ ]]; then
  echo "Locale must look like ru_RU, got ${locale}." >&2
  exit 1
fi
if [[ -n "$addon_set" && ! -f "tools/dataset-pipeline/addons/${addon_set}.json" ]]; then
  echo "Unknown addon set ${addon_set}: no tools/dataset-pipeline/addons/${addon_set}.json." >&2
  exit 1
fi

# The pack being translated: the manifest's default (plain) version, with the
# source details recorded when its dataset was built (generate-dataset.mjs).
IFS=$'\t' read -r version_channel version_id version_label source_kind source_ref source_url < <(
  DATASET_ROOT="$dataset_root_abs" node -e "
    const fs = require('fs');
    const manifest = JSON.parse(fs.readFileSync(process.env.DATASET_ROOT + '/datasets.manifest.json', 'utf8'));
    const id = manifest.latestStableVersion;
    const record = JSON.parse(fs.readFileSync('.pipeline/' + id + '.pipeline.json', 'utf8'));
    console.log([record.channel, record.versionId, record.versionLabel, record.sourceKind, record.sourceRef, record.sourceUrl ?? ''].join('\t'));
  "
)

docker build -t "$image" -f tools/dataset-pipeline/docker/Dockerfile .
dataset_id="${version_id}${addon_set:+-$addon_set}"
if [[ ! -f "$dataset_root_abs/$dataset_id/resource-index.json.gz" ]]; then
  echo "No English dataset at $dataset_root/$dataset_id to translate; build it first." >&2
  exit 1
fi

work="${dataset_id}-locale-${locale}"
# The base client pack, shared by every locale and addon set of this version.
base_pack=".pipeline/pack-cache/${version_id}-client.zip"
local_pack_env=()
if [[ -f "$base_pack" ]]; then
  local_pack_env=(-e "GTNH_PACK_LOCAL_ZIP=/workspace/${base_pack}")
fi
echo "Exporting ${locale} names for ${dataset_id}."
docker run --rm \
  --name "gtnh-locale-${work}" \
  --shm-size=2g \
  --memory="${GTNH_DATASET_DOCKER_MEMORY_LIMIT:-10g}" \
  --memory-swap="${GTNH_DATASET_DOCKER_MEMORY_SWAP:-12g}" \
  --cpus="${GTNH_DATASET_DOCKER_CPUS:-8}" \
  -e "GITHUB_TOKEN=${GITHUB_TOKEN:-}" \
  -e "GTNH_DATASET_CHANNEL=${version_channel}" \
  -e "GTNH_DATASET_VERSION_ID=${dataset_id}" \
  -e "GTNH_DATASET_VERSION_LABEL=${version_label}" \
  -e "GTNH_SOURCE_KIND=${source_kind}" \
  -e "GTNH_SOURCE_REF=${source_ref}" \
  -e "GTNH_SOURCE_URL=${source_url}" \
  -e "GTNH_DATASET_OUT_DIR=/workspace/.pipeline/locale-out/${work}" \
  -e "GTNH_RAW_EXPORT_DIR=/workspace/.pipeline/raw-export/${work}" \
  -e "GTNH_INSTANCE_DIR=/workspace/.pipeline/client-instance/${work}" \
  -e "GTNH_PACK_CACHE_DIR=/workspace/.pipeline/pack-cache" \
  -e "GTNH_ORACLE_BUILD_CACHE_DIR=/workspace/.pipeline/oracle-build-cache" \
  -e "GTNH_EXPORT_PACK_KIND=client" \
  -e "GTNH_EXPORT_PHASE=locale" \
  -e "GTNH_RENDER_STACK_ICONS=false" \
  -e "GTNH_EXPORT_MAX_MEMORY=${GTNH_EXPORT_MAX_MEMORY:-6G}" \
  -e "NODE_OPTIONS=--max-old-space-size=${GTNH_DATASET_NODE_HEAP_MB:-7168}" \
  -e "GTNH_LOCALE=${locale}" \
  -e "GTNH_ADDON_SET=${addon_set}" \
  "${local_pack_env[@]}" \
  -v "$dataset_root_abs:/datasets" \
  -v "$PWD:/workspace" -w /workspace \
  "$image" \
  bash -lc "npm install --no-audit --no-fund >/dev/null && bash tools/dataset-pipeline/scripts/run-gtnh-oracle-export.sh && node tools/dataset-pipeline/scripts/extract-locale-names.mjs /workspace/.pipeline/locale-out/${work}/recipes.json /datasets/${dataset_id}/resource-index.json.gz /datasets/${dataset_id}/locales/${locale}.json.gz ${locale}"
