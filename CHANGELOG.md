# Changelog

[English](CHANGELOG.md) | [简体中文](CHANGELOG.zh.md)

## Unreleased

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
