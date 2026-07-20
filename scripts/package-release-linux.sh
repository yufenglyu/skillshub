#!/usr/bin/env bash
set -euo pipefail

version=""
output_dir="release-assets"
skip_tests=0
skip_install=0
skip_build=0
version_only=0

usage() {
  cat <<'EOF'
Usage: scripts/package-release-linux.sh [options]

Options:
  -v, --version, -Version VERSION
                              Release version, for example 0.11.1 or v0.11.1.
  -o, --output-dir, -OutputDir DIR
                              Directory for release assets. Default: release-assets.
      --skip-tests, -SkipTests
                              Skip TypeScript and Rust checks.
      --skip-install, -SkipInstall
                              Skip pnpm install when node_modules is missing.
      --skip-build, -SkipBuild
                              Skip Tauri build and asset copy.
      --version-only, -VersionOnly
                              Update version files, then exit.
  -h, --help                  Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -v|--version|-Version)
      version="${2:-}"
      shift 2
      ;;
    -o|--output-dir|-OutputDir)
      output_dir="${2:-}"
      shift 2
      ;;
    --skip-tests|-SkipTests)
      skip_tests=1
      shift
      ;;
    --skip-install|-SkipInstall)
      skip_install=1
      shift
      ;;
    --skip-build|-SkipBuild)
      skip_build=1
      shift
      ;;
    --version-only|-VersionOnly)
      version_only=1
      shift
      ;;
    --)
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

repo_root() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
  cd "$script_dir/.." && pwd -P
}

run() {
  echo ">> $*"
  "$@"
}

read_json_field() {
  local file="$1"
  local field="$2"
  node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); const value=data$(printf '%s' "$field"); if (value === undefined || value === null) process.exit(1); process.stdout.write(String(value));" "$file"
}

normalize_version() {
  local input="$1"
  local normalized="${input#v}"
  if [[ ! "$normalized" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.+][0-9A-Za-z.-]+)?$ ]]; then
    echo "Version must look like SemVer, for example 0.10.1 or v0.10.1. Got: $input" >&2
    exit 1
  fi
  printf '%s' "$normalized"
}

replace_text() {
  local file="$1"
  local pattern="$2"
  local replacement="$3"
  if ! perl -0ne "exit(/$pattern/ ? 0 : 1)" "$file"; then
    echo "Pattern not found in $file: $pattern" >&2
    exit 1
  fi
  perl -0pi -e "s/$pattern/$replacement/" "$file"
}

assert_linux_host() {
  if [[ "$(uname -s)" != "Linux" ]]; then
    echo "Cannot package Linux assets on $(uname -s). Tauri desktop bundles are host-specific; run this script on Linux." >&2
    exit 1
  fi
}

assert_compatible_app_identity() {
  local root="$1"
  local tauri_path="$root/src-tauri/tauri.conf.json"
  local identifier
  local product_name
  local upgrade_code

  identifier="$(read_json_field "$tauri_path" "['identifier']")"
  product_name="$(read_json_field "$tauri_path" "['productName']")"
  upgrade_code="$(read_json_field "$tauri_path" "['bundle']['windows']['wix']['upgradeCode']")"

  if [[ "$identifier" != "com.iamzhihuix.skillsmanage" ]]; then
    echo "Refusing to package: Tauri identifier changed. Keeping com.iamzhihuix.skillsmanage preserves existing app data." >&2
    exit 1
  fi
  if [[ "$product_name" != "SkillsHub" ]]; then
    echo "Refusing to package: productName must remain SkillsHub. Keep the identifier stable for older installs." >&2
    exit 1
  fi
  if [[ "$upgrade_code" != "28d41c68-f4a4-5134-b959-34babea58f7f" ]]; then
    echo "Refusing to package: Windows Wix upgradeCode changed. Keeping it preserves MSI upgrades from older versions." >&2
    exit 1
  fi

  grep -q 'join("\.skillshub")' "$root/src-tauri/src/path_utils.rs" || {
    echo "Refusing to package: app data must default to ~/.skillshub." >&2
    exit 1
  }
  grep -q 'legacy_app_data_dir' "$root/src-tauri/src/path_utils.rs" || {
    echo "Refusing to package: legacy ~/.skillsmanage migration support is missing." >&2
    exit 1
  }
  grep -q 'migrate_legacy_app_data_if_needed' "$root/src-tauri/src/lib.rs" || {
    echo "Refusing to package: legacy app data migration is missing." >&2
    exit 1
  }
}

update_version_files() {
  local root="$1"
  local next_version="$2"
  local today
  today="$(date +%F)"

  replace_text "$root/package.json" '("version"\s*:\s*)"[^"]+"' "\${1}\"$next_version\""
  replace_text "$root/src-tauri/tauri.conf.json" '("version"\s*:\s*)"[^"]+"' "\${1}\"$next_version\""
  replace_text "$root/src-tauri/Cargo.toml" '(\[package\]\s+name = "skillshub"\s+)version = "[^"]+"' "\${1}version = \"$next_version\""
  replace_text "$root/src/pages/SettingsView.tsx" 'const APP_VERSION = "[^"]+";' "const APP_VERSION = \"$next_version\";"

  local metainfo_path="$root/src-tauri/bundle/linux/com.iamzhihuix.skillsmanage.metainfo.xml"
  if ! grep -q "<release version=\"$next_version\"" "$metainfo_path"; then
    perl -0pi -e 'BEGIN { ($version, $date) = @ARGV; @ARGV = (); } s/(<releases>\s*\n)/$1    <release version="$version" date="$date"\/>\n/s' "$next_version" "$today" "$metainfo_path"
  fi

}

ensure_dependencies() {
  local root="$1"
  if [[ "$skip_install" -eq 1 ]]; then
    return
  fi
  if [[ ! -d "$root/node_modules" ]]; then
    run pnpm install --frozen-lockfile
  fi
}

run_checks() {
  local root="$1"
  if [[ "$skip_tests" -eq 1 ]]; then
    return
  fi

  local tsc_cmd="$root/node_modules/.bin/tsc"
  if [[ -x "$tsc_cmd" ]]; then
    run "$tsc_cmd" --noEmit
  else
    run pnpm typecheck
  fi
  run cargo test --manifest-path "$root/src-tauri/Cargo.toml" --no-run --message-format short -q
}

build_frontend() {
  local root="$1"
  local vite_cmd="$root/node_modules/.bin/vite"
  if [[ ! -x "$vite_cmd" ]]; then
    echo "Vite executable not found at $vite_cmd. Run pnpm install first." >&2
    exit 1
  fi
  run "$vite_cmd" build
}

build_app() {
  local root="$1"
  if [[ "$skip_build" -eq 1 ]]; then
    return
  fi

  build_frontend "$root"

  local tauri_cmd="$root/node_modules/.bin/tauri"
  if [[ ! -x "$tauri_cmd" ]]; then
    echo "Tauri CLI executable not found at $tauri_cmd. Run pnpm install first." >&2
    exit 1
  fi

  local skip_before_build_path
  skip_before_build_path="$(mktemp "${TMPDIR:-/tmp}/skillshub-tauri-build.XXXXXX")"
  printf '%s' '{"build":{"beforeBuildCommand":""}}' > "$skip_before_build_path"
  trap 'rm -f "$skip_before_build_path"' RETURN
  run "$tauri_cmd" build --bundles deb,rpm,appimage --no-sign --ci --config "$skip_before_build_path"
}

copy_linux_assets() {
  local root="$1"
  local next_version="$2"
  local out_dir="$3"
  local bundle_root="$root/src-tauri/target/release/bundle"
  local arch
  local deb
  local rpm
  local appimage

  case "$(uname -m)" in
    aarch64|arm64) arch="arm64" ;;
    *) arch="x86_64" ;;
  esac

  deb="$(find "$bundle_root/deb" -maxdepth 1 -type f -name '*.deb' -print -quit 2>/dev/null || true)"
  rpm="$(find "$bundle_root/rpm" -maxdepth 1 -type f -name '*.rpm' -print -quit 2>/dev/null || true)"
  appimage="$(find "$bundle_root/appimage" -maxdepth 1 -type f -name '*.AppImage' -print -quit 2>/dev/null || true)"
  if [[ -z "$deb" ]]; then
    echo "Linux .deb bundle not found under $bundle_root." >&2
    exit 1
  fi
  if [[ -z "$rpm" ]]; then
    echo "Linux .rpm bundle not found under $bundle_root." >&2
    exit 1
  fi
  if [[ -z "$appimage" ]]; then
    echo "Linux .AppImage bundle not found under $bundle_root." >&2
    exit 1
  fi

  mkdir -p "$out_dir"
  cp -f "$deb" "$out_dir/skillshub-v${next_version}-Linux-${arch}.deb"
  cp -f "$rpm" "$out_dir/skillshub-v${next_version}-Linux-${arch}.rpm"
  cp -f "$appimage" "$out_dir/skillshub-v${next_version}-Linux-${arch}.AppImage"
}

root="$(repo_root)"
cd "$root"

if [[ -z "$version" ]]; then
  version="$(read_json_field "$root/package.json" "['version']")"
fi
next_version="$(normalize_version "$version")"

update_version_files "$root" "$next_version"
assert_compatible_app_identity "$root"

if [[ "$version_only" -eq 1 ]]; then
  echo "Version files updated to $next_version. Packaging skipped because -VersionOnly was set."
  exit 0
fi

if [[ "$skip_build" -eq 0 ]]; then
  assert_linux_host
fi

out_path="$root/$output_dir"
mkdir -p "$out_path"

ensure_dependencies "$root"
run_checks "$root"
echo "Packaging target: linux"
build_app "$root"

if [[ "$skip_build" -eq 1 ]]; then
  echo "Skipping asset copy for linux because -SkipBuild was set."
  exit 0
fi

copy_linux_assets "$root" "$next_version" "$out_path"
echo "Packaged linux assets in $out_path"
