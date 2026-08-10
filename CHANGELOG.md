# Changelog

All notable changes to this project will be documented in this file.

## 0.16.0 - 2026-08-10

Release focused on making project directories first-class install targets and keeping the sidebar/settings model aligned.

### Features

- Treat configured Project Directories as install targets that manage skills under `<project>/.agents/skills`.
- Allow Resource Library and Central Skills installs to target project directories alongside software platforms.
- Automatically synchronize managed Central Skills to active project directories when Central Skills already contains skills.
- Add collapsible sidebar sections for Software Platforms, Lobster platforms, Coding platforms, and Project Directories.

### Improvements

- Rename the old project-skill sidebar concept to Project Directories and place it below Software Platforms.
- Reorder Settings so Software Platforms appear above Project Directories.
- Keep Resource Library, Central Skills, and platform stores aware of project directory targets in browser and Tauri modes.
- Update English and Chinese documentation and screenshots for the new sidebar and project-directory install model.

### Fixes

- Clean up project-directory virtual installation rows when a configured project directory is disabled, missing, or removed.
- Count scanned project-directory skills under their virtual project target id.
- Keep project directory route handling safe for encoded virtual target ids such as `project:<id>`.

## 0.15.0 - 2026-07-23

Release focused on central-platform synchronization, WebDAV backup controls, and final interface consistency before publishing.

### Features

- Add WebDAV connection testing and selected remote backup deletion from Settings.
- Automatically synchronize managed Central Skills to newly detected local platforms when Central Skills already contains skills.
- Show Settings platform group counts as both built-in platform totals and detected local platform counts.

### Improvements

- Rework WebDAV backup actions into a single right-aligned action row with shorter labels and complete icons.
- Align Settings action buttons consistently to the right across backup, token, AI provider, and update sections.
- Unify selected-state styling for AI provider and language controls with the sidebar accent color, including dark theme.
- Update English and Chinese documentation and screenshots for the current Settings, platform, backup, import, and skill-card interfaces.

### Fixes

- Keep sidebar platform entries in sync with all detected platform directories that should receive Central Skills.
- Avoid mismatched counts between detected Settings platforms and visible sidebar platforms after central synchronization.
- Improve WebDAV backup error handling around remote list, upload, import, test, and delete operations.

## 0.14.0 - 2026-07-23

Release focused on the Resource Library workflow, reliable source updates, settings cleanup, and a more consistent interface.

### Features

- Add a unified Resource Library import menu that combines GitHub repository import and supported skills.sh skill-link import.
- Import GitHub-backed skills into the Skill Resource Library with preview, selection, conflict handling, and source metadata tracking.
- Allow built-in software platforms to be edited, removed, and restored through local persisted configuration.
- Add update checking in Settings so users can compare the installed app version with the latest GitHub release.

### Improvements

- Remove the dedicated Skill Marketplace page and related frontend market browsing UI.
- Rework the Resource Library directory view around `author/project` grouping instead of author-only cards.
- Show both created and updated dates on skill cards, with localized labels in Chinese and English.
- Show per-skill source-update actions whenever a skill has recoverable GitHub source metadata, even if the direct source URL was missing.
- Improve the skill detail sidebar with clearer grouped sections for notes, tags, source information, time information, storage paths, install status, and collections.
- Compact Settings by hiding explanatory copy behind hint icons, aligning directory save buttons with their inputs, and reorganizing backup/WebDAV controls.
- Group software platforms by Lobster and Coding categories while keeping each group in a responsive two-column layout.
- Distinguish detected built-in platform directories from missing ones in Settings and hide missing built-in platforms from the main sidebar by default.
- Move theme and Settings controls to the lower-left sidebar, rename the system theme option to "System", remove the top global search box, and widen the expanded sidebar.
- Refresh English and Chinese README screenshots so each document uses screenshots from the matching UI language.
- Unify the app font stack across platforms.

### Fixes

- Keep GitHub import functionality after removing the Skill Marketplace UI.
- Fix Resource Library "Update from sources" so it updates resource-library skills instead of clearing the visible resource list.
- Recover missing source URLs from stored GitHub repository and path metadata before updating source-backed skills.
- Validate downloaded source-update content before overwriting local `SKILL.md` files.
- Prevent imported GitHub skills from losing update capability when source metadata is partially missing.
- Preserve modified built-in platform definitions across app restarts.
- Reduce duplicated and ungrouped metadata in the skill detail sidebar.

## 0.13.0 - 2026-07-22

Release focused on internal release preparation and packaging metadata.

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
