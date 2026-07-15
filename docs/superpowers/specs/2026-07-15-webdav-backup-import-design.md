# WebDAV Backup And Import Design

Date: 2026-07-15

## Scope

This change extends the existing app backup workflow with selectable backup content and WebDAV upload/import support.

The feature keeps the current JSON backup format as the single backup artifact shape. Local export/import and WebDAV export/import use the same backend backup model and import path.

WebDAV connection details are session-only UI state. The app must not persist the WebDAV URL, username, password, token, or remote directory to SQLite settings or to any backup file.

## Backup Content Options

The Settings backup card will expose checkboxes for backup content:

- Skill Resource Library
- Central Skills Library
- App configuration
- Platform installation records

The default selection will include all four options, matching the current broad backup behavior plus platform installation records.

Skill Resource Library exports include resource-backed skills, their files, source metadata, and editable metadata.

Central Skills Library exports include central skills, their files, source metadata, and editable metadata.

App configuration exports include collections, collection memberships, scan directories, custom platforms, marketplace registries, marketplace skill cache rows, and non-secret settings such as Central Skills path and Skill Resource Library path. Existing sensitive-setting filtering remains in place and continues to exclude keys containing `api_key`, `token`, `secret`, `password`, or `pat`.

Platform installation record exports include rows from `skill_installations`, so the backup can preserve which platforms a skill was installed to. The import restores those rows to the database. It does not rewrite every platform directory by itself; the existing scan/install mechanisms remain responsible for filesystem state.

## Backend Commands

`src-tauri/src/commands/backup.rs` will remain the main implementation module.

New serializable request and response types:

- `BackupOptions`
- `WebDavConfig`
- `WebDavBackupFile`

Existing commands will be extended or supplemented so local backups can also pass `BackupOptions`:

- `export_app_backup(options) -> String`
- `import_app_backup(json) -> ()`

New WebDAV commands:

- `list_webdav_backups(config) -> Vec<WebDavBackupFile>`
- `upload_webdav_backup(config, options) -> WebDavBackupFile`
- `download_webdav_backup(config, remote_path) -> String`

`list_webdav_backups` sends a WebDAV `PROPFIND` request for the configured remote directory and returns JSON backup files sorted newest first when remote metadata is available.

`upload_webdav_backup` generates a JSON backup using the selected options, creates a filename like `skillshub-backup-YYYY-MM-DD-HHMMSS.json`, and uploads it with `PUT`.

`download_webdav_backup` downloads the selected JSON file with `GET`. The frontend then passes the JSON to `import_app_backup`, keeping import behavior shared with local files.

## WebDAV Path And Auth Safety

The backend will normalize WebDAV base URLs and remote directory paths before requests. Remote file selections must come from `list_webdav_backups` results or pass the same relative-path validation used for local backup file entries.

The backend will reject empty base URLs, non-HTTP(S) URLs, empty remote directories, absolute filesystem paths, and remote paths containing unsafe traversal such as `..`.

Authentication uses Basic Auth when username and password/token are provided. Empty credentials are allowed for servers that do not require authentication.

WebDAV credentials must not be written to the app database, logs, backup JSON, or error messages.

## Frontend UI

`SettingsView` keeps the existing "Backup and migration" card and expands it.

The card will contain:

- Backup content checkboxes.
- Existing local "Export backup" and "Import backup" actions, now honoring the selected backup content during export.
- WebDAV URL, username, password/token, and remote directory inputs.
- "Refresh remote backups" action.
- A remote backup list or select control populated from WebDAV.
- "Upload backup to WebDAV" action.
- "Import selected WebDAV backup" action.

The WebDAV form state lives only inside React component state. Leaving or refreshing the page clears it.

The UI remains bilingual through the existing i18n files.

## Data Flow

Local export:

1. User chooses backup content.
2. Frontend calls `export_app_backup({ options })`.
3. Backend returns JSON.
4. Frontend downloads the JSON file.

Local import:

1. User chooses a local JSON file.
2. Frontend reads it.
3. Frontend calls `import_app_backup({ json })`.
4. Frontend refreshes platform counts, scan directories, Central Skills, Resource Library, and GitHub token state.

WebDAV upload:

1. User fills session-only WebDAV connection fields.
2. User chooses backup content.
3. Frontend calls `upload_webdav_backup({ config, options })`.
4. Backend generates JSON and uploads it.
5. Frontend refreshes the remote backup list.

WebDAV import:

1. User fills session-only WebDAV connection fields.
2. User refreshes the remote backup list.
3. User selects a backup file.
4. Frontend calls `download_webdav_backup({ config, remotePath })`.
5. Frontend passes the returned JSON to `import_app_backup`.
6. Frontend refreshes app state using the same refresh path as local import.

## Error Handling

Backend WebDAV errors should produce concise user-facing errors without including credentials.

The frontend disables conflicting backup actions while one backup operation is running. It shows loading indicators on refresh, upload, and import actions.

Import keeps the existing schema-version validation. Unsupported schema versions are rejected.

## Testing

Rust tests will cover:

- Exporting with only Skill Resource Library selected excludes Central Skills and app configuration.
- Exporting with only Central Skills selected excludes resource-backed skills.
- Export/import preserves `skill_installations`.
- Sensitive settings remain excluded.
- WebDAV path normalization rejects unsafe paths.

Frontend store tests will cover:

- `exportAppBackup(options)` sends options to `export_app_backup`.
- WebDAV list, upload, and download actions call the expected Tauri commands with config passed only as call arguments.

Settings view tests will cover:

- Backup content checkboxes render checked by default.
- Local export uses the selected backup options.
- Refreshing WebDAV backups renders returned remote files.
- Uploading to WebDAV calls the store action and refreshes the list.
- Importing a selected WebDAV backup downloads JSON, imports it, and refreshes app state.
