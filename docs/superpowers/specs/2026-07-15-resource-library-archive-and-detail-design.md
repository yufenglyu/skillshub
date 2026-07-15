# Resource Library Archive And Detail Design

## Scope

This design covers the next increment for SkillsHub resource-library workflows:

- Change WebDAV/local backup export from a JSON-only file to a compressed archive that stores skill files as files.
- Add directory deletion in the resource library directory view.
- Add manual skill creation from the resource library page.
- Adjust the skill detail drawer layout and sidebar editing model.

The existing WebDAV connection UI, backup option checkboxes, GitHub import flow, skill card model, and central/platform installation behavior remain in place unless noted below.

## Backup Archive Format

Backups will use a ZIP archive with a `.zip` filename. The archive layout is:

```text
manifest.json
resource-library/**
central-library/**
```

`manifest.json` is the only JSON metadata file. It stores the backup schema version, selected backup options, app configuration, agents, scan directories, collections, source metadata, marketplace/source records, and central/platform installation relationships. It does not store skill file bodies.

When the resource library option is selected, the exporter copies the local skill resource library file tree into `resource-library/`. When the central library option is selected, it copies the central library file tree into `central-library/`. Existing settings that should never be backed up, such as API keys, tokens, passwords, and credential URLs, stay excluded.

Import accepts the new ZIP archive and keeps compatibility with existing JSON backups by detecting whether the input is JSON or ZIP. ZIP import validates every entry before writing files: absolute paths, drive-prefixed paths, parent traversal, empty names, duplicate conflicting file/directory paths, and unsafe symlink targets are rejected. Files are restored under the current machine's configured resource and central roots, not under paths saved from another machine.

WebDAV upload/download will store and retrieve the ZIP bytes. Listing continues to show backup files sorted by remote modified time or filename timestamp, with `.zip` as the generated suffix. Local export downloads a `.zip`, and local import reads either `.zip` or legacy `.json`.

## Resource Library Directory Deletion

The resource library directory view will support deleting a directory under the configured resource library root. The root itself cannot be deleted through this action.

The backend command receives a normalized resource-library relative directory path and a delete option:

- Preview returns contained skills, file count, and platform/central installation references.
- Delete removes the directory from disk and removes contained skills from the database.
- If contained skills are installed to central or platforms, the confirmation dialog offers a cascade option that removes those installation records and generated links/copies.

The implementation will reuse the central bundle delete patterns where practical, but path validation will be scoped to the resource library root. Any relative path that escapes the root is rejected before preview or delete.

## Manual Skill Creation

The resource library page adds a `Manual Create` button after the existing GitHub import button.

The creation dialog collects:

- Skill folder name/id.
- Display name.
- Description.
- Optional initial Markdown body.
- Optional basic/source fields for manually maintained metadata.

Creation writes a new directory under the configured resource library root and creates `SKILL.md` with valid frontmatter. It registers the skill as a resource-library skill with manual source metadata. The operation fails if the target directory already exists, if the skill id is invalid, or if the generated path would escape the resource library root.

Manual creation does not automatically install the skill to the central library or any platform.

## Skill Detail Drawer And Sidebar

The skill detail drawer opens at full viewport width instead of a half-width panel. The backdrop and close behavior remain unchanged.

The main content tab list becomes:

- Markdown
- Raw source

The existing AI explanation tab is removed. AI generation moves into the sidebar as an `AI Generate Note` action in the notes section. Pressing it reuses the current AI explanation backend flow and fills the notes draft with the generated text. The user still explicitly saves the note.

Notes and tags become separate sidebar sections. Each section can save independently while preserving the other field.

The current `Source information` section is merged into `Basic information`. GitHub, marketplace, and other imported skills show source/basic fields as read-only. Manually created skills, and legacy resource-library skills that have no GitHub repository/source record, can edit those basic/source fields.

## Data Flow

Backup export:

1. Load selected backup options.
2. Build `manifest.json` from database records and app settings.
3. Add selected library file trees to the ZIP archive.
4. Return ZIP bytes for local export or upload them to WebDAV.

Backup import:

1. Detect JSON versus ZIP.
2. For ZIP, validate all paths and parse `manifest.json`.
3. Restore selected file trees to current configured roots.
4. Restore app metadata and installation relationships from the manifest.
5. Rescan affected libraries so the UI reflects disk state.

Manual create:

1. Validate user input and target path.
2. Write `SKILL.md`.
3. Insert/update skill and source metadata.
4. Refresh the resource library store.

AI-generated notes:

1. User presses the sidebar action.
2. Existing explanation generation starts for the selected skill.
3. The generated explanation is copied into the notes draft.
4. User saves notes explicitly.

## Error Handling

Backup archive errors use existing sanitized WebDAV and backup error handling. Raw network details, credentials, tokens, and local secrets are not exposed to the UI.

Directory deletion and manual creation report clear user-facing errors for invalid names, unsafe paths, existing directories, missing `SKILL.md`, and installed-skill conflicts.

AI note generation reuses the existing recoverable error state for provider, proxy, timeout, and configuration failures. Failed generation must not overwrite an existing notes draft.

## Testing

Rust tests will cover:

- ZIP export stores skill files as archive entries, not JSON file bodies.
- ZIP import restores resource-library files and installation metadata.
- Legacy JSON backup import still works.
- ZIP import rejects unsafe and conflicting archive paths.
- WebDAV generated filenames and parser accept `.zip` backups.
- Resource directory preview/delete validates paths and cleans related records.
- Manual create writes valid `SKILL.md` and rejects existing/unsafe targets.

Frontend tests will cover:

- Settings export/import use ZIP filenames and still accept legacy JSON.
- Resource library page shows `Manual Create` after GitHub import.
- Directory view can open delete confirmation for a directory.
- Skill detail drawer uses full-width layout classes.
- The AI explanation tab is gone.
- Sidebar notes show `AI Generate Note`.
- Notes and tags save independently.
- Basic/source fields are read-only for imported skills and editable for manual skills.
