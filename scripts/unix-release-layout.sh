#!/usr/bin/env bash
# Shared helpers for macOS/Linux release packaging.
# Source this file; do not execute it directly.

prepare_packaged_config() {
  local root="$1"
  local dest="$root/src-tauri/resources/packaged-config"
  mkdir -p "$dest"
  echo ">> cargo run --manifest-path $root/src-tauri/Cargo.toml --bin prepare-config-dir --release --features prepare-config -- $dest"
  cargo run --manifest-path "$root/src-tauri/Cargo.toml" --bin prepare-config-dir --release --features prepare-config -- "$dest"
}

copy_packaged_config() {
  local config_dir="$1"
  local dest="$2/.skillshub"
  if [[ ! -d "$config_dir/platform" ]]; then
    echo "Packaged config directory not found at $config_dir. Run prepare-config-dir first." >&2
    return 1
  fi
  rm -rf "$dest"
  mkdir -p "$dest"
  cp -R "$config_dir/." "$dest/"
  rm -f "$dest/.gitkeep"
}

create_macos_portable_archives() {
  local app_path="$1"
  local config_dir="$2"
  local zip_path="$3"
  local tar_path="$4"
  local app_name
  local stage
  local status=0
  app_name="$(basename "$app_path")"
  stage="$(mktemp -d "${TMPDIR:-/tmp}/skillshub-portable.XXXXXX")"

  if ! (
    set -euo pipefail
    ditto "$app_path" "$stage/$app_name"
    copy_packaged_config "$config_dir" "$stage"
    rm -f "$zip_path" "$tar_path"
    ditto -c -k "$stage" "$zip_path"
    tar -C "$stage" -czf "$tar_path" "$app_name" ".skillshub"
  ); then
    status=1
  fi
  rm -rf "$stage"
  return "$status"
}

create_linux_portable_tar() {
  local appimage_path="$1"
  local config_dir="$2"
  local tar_path="$3"
  local stage
  local status=0
  stage="$(mktemp -d "${TMPDIR:-/tmp}/skillshub-portable.XXXXXX")"

  if ! (
    set -euo pipefail
    cp "$appimage_path" "$stage/skillshub.AppImage"
    chmod +x "$stage/skillshub.AppImage"
    copy_packaged_config "$config_dir" "$stage"
    rm -f "$tar_path"
    tar -C "$stage" -czf "$tar_path" "skillshub.AppImage" ".skillshub"
  ); then
    status=1
  fi
  rm -rf "$stage"
  return "$status"
}
