# Resource Library Archive And Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement ZIP-based backups, resource-library directory deletion, manual skill creation, and the updated skill detail sidebar workflow.

**Architecture:** Keep the Rust backend as the source of truth for filesystem safety and database restoration. The frontend stores remain the IPC boundary; React pages only call store methods and render dialogs. Existing GitHub import, central delete, metadata, and AI explanation flows are reused instead of replaced.

**Tech Stack:** Rust/Tauri v2, SQLx SQLite, React 18, TypeScript, Zustand, Vitest, cargo test.

## Global Constraints

- Backup archives use ZIP with `manifest.json` plus selected library file trees.
- `manifest.json` must not store skill file bodies.
- Existing JSON backups remain importable.
- Credential-like settings, tokens, passwords, API keys, and secret URLs remain excluded from backup.
- Directory deletion and manual creation must reject paths outside the configured resource library root.
- AI generation fills the notes draft and does not auto-save.
- Imported GitHub/marketplace source fields are read-only; manual/legacy local resource skills can edit basic source fields.
- User-visible strings must go through i18n.

---

### Task 1: Backup Archive Backend

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/commands/backup.rs`
- Test: `src-tauri/src/commands/backup.rs`

**Interfaces:**
- Produces: `export_app_backup(state, options) -> Result<Vec<u8>, String>`
- Produces: `import_app_backup(state, bytes) -> Result<(), String>`
- Produces: WebDAV upload/download ZIP bytes and `.zip` generated filenames.
- Preserves: legacy JSON import path by detecting JSON bytes.

- [x] Write Rust tests for ZIP export containing `manifest.json` and resource files without file-body JSON.
- [x] Run the targeted Rust backup tests and confirm the new tests fail because ZIP export is not implemented.
- [x] Add ZIP archive creation and manifest-only serialization.
- [x] Add ZIP import with path validation and legacy JSON detection.
- [x] Update WebDAV helpers to upload/download bytes and generate/list `.zip` backup files.
- [x] Run `cd src-tauri && cargo test commands::backup::`.

### Task 2: Backup Frontend Integration

**Files:**
- Modify: `src/stores/settingsStore.ts`
- Modify: `src/pages/SettingsView.tsx`
- Modify: `src/test/settingsStore.test.ts`
- Modify: `src/test/SettingsView.test.tsx`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/zh.json`

**Interfaces:**
- Consumes: backend backup export/import bytes.
- Produces: local `.zip` download, local `.zip`/legacy `.json` import, WebDAV list/import/upload UI still using store methods.

- [x] Write frontend tests expecting `.zip` filenames and byte-based import/export calls.
- [x] Run targeted Vitest tests and confirm they fail on the current JSON assumptions.
- [x] Update the settings store to convert Tauri byte arrays to `Uint8Array` and pass import bytes.
- [x] Update local export/import UI for `.zip` plus legacy `.json`.
- [x] Update WebDAV tests and labels only where suffix assumptions changed.
- [x] Run `pnpm test -- src/test/settingsStore.test.ts src/test/SettingsView.test.tsx`.

### Task 3: Resource Library Directory Delete Backend

**Files:**
- Modify: `src-tauri/src/commands/skills.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/commands/skills.rs`

**Interfaces:**
- Produces: `preview_delete_resource_skill_bundle(relative_path) -> Result<DeletePreview, String>`
- Produces: `delete_resource_skill_bundle(relative_path, options) -> Result<DeleteResult, String>`
- Reuses central delete result shapes where possible.

- [x] Write Rust tests for preview/delete of a resource-library subdirectory.
- [x] Write Rust tests rejecting root deletion and traversal paths.
- [x] Run targeted skills tests and confirm failures for missing commands.
- [x] Implement resource-root path resolution, preview, delete, and command registration.
- [x] Run `cd src-tauri && cargo test resource_skill_bundle`.

### Task 4: Manual Skill Creation Backend And Store

**Files:**
- Modify: `src-tauri/src/commands/skills.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/stores/resourceLibraryStore.ts`
- Modify: `src/types/index.ts`
- Test: `src-tauri/src/commands/skills.rs`
- Test: resource library store tests if present.

**Interfaces:**
- Produces: `create_manual_resource_skill(input) -> Result<Skill, String>`
- Produces: store method `createManualSkill(input)`.

- [x] Write Rust tests for valid manual creation and unsafe/existing target rejection.
- [x] Run targeted skills tests and confirm missing command failure.
- [x] Implement SKILL.md frontmatter writing, DB upsert, and manual source metadata.
- [x] Add TypeScript types and store method.
- [x] Run `cd src-tauri && cargo test manual_resource_skill`.

### Task 5: Resource Library UI

**Files:**
- Modify: `src/pages/ResourceLibraryView.tsx`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/zh.json`
- Test: `src/test/ResourceLibraryView.test.tsx`

**Interfaces:**
- Consumes: manual create and resource directory delete store methods.
- Produces: `Manual Create` button after GitHub import and directory delete confirmation in directory view.

- [x] Write tests for the new manual create button position and directory delete confirmation.
- [x] Run the resource library view test and confirm failures.
- [x] Add the manual creation dialog and wire successful creation to refresh.
- [x] Add directory delete action in directory view with preview and cascade confirmation.
- [x] Run `pnpm test -- src/test/ResourceLibraryView.test.tsx`.

### Task 6: Skill Detail Layout And Sidebar

**Files:**
- Modify: `src/components/skill/SkillDetailDrawer.tsx`
- Modify: `src/components/skill/SkillDetailView.tsx`
- Modify: `src/stores/skillDetailStore.ts`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/zh.json`
- Test: `src/test/SkillDetailDrawer.test.tsx`
- Test: `src/test/SkillDetailView.test.tsx`
- Test: `src/test/skillDetailStore.test.ts`

**Interfaces:**
- Consumes: existing explanation generation methods.
- Produces: full-width drawer, no AI tab, notes AI-generation action, split notes/tags saves, merged basic/source section.

- [x] Write tests for full-width drawer class, removed AI tab, AI generate note button, independent notes/tags saves, and editable source rules.
- [x] Run targeted skill detail tests and confirm failures.
- [x] Update drawer width.
- [x] Remove the explanation tab from main content.
- [x] Move explanation generation into notes section and copy generated content into notes draft.
- [x] Split notes and tags sections.
- [x] Merge source information into basic information with manual-only editing.
- [x] Run `pnpm test -- src/test/SkillDetailDrawer.test.tsx src/test/SkillDetailView.test.tsx src/test/SkillDetailPage.test.tsx`.

### Task 7: Final Verification

**Files:**
- All modified files.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified implementation ready for review.

- [x] Run focused Rust tests for backup, resource bundle delete, and manual resource skill creation.
- [x] Run `cd src-tauri && cargo check`.
- [x] Run `cd src-tauri && cargo clippy -- -D warnings`.
- [x] Run focused frontend tests from Tasks 2, 5, and 6.
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm build`.
- [x] Review `git diff` for unintended secret/path leakage and unrelated churn.

Note: Full `cd src-tauri && cargo test` was also run. It compiled and passed the new focused coverage, but the full suite still has existing Windows path-separator and marketplace connection-classification failures outside this change set.
