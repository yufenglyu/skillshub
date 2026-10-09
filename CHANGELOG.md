# Changelog

[English](CHANGELOG.md) | [简体中文](CHANGELOG.zh.md)

## Unreleased

- Merge background tasks and update status into one Tasks & updates window with Pending, In progress and History views, available from every page. Keep update selections when switching views and group batch operations with expandable progress and results.
- Finish update checks with a notification instead of opening the results automatically. Clear previous check reports and records when starting a full repository check, while preserving unrelated results during scoped checks.
- Allow manual deletion of failed or interrupted task records and dismissal of failed repository check results without deleting skill files. Clearing finished records preserves running tasks and unresolved failures.
- Continue GitHub repository checks and imports in the background when clicking outside the Add Skills dialog. Keep name conflicts in Pending with a Continue import action; support stopping and retrying background imports. Explicit Cancel still cancels the current dialog operation.

## 1.1.1 - 2026-09-23

- Add an Update skills confirmation dialog with Last results, Check updates, Update stars and Cancel. Refresh repository stars independently, with progress and retries in background tasks.
- Show Update status and check timestamps in the status bar. Move Delete & reimport to the footer and apply selected replacements separately from regular updates.
- Toggle repository names between owner/repository and repository@owner, sorting by the displayed name. Place format and expand/collapse controls on the right of the name header.
- Append and deduplicate AI tag suggestions while preserving existing tags. Fix notes and tags save/clear buttons changing together.
- Dismiss search scope filters on focus loss, outside clicks or Escape.
- Unify common action icons and show platform-specific icons in Settings. Refine background task layout and manual stop, retry and cleanup controls.
- Preserve repository stars and cache timestamps in local and WebDAV backups, with support for older backups. Add star counts to directory CSV exports.

## 1.1.0 - 2026-09-22

- Unify GitHub and local imports, simplify the import wizard, and distinguish add, update and refresh with icon-only buttons and tooltips.
- Add collapsible repositories, status filters, a resizable update dialog, selected-repository checks and footer retries for failed checks; serialize checks and writes within each repository.
- Detect overwrite conflicts by the actual destination, avoiding false conflicts for matching IDs in different repositories; preserve destination IDs on reimport.
- Validate content versions before applying updates and accept retries of completed additions or updates. Group replacement candidates under remote deletions with a Delete and reimport action.
- Add tag renaming, deletion, batch drag-and-drop assignment, filter clearing, notes editing and configurable search scopes.
- Add custom platform icons, sidebar management and counts, plus context-sensitive status statistics.
- Add Ctrl+F search focus and Esc to clear and leave search; refresh bilingual documentation and feature screenshots.

## 1.0.0 - 2026-09-18

- Release SkillsHub 1.0.0 with a skill resource library, collections, a central skills directory, and installation management for platforms and projects.
- Support skill imports, updates from source repositories, AI explanations, and backups.
- Improve Git ignore rules to exclude build caches, local application data, and key files.
