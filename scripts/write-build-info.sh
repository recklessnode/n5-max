#!/usr/bin/env bash
# Write data/build-info.json (public) or site/data/build-info.json (lab)
# for the stale-viewer footer.
#
# Usage: scripts/write-build-info.sh [lab|n5-max] [outfile]
#   repo defaults: "lab" if ./site/data exists, else "n5-max"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REPO="${1:-}"
OUT="${2:-}"

if [[ -z "$REPO" ]]; then
  if [[ -d site/data ]]; then
    REPO="lab"
  else
    REPO="n5-max"
  fi
fi

case "$REPO" in
  lab|n5-max) ;;
  *) echo "error: repo must be lab or n5-max (got $REPO)" >&2; exit 1 ;;
esac

if [[ -z "$OUT" ]]; then
  if [[ "$REPO" == "lab" ]]; then
    OUT="site/data/build-info.json"
  else
    OUT="data/build-info.json"
  fi
fi

mkdir -p "$(dirname "$OUT")"

COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
# Prefer the commit being deployed (Actions) when detached / shallow
if [[ -n "${GITHUB_SHA:-}" && "$COMMIT" == "unknown" ]]; then
  COMMIT="${GITHUB_SHA:0:7}"
fi
BUILT_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

python3 - "$OUT" "$COMMIT" "$BUILT_AT" "$REPO" <<'PY'
import json, sys
out, commit, built, repo = sys.argv[1:5]
doc = {"git_commit": commit, "built_at": built, "repo": repo}
with open(out, "w", encoding="utf-8") as f:
    json.dump(doc, f, indent=2)
    f.write("\n")
print(f"wrote {out} git_commit={commit} built_at={built} repo={repo}")
PY
