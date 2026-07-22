# Changelog

All notable changes to this project will be documented in this file.

## 0.13.0 - 2026-07-22

Release focused on the Resource Library workflow, settings cleanup, and a leaner navigation model.

### Features

- Add a unified Resource Library import menu that combines GitHub repository import and supported skills.sh skill-link import.
- Import GitHub-backed skills into the Skill Resource Library with preview, selection, conflict handling, and source metadata tracking.
- Allow built-in software platforms to be edited, removed, and restored through local persisted configuration.
- Add update checking in Settings so users can compare the installed app version with the latest GitHub release.

### Improvements

- Remove the dedicated Skill Marketplace page and related frontend market browsing UI.
- Rework the Resource Library directory view around `author/project` grouping instead of author-only cards.
- Improve the skill detail sidebar with clearer grouped sections for notes, tags, source information, time information, storage paths, install status, and collections.
- Compact Settings by hiding explanatory copy behind hint icons, aligning directory save buttons with their inputs, and reorganizing backup/WebDAV controls.
- Group software platforms by Lobster and Coding categories while keeping each group in a responsive two-column layout.
- Distinguish detected built-in platform directories from missing ones in Settings and hide missing built-in platforms from the main sidebar by default.
- Move theme and Settings controls to the lower-left sidebar, rename the system theme option to "System", remove the top global search box, and widen the expanded sidebar.
- Refresh English and Chinese README screenshots so each document uses screenshots from the matching UI language.
- Unify the app font stack across platforms.

### Fixes

- Keep GitHub import functionality after removing the Skill Marketplace UI.
- Preserve modified built-in platform definitions across app restarts.
- Reduce duplicated and ungrouped metadata in the skill detail sidebar.

## 0.12.0 - 2026-07-20

Release focused on clearer platform management, project discovery behavior, and platform-specific packaging scripts.

### Features

- Merge scan-directory and custom-platform settings into a clearer platform and project directory management area.
- Split managed locations into Software Platforms and Project Directories, with built-in software platforms available for viewing.
- Add separate release packaging scripts for Windows, macOS, and Linux so each script only packages its own host platform.

### Improvements

- Hide built-in software platforms from the main interface when the corresponding local skills directory does not exist.
- Collapse built-in software platforms by default in Settings to keep the platform management section compact.
- Improve Settings layout by placing add actions next to their corresponding sections.
- Refresh English and Chinese Settings screenshots for the current interface.
- Simplify README packaging instructions with platform-specific commands and shared options.
- Stop tracking local planning documents under `docs/` and remove generated release-notes files from the repository.

### Fixes

- Prevent browser fixture project skills from appearing when no project directory is configured.
- Show Project Skills only from configured project directories, and hide stale cached project-skill rows when no active project directory exists.
- Fix macOS release packaging when Homebrew Rust shadows the rustup toolchain used to install universal targets.
- Fix macOS and Linux release scripts to use a portable `mktemp` template.
