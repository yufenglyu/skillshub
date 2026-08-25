#!/usr/bin/env bash
# SkillsHub build artifacts cleaner
#
# Usage:
#   ./scripts/clean.sh               # dry-run: show what would be deleted, delete nothing
#   ./scripts/clean.sh --run         # actually delete default targets
#   ./scripts/clean.sh --run --all   # also delete target/release and node_modules
#
# Default targets (regenerable, safe to delete):
#   - src-tauri/target/debug                     dev build artifacts (usually the biggest)
#   - src-tauri/target/x86_64-pc-windows-msvc    extra rust target artifacts
#   - src-tauri/target/flycheck0                 rust-analyzer check artifacts
#   - dist                                       frontend build output
#   - node_modules/.vite                         vite dev cache
#
# Extra targets (--all):
#   - src-tauri/target/release                   release build (also removes bundle/*.msi installers)
#   - node_modules                               needs `pnpm install` afterwards
#
# Notes:
#   - After cleaning rust target dirs, the next `cargo build` / `pnpm tauri dev`
#     will do a full rebuild (takes longer, but is harmless).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

RUN=0
ALL=0
for arg in "$@"; do
  case "$arg" in
    --run) RUN=1 ;;
    --all) ALL=1 ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (see --help)"
      exit 1
      ;;
  esac
done

# Safety: refuse to run outside the SkillsHub repo
if [ ! -f "$ROOT/package.json" ] || [ ! -f "$ROOT/src-tauri/Cargo.toml" ]; then
  echo "ERROR: package.json / src-tauri/Cargo.toml not found under $ROOT"
  echo "       This script must run inside the SkillsHub repository."
  exit 1
fi

DEFAULT_TARGETS=(
  "src-tauri/target/debug"
  "src-tauri/target/x86_64-pc-windows-msvc"
  "src-tauri/target/flycheck0"
  "dist"
  "node_modules/.vite"
)

EXTRA_TARGETS=(
  "src-tauri/target/release"
  "node_modules"
)

TARGETS=("${DEFAULT_TARGETS[@]}")
if [ "$ALL" -eq 1 ]; then
  TARGETS+=("${EXTRA_TARGETS[@]}")
fi

human_size() {
  # bytes -> human readable, fallback to raw number
  local bytes="$1"
  if command -v numfmt >/dev/null 2>&1; then
    numfmt --to=iec --suffix=B "$bytes" 2>/dev/null || echo "${bytes}B"
  else
    echo "${bytes}B"
  fi
}

dir_size() {
  local p="$1"
  if [ -e "$p" ]; then
    du -sk "$p" 2>/dev/null | cut -f1
  else
    echo ""
  fi
}

if [ "$ALL" -eq 1 ]; then
  echo "Mode: FULL clean (includes release build and node_modules)"
else
  echo "Mode: default clean (keeps target/release and node_modules)"
fi
if [ "$RUN" -eq 0 ]; then
  echo "Mode: DRY-RUN (nothing will be deleted; pass --run to execute)"
fi
echo "Repo: $ROOT"
echo "-----------------------------------------------------------"

total_kb=0
existing=()

for rel in "${TARGETS[@]}"; do
  abs="$ROOT/$rel"
  kb="$(dir_size "$abs")"
  if [ -z "$kb" ]; then
    printf '  [skip] %-45s (not present)\n' "$rel"
    continue
  fi
  size="$(human_size $((kb * 1024)))"
  printf '  [%5s] %-45s %s\n' "OK" "$rel" "$size"
  total_kb=$((total_kb + kb))
  existing+=("$abs")
done

echo "-----------------------------------------------------------"
echo "Total reclaimable: $(human_size $((total_kb * 1024))) across ${#existing[@]} path(s)"

if [ "$RUN" -eq 0 ]; then
  echo ""
  echo "Dry-run only. To actually delete, run:"
  echo "  ./scripts/clean.sh --run          (default targets)"
  echo "  ./scripts/clean.sh --run --all    (also release + node_modules)"
  exit 0
fi

if [ "${#existing[@]}" -eq 0 ]; then
  echo "Nothing to delete."
  exit 0
fi

echo ""
echo "Deleting..."
for abs in "${existing[@]}"; do
  echo "  rm -rf $abs"
  rm -rf "$abs"
done

echo "Done. Reclaimed about $(human_size $((total_kb * 1024)))."
if [ "$ALL" -eq 1 ]; then
  echo "Reminder: run 'pnpm install' before the next dev/build."
fi
