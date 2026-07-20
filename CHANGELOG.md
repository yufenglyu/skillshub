# Changelog

All notable changes to this project will be documented in this file.

## 0.12.0 - 2026-07-20

Release focused on clearer platform management, project discovery behavior, and platform-specific packaging scripts.

### Features

- Merge scan-directory and custom-platform settings into a clearer platform and project directory management area.
- Split managed locations into Software Platforms and Project Directories, with built-in software platforms available for viewing.
- Add separate release packaging scripts for Windows, macOS, and Linux so each script only packages its own host platform.

### Improvements

- Hide built-in software platforms from the main interface when the corresponding local skills directory does not exist.
- Improve Settings layout by placing add actions next to their corresponding sections.
- Refresh English and Chinese Settings screenshots for the current interface.
- Simplify README packaging instructions with platform-specific commands and shared options.
- Stop tracking local planning documents under `docs/` and remove generated release-notes files from the repository.

### Fixes

- Prevent browser fixture project skills from appearing when no project directory is configured.
- Fix macOS release packaging when Homebrew Rust shadows the rustup toolchain used to install universal targets.
- Fix macOS and Linux release scripts to use a portable `mktemp` template.
