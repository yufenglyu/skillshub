# WebDAV Backup And Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add selectable backup content and WebDAV backup upload/import while keeping WebDAV credentials session-only.

**Architecture:** Extend the existing JSON backup model in `backup.rs` with options and installation rows, then add WebDAV helper functions in the same command module. The frontend extends `settingsStore` with typed backup/WebDAV actions and expands the existing Settings backup card.

**Tech Stack:** Rust/Tauri v2, SQLx SQLite, reqwest, quick-xml, React 18, TypeScript, Zustand, Vitest, React Testing Library.

## Global Constraints

- WebDAV URL, username, password/token, and remote directory must not be persisted to SQLite settings.
- WebDAV credentials must not be included in backup JSON or user-facing error messages.
- Existing sensitive setting filtering remains: keys containing `api_key`, `token`, `secret`, `password`, or `pat` are excluded.
- Local and WebDAV backups use the same JSON backup format.
- Backup import restores `skill_installations` rows to the database but does not directly rewrite every platform directory.
- All user-visible text must go through `src/i18n/locales/zh.json` and `src/i18n/locales/en.json`.
- Production code changes must be preceded by failing tests.

---

## File Structure

- `src-tauri/src/commands/backup.rs`: Extend backup options, installation backup rows, import/export behavior, WebDAV helpers, and Rust tests.
- `src-tauri/src/lib.rs`: Register new WebDAV Tauri commands.
- `src-tauri/Cargo.toml`: Add `quick-xml` for parsing WebDAV `PROPFIND` XML.
- `src/types/index.ts`: Add frontend backup option, WebDAV config, and remote file types.
- `src/stores/settingsStore.ts`: Add typed backup/WebDAV store actions.
- `src/test/settingsStore.test.ts`: Cover new store command arguments.
- `src/pages/SettingsView.tsx`: Expand backup UI with checkboxes and WebDAV controls.
- `src/test/SettingsView.test.tsx`: Cover backup option defaults and WebDAV flows.
- `src/i18n/locales/zh.json`: Add Chinese UI strings.
- `src/i18n/locales/en.json`: Add English UI strings.

---

### Task 1: Backup Options And Scoped Export

**Files:**
- Modify: `src-tauri/src/commands/backup.rs`

**Interfaces:**
- Produces:
  - `pub struct BackupOptions { include_resource_library: bool, include_central_library: bool, include_app_config: bool, include_installations: bool }`
  - `impl Default for BackupOptions`
  - `pub async fn export_app_backup_impl(pool: &DbPool, options: BackupOptions) -> Result<String, String>`
  - Tauri command `export_app_backup(state, options: Option<BackupOptions>) -> Result<String, String>`
- Consumes:
  - Existing `db::get_central_skills`, `db::get_resource_library_skills`, settings, agents, collections, registry, and marketplace query helpers.

- [ ] **Step 1: Write failing Rust tests for scoped export**

Add these tests inside `#[cfg(test)] mod tests` in `src-tauri/src/commands/backup.rs`:

```rust
#[tokio::test]
async fn backup_options_resource_only_excludes_central_and_app_config() {
    let (pool, dir) = setup_test_db().await;
    db::set_setting(&pool, "language", "zh").await.expect("setting");

    let central = central_root(&pool).await.expect("central");
    let central_skill_dir = central.join("central-demo");
    std::fs::create_dir_all(&central_skill_dir).expect("central skill dir");
    std::fs::write(central_skill_dir.join("SKILL.md"), "---\nname: Central Demo\n---\n")
        .expect("central skill");
    db::upsert_skill(
        &pool,
        &Skill {
            id: "central-demo".to_string(),
            name: "Central Demo".to_string(),
            description: None,
            file_path: path_to_string(&central_skill_dir.join("SKILL.md")),
            canonical_path: Some(path_to_string(&central_skill_dir)),
            is_central: true,
            source: None,
            content: None,
            scanned_at: "2026-01-01T00:00:00Z".to_string(),
        },
    )
    .await
    .expect("central db skill");

    let resource_root = dir.path().join("resource-library");
    db::set_skill_resource_library_dir(&pool, &resource_root.to_string_lossy())
        .await
        .expect("resource dir");
    let resource_skill_dir = resource_root.join("resource-demo");
    std::fs::create_dir_all(&resource_skill_dir).expect("resource skill dir");
    std::fs::write(resource_skill_dir.join("SKILL.md"), "---\nname: Resource Demo\n---\n")
        .expect("resource skill");
    db::upsert_skill(
        &pool,
        &Skill {
            id: "resource-demo".to_string(),
            name: "Resource Demo".to_string(),
            description: None,
            file_path: path_to_string(&resource_skill_dir.join("SKILL.md")),
            canonical_path: Some(path_to_string(&resource_skill_dir)),
            is_central: false,
            source: None,
            content: None,
            scanned_at: "2026-01-01T00:00:00Z".to_string(),
        },
    )
    .await
    .expect("resource db skill");

    let json = export_app_backup_impl(
        &pool,
        BackupOptions {
            include_resource_library: true,
            include_central_library: false,
            include_app_config: false,
            include_installations: false,
        },
    )
    .await
    .expect("export");
    let backup: AppBackup = serde_json::from_str(&json).expect("backup json");

    assert!(backup.skills.iter().any(|skill| skill.skill.id == "resource-demo"));
    assert!(!backup.skills.iter().any(|skill| skill.skill.id == "central-demo"));
    assert!(backup.settings.is_empty());
    assert!(backup.agents.is_empty());
    assert!(backup.collections.is_empty());
    assert!(backup.collection_skills.is_empty());
    assert!(backup.skill_registries.is_empty());
    assert!(backup.marketplace_skills.is_empty());
}

#[tokio::test]
async fn backup_options_central_only_excludes_resource_skills() {
    let (pool, dir) = setup_test_db().await;
    let central = central_root(&pool).await.expect("central");
    let central_skill_dir = central.join("central-only-demo");
    std::fs::create_dir_all(&central_skill_dir).expect("central skill dir");
    std::fs::write(central_skill_dir.join("SKILL.md"), "---\nname: Central Only Demo\n---\n")
        .expect("central skill");
    db::upsert_skill(
        &pool,
        &Skill {
            id: "central-only-demo".to_string(),
            name: "Central Only Demo".to_string(),
            description: None,
            file_path: path_to_string(&central_skill_dir.join("SKILL.md")),
            canonical_path: Some(path_to_string(&central_skill_dir)),
            is_central: true,
            source: None,
            content: None,
            scanned_at: "2026-01-01T00:00:00Z".to_string(),
        },
    )
    .await
    .expect("central db skill");

    let resource_root = dir.path().join("resource-library");
    db::set_skill_resource_library_dir(&pool, &resource_root.to_string_lossy())
        .await
        .expect("resource dir");
    let resource_skill_dir = resource_root.join("resource-only-demo");
    std::fs::create_dir_all(&resource_skill_dir).expect("resource skill dir");
    std::fs::write(resource_skill_dir.join("SKILL.md"), "---\nname: Resource Only Demo\n---\n")
        .expect("resource skill");
    db::upsert_skill(
        &pool,
        &Skill {
            id: "resource-only-demo".to_string(),
            name: "Resource Only Demo".to_string(),
            description: None,
            file_path: path_to_string(&resource_skill_dir.join("SKILL.md")),
            canonical_path: Some(path_to_string(&resource_skill_dir)),
            is_central: false,
            source: None,
            content: None,
            scanned_at: "2026-01-01T00:00:00Z".to_string(),
        },
    )
    .await
    .expect("resource db skill");

    let json = export_app_backup_impl(
        &pool,
        BackupOptions {
            include_resource_library: false,
            include_central_library: true,
            include_app_config: false,
            include_installations: false,
        },
    )
    .await
    .expect("export");
    let backup: AppBackup = serde_json::from_str(&json).expect("backup json");

    assert!(backup.skills.iter().any(|skill| skill.skill.id == "central-only-demo"));
    assert!(!backup.skills.iter().any(|skill| skill.skill.id == "resource-only-demo"));
}
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
cd src-tauri
cargo test commands::backup::tests::backup_options_resource_only_excludes_central_and_app_config commands::backup::tests::backup_options_central_only_excludes_resource_skills
```

Expected: compilation fails because `BackupOptions` does not exist and `export_app_backup_impl` still accepts only `pool`.

- [ ] **Step 3: Implement backup options**

In `src-tauri/src/commands/backup.rs`, add:

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupOptions {
    pub include_resource_library: bool,
    pub include_central_library: bool,
    pub include_app_config: bool,
    pub include_installations: bool,
}

impl Default for BackupOptions {
    fn default() -> Self {
        Self {
            include_resource_library: true,
            include_central_library: true,
            include_app_config: true,
            include_installations: true,
        }
    }
}
```

Update the command and implementation signatures:

```rust
#[tauri::command]
pub async fn export_app_backup(
    state: State<'_, AppState>,
    options: Option<BackupOptions>,
) -> Result<String, String> {
    export_app_backup_impl(&state.db, options.unwrap_or_default()).await
}

async fn export_app_backup_impl(pool: &DbPool, options: BackupOptions) -> Result<String, String> {
```

Add an `included` field to `AppBackup`:

```rust
#[serde(default)]
included: BackupOptions,
```

Gate skill collection:

```rust
if options.include_central_library {
    let central_skills = db::get_central_skills(pool).await?;
    append_skill_backups(pool, &mut skill_backups, central_skills, &central_root, "central").await?;
}

if options.include_resource_library {
    let resource_skills = db::get_resource_library_skills(pool).await?;
    append_skill_backups(pool, &mut skill_backups, resource_skills, &resource_root, "resource").await?;
}
```

Gate app config fields by using empty vectors when `include_app_config` is false. Keep `central_root` in the backup metadata for compatibility:

```rust
let (
    collections,
    collection_skills,
    settings,
    agents,
    scan_directories,
    skill_registries,
    marketplace_skills,
) = if options.include_app_config {
    (
        db::get_all_collections(pool).await?,
        sqlx::query_as::<_, CollectionSkillBackup>(
            "SELECT collection_id, skill_id, added_at FROM collection_skills ORDER BY collection_id, added_at",
        )
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?,
        sqlx::query_as::<_, SettingBackup>("SELECT key, value FROM settings ORDER BY key")
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?
            .into_iter()
            .filter(|setting| !is_sensitive_setting_key(&setting.key))
            .collect(),
        db::get_all_agents(pool).await?,
        db::get_scan_directories(pool).await?,
        sqlx::query_as::<_, SkillRegistryBackup>(
            "SELECT id, name, source_type, url, is_builtin, is_enabled, last_synced,
                    last_attempted_sync, last_sync_status, last_sync_error,
                    cache_updated_at, cache_expires_at, etag, last_modified, created_at
             FROM skill_registries ORDER BY is_builtin DESC, name",
        )
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?,
        sqlx::query_as::<_, MarketplaceSkillBackup>(
            "SELECT id, registry_id, name, description, download_url, is_installed,
                    synced_at, cache_updated_at
             FROM marketplace_skills ORDER BY registry_id, name",
        )
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?,
    )
} else {
    (Vec::new(), Vec::new(), Vec::new(), Vec::new(), Vec::new(), Vec::new(), Vec::new())
};
```

Assign these variables in `AppBackup`.

- [ ] **Step 4: Run tests and verify they pass**

Run:

```bash
cd src-tauri
cargo test commands::backup::tests::backup_options_resource_only_excludes_central_and_app_config commands::backup::tests::backup_options_central_only_excludes_resource_skills
```

Expected: both tests pass.

- [ ] **Step 5: Run existing backup tests**

Run:

```bash
cd src-tauri
cargo test commands::backup::
```

Expected: all backup tests pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/backup.rs
git commit -m "feat: add selectable backup export options"
```

---

### Task 2: Preserve Platform Installation Records

**Files:**
- Modify: `src-tauri/src/commands/backup.rs`

**Interfaces:**
- Consumes:
  - `db::SkillInstallation`
  - `db::upsert_skill_installation(pool, &SkillInstallation)`
- Produces:
  - `AppBackup.skill_installations: Vec<SkillInstallation>`

- [ ] **Step 1: Write failing Rust test for installation roundtrip**

Add this test in `src-tauri/src/commands/backup.rs`:

```rust
#[tokio::test]
async fn backup_roundtrip_preserves_skill_installations() {
    let (pool, _dir) = setup_test_db().await;
    let central = central_root(&pool).await.expect("central");
    let skill_dir = central.join("installed-demo");
    std::fs::create_dir_all(&skill_dir).expect("skill dir");
    std::fs::write(skill_dir.join("SKILL.md"), "---\nname: Installed Demo\n---\n").expect("skill");

    db::upsert_skill(
        &pool,
        &Skill {
            id: "installed-demo".to_string(),
            name: "Installed Demo".to_string(),
            description: None,
            file_path: path_to_string(&skill_dir.join("SKILL.md")),
            canonical_path: Some(path_to_string(&skill_dir)),
            is_central: true,
            source: None,
            content: None,
            scanned_at: "2026-01-01T00:00:00Z".to_string(),
        },
    )
    .await
    .expect("skill");
    db::upsert_skill_installation(
        &pool,
        &db::SkillInstallation {
            skill_id: "installed-demo".to_string(),
            agent_id: "claude-code".to_string(),
            installed_path: "/tmp/.claude/skills/installed-demo".to_string(),
            link_type: "symlink".to_string(),
            symlink_target: Some(path_to_string(&skill_dir)),
            created_at: "2026-01-02T00:00:00Z".to_string(),
        },
    )
    .await
    .expect("installation");

    let json = export_app_backup_impl(&pool, BackupOptions::default())
        .await
        .expect("export");
    sqlx::query("DELETE FROM skill_installations WHERE skill_id = ?")
        .bind("installed-demo")
        .execute(&pool)
        .await
        .expect("delete installation");

    import_app_backup_impl(&pool, &json).await.expect("import");

    let installations = db::get_skill_installations(&pool, "installed-demo")
        .await
        .expect("installations");
    assert_eq!(installations.len(), 1);
    assert_eq!(installations[0].agent_id, "claude-code");
    assert_eq!(installations[0].link_type, "symlink");
    assert_eq!(
        installations[0].symlink_target.as_deref(),
        Some(path_to_string(&skill_dir).as_str())
    );
}
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
cd src-tauri
cargo test commands::backup::tests::backup_roundtrip_preserves_skill_installations
```

Expected: fails because the backup does not include `skill_installations`.

- [ ] **Step 3: Implement installation export/import**

Import `SkillInstallation` at the top:

```rust
db::{self, Agent, Collection, DbPool, ScanDirectory, Skill, SkillInstallation, SkillMetadata, SkillSource},
```

Add to `AppBackup`:

```rust
#[serde(default)]
skill_installations: Vec<SkillInstallation>,
```

During export, populate only when `options.include_installations` is true:

```rust
let skill_installations = if options.include_installations {
    sqlx::query_as::<_, SkillInstallation>(
        "SELECT skill_id, agent_id, installed_path, link_type, symlink_target, created_at
         FROM skill_installations
         ORDER BY skill_id, agent_id",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?
} else {
    Vec::new()
};
```

Assign `skill_installations` in `AppBackup`.

During import, after skills are restored and before collection membership import, restore rows:

```rust
for installation in backup.skill_installations {
    db::upsert_skill_installation(pool, &installation).await?;
}
```

- [ ] **Step 4: Run test and verify it passes**

Run:

```bash
cd src-tauri
cargo test commands::backup::tests::backup_roundtrip_preserves_skill_installations
```

Expected: test passes.

- [ ] **Step 5: Run backup test module**

Run:

```bash
cd src-tauri
cargo test commands::backup::
```

Expected: all backup tests pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/backup.rs
git commit -m "feat: include platform installation records in backups"
```

---

### Task 3: WebDAV Backend Commands

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/commands/backup.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces:
  - `pub struct WebDavConfig { base_url: String, username: Option<String>, password: Option<String>, remote_dir: String }`
  - `pub struct WebDavBackupFile { name: String, remote_path: String, size: Option<u64>, modified_at: Option<String> }`
  - Tauri commands `list_webdav_backups`, `upload_webdav_backup`, `download_webdav_backup`

- [ ] **Step 1: Write failing Rust path validation tests**

Add tests to `src-tauri/src/commands/backup.rs`:

```rust
#[test]
fn webdav_normalize_remote_path_rejects_traversal() {
    let result = normalize_webdav_remote_path("../secret.json");
    assert!(result.is_err());
}

#[test]
fn webdav_normalize_remote_path_accepts_nested_json_backup() {
    let result = normalize_webdav_remote_path("backups/skillshub-backup.json")
        .expect("normalized path");
    assert_eq!(result, "backups/skillshub-backup.json");
}

#[test]
fn webdav_normalize_base_url_rejects_non_http_urls() {
    let result = normalize_webdav_base_url("file:///tmp/backups");
    assert!(result.is_err());
}

#[test]
fn webdav_normalize_base_url_trims_trailing_slash() {
    let result = normalize_webdav_base_url("https://example.com/dav/")
        .expect("normalized url");
    assert_eq!(result, "https://example.com/dav");
}
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
cd src-tauri
cargo test commands::backup::tests::webdav_normalize_remote_path_rejects_traversal commands::backup::tests::webdav_normalize_remote_path_accepts_nested_json_backup commands::backup::tests::webdav_normalize_base_url_rejects_non_http_urls commands::backup::tests::webdav_normalize_base_url_trims_trailing_slash
```

Expected: compilation fails because the normalization helpers do not exist.

- [ ] **Step 3: Add dependency**

In `src-tauri/Cargo.toml`, add:

```toml
quick-xml = "0.37"
```

- [ ] **Step 4: Implement WebDAV types and path helpers**

In `backup.rs`, add imports:

```rust
use quick_xml::events::Event;
use reqwest::{Client, Method, Url};
```

Add types:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebDavConfig {
    pub base_url: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub remote_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WebDavBackupFile {
    pub name: String,
    pub remote_path: String,
    pub size: Option<u64>,
    pub modified_at: Option<String>,
}
```

Add helpers:

```rust
fn normalize_webdav_base_url(value: &str) -> Result<String, String> {
    let trimmed = value.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("WebDAV URL cannot be empty".to_string());
    }
    let url = Url::parse(trimmed).map_err(|_| "WebDAV URL is invalid".to_string())?;
    match url.scheme() {
        "http" | "https" => Ok(trimmed.to_string()),
        _ => Err("WebDAV URL must use http or https".to_string()),
    }
}

fn normalize_webdav_remote_path(value: &str) -> Result<String, String> {
    let trimmed = value.trim().trim_matches('/');
    if trimmed.is_empty() {
        return Err("WebDAV remote path cannot be empty".to_string());
    }
    let path = Path::new(trimmed);
    if path.is_absolute() {
        return Err("WebDAV remote path must be relative".to_string());
    }
    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => parts.push(part.to_string_lossy().to_string()),
            _ => return Err("WebDAV remote path contains unsafe traversal".to_string()),
        }
    }
    if parts.is_empty() {
        return Err("WebDAV remote path cannot be empty".to_string());
    }
    Ok(parts.join("/"))
}

fn build_webdav_url(config: &WebDavConfig, remote_path: &str) -> Result<String, String> {
    let base = normalize_webdav_base_url(&config.base_url)?;
    let remote_dir = normalize_webdav_remote_path(&config.remote_dir)?;
    let remote_path = normalize_webdav_remote_path(remote_path)?;
    Ok(format!("{}/{}/{}", base, remote_dir, remote_path))
}
```

- [ ] **Step 5: Run path tests and verify they pass**

Run:

```bash
cd src-tauri
cargo test commands::backup::tests::webdav_normalize
```

Expected: path normalization tests pass.

- [ ] **Step 6: Implement WebDAV commands**

Add auth helper:

```rust
fn apply_webdav_auth(
    builder: reqwest::RequestBuilder,
    config: &WebDavConfig,
) -> reqwest::RequestBuilder {
    match (config.username.as_deref(), config.password.as_deref()) {
        (Some(username), Some(password)) if !username.is_empty() || !password.is_empty() => {
            builder.basic_auth(username.to_string(), Some(password.to_string()))
        }
        _ => builder,
    }
}
```

Add command functions:

```rust
#[tauri::command]
pub async fn list_webdav_backups(config: WebDavConfig) -> Result<Vec<WebDavBackupFile>, String> {
    list_webdav_backups_impl(config).await
}

#[tauri::command]
pub async fn upload_webdav_backup(
    state: State<'_, AppState>,
    config: WebDavConfig,
    options: Option<BackupOptions>,
) -> Result<WebDavBackupFile, String> {
    let json = export_app_backup_impl(&state.db, options.unwrap_or_default()).await?;
    upload_webdav_backup_impl(config, json).await
}

#[tauri::command]
pub async fn download_webdav_backup(
    config: WebDavConfig,
    remote_path: String,
) -> Result<String, String> {
    download_webdav_backup_impl(config, &remote_path).await
}
```

Implement `upload_webdav_backup_impl` with `PUT`:

```rust
async fn upload_webdav_backup_impl(
    config: WebDavConfig,
    json: String,
) -> Result<WebDavBackupFile, String> {
    let filename = format!("skillshub-backup-{}.json", Utc::now().format("%Y-%m-%d-%H%M%S"));
    let url = build_webdav_url(&config, &filename)?;
    let client = Client::new();
    let response = apply_webdav_auth(
        client.put(&url).header("Content-Type", "application/json").body(json.clone()),
        &config,
    )
    .send()
    .await
    .map_err(|e| format!("WebDAV upload failed: {}", sanitize_webdav_error(e)))?;
    if !response.status().is_success() {
        return Err(format!("WebDAV upload failed with status {}", response.status()));
    }
    Ok(WebDavBackupFile {
        name: filename.clone(),
        remote_path: filename,
        size: Some(json.len() as u64),
        modified_at: Some(Utc::now().to_rfc3339()),
    })
}
```

Implement `download_webdav_backup_impl` with `GET`:

```rust
async fn download_webdav_backup_impl(
    config: WebDavConfig,
    remote_path: &str,
) -> Result<String, String> {
    let url = build_webdav_url(&config, remote_path)?;
    let client = Client::new();
    let response = apply_webdav_auth(client.get(&url), &config)
        .send()
        .await
        .map_err(|e| format!("WebDAV download failed: {}", sanitize_webdav_error(e)))?;
    if !response.status().is_success() {
        return Err(format!("WebDAV download failed with status {}", response.status()));
    }
    response
        .text()
        .await
        .map_err(|e| format!("WebDAV download failed: {}", sanitize_webdav_error(e)))
}
```

Implement `list_webdav_backups_impl` with `PROPFIND`; the parser collects `.json` hrefs and optional `getcontentlength`/`getlastmodified` fields:

```rust
async fn list_webdav_backups_impl(config: WebDavConfig) -> Result<Vec<WebDavBackupFile>, String> {
    let base = normalize_webdav_base_url(&config.base_url)?;
    let remote_dir = normalize_webdav_remote_path(&config.remote_dir)?;
    let url = format!("{}/{}", base, remote_dir);
    let method = Method::from_bytes(b"PROPFIND").map_err(|e| e.to_string())?;
    let client = Client::new();
    let response = apply_webdav_auth(client.request(method, &url).header("Depth", "1"), &config)
        .send()
        .await
        .map_err(|e| format!("WebDAV list failed: {}", sanitize_webdav_error(e)))?;
    if !response.status().is_success() {
        return Err(format!("WebDAV list failed with status {}", response.status()));
    }
    let body = response
        .text()
        .await
        .map_err(|e| format!("WebDAV list failed: {}", sanitize_webdav_error(e)))?;
    parse_webdav_backup_files(&body)
}
```

Add `parse_webdav_backup_files` using `quick_xml::Reader`:

```rust
#[derive(Default)]
struct WebDavResponseEntry {
    href: Option<String>,
    content_length: Option<u64>,
    last_modified: Option<String>,
}

fn parse_webdav_backup_files(xml: &str) -> Result<Vec<WebDavBackupFile>, String> {
    let mut reader = quick_xml::Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut files = Vec::new();
    let mut current = WebDavResponseEntry::default();
    let mut in_response = false;
    let mut active_tag: Option<String> = None;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(event)) => {
                let name = String::from_utf8_lossy(event.name().as_ref()).to_string();
                if name.ends_with("response") {
                    in_response = true;
                    current = WebDavResponseEntry::default();
                } else if in_response {
                    active_tag = Some(name);
                }
            }
            Ok(Event::Text(text)) if in_response => {
                let value = text
                    .unescape()
                    .map_err(|e| format!("Invalid WebDAV XML: {}", e))?
                    .to_string();
                match active_tag.as_deref() {
                    Some(tag) if tag.ends_with("href") => current.href = Some(value),
                    Some(tag) if tag.ends_with("getcontentlength") => {
                        current.content_length = value.parse::<u64>().ok();
                    }
                    Some(tag) if tag.ends_with("getlastmodified") => {
                        current.last_modified = Some(value);
                    }
                    _ => {}
                }
            }
            Ok(Event::End(event)) => {
                let name = String::from_utf8_lossy(event.name().as_ref()).to_string();
                if name.ends_with("response") {
                    if let Some(file) = webdav_entry_to_backup_file(&current)? {
                        files.push(file);
                    }
                    in_response = false;
                    active_tag = None;
                } else if in_response {
                    active_tag = None;
                }
            }
            Ok(Event::Eof) => break,
            Err(error) => return Err(format!("Invalid WebDAV XML: {}", error)),
            _ => {}
        }
        buf.clear();
    }

    files.sort_by(|a, b| {
        b.modified_at
            .cmp(&a.modified_at)
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(files)
}

fn webdav_entry_to_backup_file(
    entry: &WebDavResponseEntry,
) -> Result<Option<WebDavBackupFile>, String> {
    let Some(href) = entry.href.as_deref() else {
        return Ok(None);
    };
    let decoded = href.trim_end_matches('/');
    if !decoded.ends_with(".json") {
        return Ok(None);
    }
    let name = decoded
        .rsplit('/')
        .next()
        .unwrap_or(decoded)
        .to_string();
    if name.is_empty() {
        return Ok(None);
    }
    Ok(Some(WebDavBackupFile {
        name: name.clone(),
        remote_path: normalize_webdav_remote_path(&name)?,
        size: entry.content_length,
        modified_at: entry.last_modified.clone(),
    }))
}
```

Add `sanitize_webdav_error`:

```rust
fn sanitize_webdav_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "request timed out".to_string()
    } else if error.is_connect() {
        "connection failed".to_string()
    } else {
        error.without_url().to_string()
    }
}
```

- [ ] **Step 7: Register Tauri commands**

In `src-tauri/src/lib.rs`, add to `tauri::generate_handler!` under Backup:

```rust
commands::backup::list_webdav_backups,
commands::backup::upload_webdav_backup,
commands::backup::download_webdav_backup,
```

- [ ] **Step 8: Run backend verification**

Run:

```bash
cd src-tauri
cargo test commands::backup::
cargo check
```

Expected: backup tests pass and backend compiles.

- [ ] **Step 9: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/commands/backup.rs src-tauri/src/lib.rs
git commit -m "feat: add webdav backup commands"
```

---

### Task 4: Settings Store Backup And WebDAV Actions

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/stores/settingsStore.ts`
- Modify: `src/test/settingsStore.test.ts`

**Interfaces:**
- Produces:
  - `BackupOptions`
  - `WebDavConfig`
  - `WebDavBackupFile`
  - Store actions `exportAppBackup(options)`, `listWebDavBackups(config)`, `uploadWebDavBackup(config, options)`, `downloadWebDavBackup(config, remotePath)`

- [ ] **Step 1: Write failing store tests**

In `src/test/settingsStore.test.ts`, add:

```ts
it("exportAppBackup passes selected options to export_app_backup", async () => {
  vi.mocked(invoke).mockResolvedValueOnce("{}");
  const options = {
    includeResourceLibrary: true,
    includeCentralLibrary: false,
    includeAppConfig: true,
    includeInstallations: false,
  };

  await useSettingsStore.getState().exportAppBackup(options);

  expect(invoke).toHaveBeenCalledWith("export_app_backup", { options });
});

it("listWebDavBackups calls list_webdav_backups with session config", async () => {
  vi.mocked(invoke).mockResolvedValueOnce([]);
  const config = {
    baseUrl: "https://example.com/dav",
    username: "user",
    password: "secret",
    remoteDir: "skillshub",
  };

  await useSettingsStore.getState().listWebDavBackups(config);

  expect(invoke).toHaveBeenCalledWith("list_webdav_backups", { config });
});

it("uploadWebDavBackup calls upload_webdav_backup with config and options", async () => {
  const file = {
    name: "skillshub-backup.json",
    remotePath: "skillshub-backup.json",
    size: 100,
    modifiedAt: "2026-07-15T00:00:00Z",
  };
  vi.mocked(invoke).mockResolvedValueOnce(file);
  const config = {
    baseUrl: "https://example.com/dav",
    username: "",
    password: "",
    remoteDir: "skillshub",
  };
  const options = {
    includeResourceLibrary: true,
    includeCentralLibrary: true,
    includeAppConfig: true,
    includeInstallations: true,
  };

  await useSettingsStore.getState().uploadWebDavBackup(config, options);

  expect(invoke).toHaveBeenCalledWith("upload_webdav_backup", { config, options });
});

it("downloadWebDavBackup calls download_webdav_backup with selected remote path", async () => {
  vi.mocked(invoke).mockResolvedValueOnce("{\"schema_version\":1}");
  const config = {
    baseUrl: "https://example.com/dav",
    username: "user",
    password: "secret",
    remoteDir: "skillshub",
  };

  await useSettingsStore.getState().downloadWebDavBackup(config, "skillshub-backup.json");

  expect(invoke).toHaveBeenCalledWith("download_webdav_backup", {
    config,
    remotePath: "skillshub-backup.json",
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
pnpm test -- src/test/settingsStore.test.ts
```

Expected: tests fail because the new types/actions do not exist and `exportAppBackup` has no options parameter.

- [ ] **Step 3: Add TypeScript types**

In `src/types/index.ts`, under Settings Types, add:

```ts
export interface BackupOptions {
  includeResourceLibrary: boolean;
  includeCentralLibrary: boolean;
  includeAppConfig: boolean;
  includeInstallations: boolean;
}

export interface WebDavConfig {
  baseUrl: string;
  username?: string | null;
  password?: string | null;
  remoteDir: string;
}

export interface WebDavBackupFile {
  name: string;
  remotePath: string;
  size?: number | null;
  modifiedAt?: string | null;
}
```

- [ ] **Step 4: Update settings store**

Update imports:

```ts
import {
  ScanDirectory,
  AgentWithStatus,
  CustomAgentConfig,
  UpdateCustomAgentConfig,
  BackupOptions,
  WebDavConfig,
  WebDavBackupFile,
} from "@/types";
```

Update `SettingsState`:

```ts
exportAppBackup: (options?: BackupOptions) => Promise<string>;
importAppBackup: (json: string) => Promise<void>;
listWebDavBackups: (config: WebDavConfig) => Promise<WebDavBackupFile[]>;
uploadWebDavBackup: (config: WebDavConfig, options?: BackupOptions) => Promise<WebDavBackupFile>;
downloadWebDavBackup: (config: WebDavConfig, remotePath: string) => Promise<string>;
```

Update actions:

```ts
exportAppBackup: async (options) => {
  return await invoke<string>("export_app_backup", { options: options ?? null });
},

listWebDavBackups: async (config) => {
  return await invoke<WebDavBackupFile[]>("list_webdav_backups", { config });
},

uploadWebDavBackup: async (config, options) => {
  return await invoke<WebDavBackupFile>("upload_webdav_backup", {
    config,
    options: options ?? null,
  });
},

downloadWebDavBackup: async (config, remotePath) => {
  return await invoke<string>("download_webdav_backup", { config, remotePath });
},
```

- [ ] **Step 5: Run store tests and verify they pass**

Run:

```bash
pnpm test -- src/test/settingsStore.test.ts
```

Expected: settings store tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/stores/settingsStore.ts src/test/settingsStore.test.ts
git commit -m "feat: add webdav backup store actions"
```

---

### Task 5: Settings Backup UI

**Files:**
- Modify: `src/pages/SettingsView.tsx`
- Modify: `src/test/SettingsView.test.tsx`
- Modify: `src/i18n/locales/zh.json`
- Modify: `src/i18n/locales/en.json`

**Interfaces:**
- Consumes:
  - Store actions from Task 4.
  - `BackupOptions`, `WebDavConfig`, `WebDavBackupFile`.
- Produces:
  - Settings backup card with content checkboxes and WebDAV listing/upload/import.

- [ ] **Step 1: Write failing SettingsView tests**

In `src/test/SettingsView.test.tsx`, extend `setupMocks` with:

```ts
listWebDavBackups = vi.fn(),
uploadWebDavBackup = vi.fn(),
downloadWebDavBackup = vi.fn(),
```

Pass those functions through the mocked settings store object.

Add tests:

```tsx
it("renders backup content checkboxes checked by default", () => {
  setupMocks();
  renderSettingsView();

  expect(screen.getByRole("checkbox", { name: "技能资源库" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "中央技能库" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "软件配置" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "技能安装的平台" })).toBeChecked();
});

it("local export uses selected backup options", async () => {
  const exportAppBackup = vi.fn().mockResolvedValue("{}");
  setupMocks({ exportAppBackup });
  renderSettingsView();

  fireEvent.click(screen.getByRole("checkbox", { name: "中央技能库" }));
  fireEvent.click(screen.getByRole("button", { name: "导出备份" }));

  await waitFor(() => {
    expect(exportAppBackup).toHaveBeenCalledWith({
      includeResourceLibrary: true,
      includeCentralLibrary: false,
      includeAppConfig: true,
      includeInstallations: true,
    });
  });
});

it("refreshes and renders WebDAV backup files", async () => {
  const listWebDavBackups = vi.fn().mockResolvedValue([
    {
      name: "skillshub-backup-2026-07-15-120000.json",
      remotePath: "skillshub-backup-2026-07-15-120000.json",
      size: 42,
      modifiedAt: "2026-07-15T12:00:00Z",
    },
  ]);
  setupMocks({ listWebDavBackups });
  renderSettingsView();

  fireEvent.change(screen.getByLabelText("WebDAV URL"), {
    target: { value: "https://example.com/dav" },
  });
  fireEvent.change(screen.getByLabelText("远端目录"), {
    target: { value: "skillshub" },
  });
  fireEvent.click(screen.getByRole("button", { name: "刷新远端备份" }));

  expect(await screen.findByText("skillshub-backup-2026-07-15-120000.json")).toBeTruthy();
});

it("uploads a WebDAV backup then refreshes the remote list", async () => {
  const listWebDavBackups = vi.fn().mockResolvedValue([]);
  const uploadWebDavBackup = vi.fn().mockResolvedValue({
    name: "skillshub-backup.json",
    remotePath: "skillshub-backup.json",
  });
  setupMocks({ listWebDavBackups, uploadWebDavBackup });
  renderSettingsView();

  fireEvent.change(screen.getByLabelText("WebDAV URL"), {
    target: { value: "https://example.com/dav" },
  });
  fireEvent.change(screen.getByLabelText("远端目录"), {
    target: { value: "skillshub" },
  });
  fireEvent.click(screen.getByRole("button", { name: "上传到 WebDAV" }));

  await waitFor(() => {
    expect(uploadWebDavBackup).toHaveBeenCalled();
  });
  expect(listWebDavBackups).toHaveBeenCalled();
});

it("imports the selected WebDAV backup", async () => {
  const downloadWebDavBackup = vi.fn().mockResolvedValue("{\"schema_version\":1}");
  const importAppBackup = vi.fn().mockResolvedValue(undefined);
  setupMocks({
    downloadWebDavBackup,
    importAppBackup,
    listWebDavBackups: vi.fn().mockResolvedValue([
      {
        name: "skillshub-backup.json",
        remotePath: "skillshub-backup.json",
      },
    ]),
  });
  renderSettingsView();

  fireEvent.change(screen.getByLabelText("WebDAV URL"), {
    target: { value: "https://example.com/dav" },
  });
  fireEvent.change(screen.getByLabelText("远端目录"), {
    target: { value: "skillshub" },
  });
  fireEvent.click(screen.getByRole("button", { name: "刷新远端备份" }));
  await screen.findByText("skillshub-backup.json");
  fireEvent.click(screen.getByRole("radio", { name: /skillshub-backup\.json/ }));
  fireEvent.click(screen.getByRole("button", { name: "导入选中的 WebDAV 备份" }));

  await waitFor(() => {
    expect(downloadWebDavBackup).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://example.com/dav", remoteDir: "skillshub" }),
      "skillshub-backup.json"
    );
  });
  expect(importAppBackup).toHaveBeenCalledWith("{\"schema_version\":1}");
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
pnpm test -- src/test/SettingsView.test.tsx
```

Expected: tests fail because the UI does not render the new controls.

- [ ] **Step 3: Add i18n strings**

In `src/i18n/locales/zh.json`, under `settings`, add:

```json
"backupContent": "备份内容",
"backupIncludeResourceLibrary": "技能资源库",
"backupIncludeCentralLibrary": "中央技能库",
"backupIncludeAppConfig": "软件配置",
"backupIncludeInstallations": "技能安装的平台",
"webdavTitle": "WebDAV 备份",
"webdavUrlLabel": "WebDAV URL",
"webdavUsernameLabel": "用户名",
"webdavPasswordLabel": "密码或 Token",
"webdavRemoteDirLabel": "远端目录",
"webdavRemoteDirPlaceholder": "skillshub",
"webdavRefresh": "刷新远端备份",
"webdavUpload": "上传到 WebDAV",
"webdavImportSelected": "导入选中的 WebDAV 备份",
"webdavNoBackups": "远端目录中暂无备份文件",
"webdavSelectBackup": "选择远端备份",
"webdavRefreshed": "远端备份列表已刷新",
"webdavUploaded": "备份已上传到 WebDAV",
"webdavImported": "WebDAV 备份已导入",
"webdavMissingConfig": "请填写 WebDAV URL 和远端目录",
"webdavMissingSelection": "请选择一个远端备份文件",
"webdavRefreshError": "刷新远端备份失败: {{error}}",
"webdavUploadError": "上传 WebDAV 备份失败: {{error}}",
"webdavImportError": "导入 WebDAV 备份失败: {{error}}",
"webdavSessionOnlyHint": "WebDAV 连接信息仅用于本次页面会话，不会保存到应用配置或备份文件。"
```

In `src/i18n/locales/en.json`, under `settings`, add equivalent strings:

```json
"backupContent": "Backup content",
"backupIncludeResourceLibrary": "Skill Resource Library",
"backupIncludeCentralLibrary": "Central Skills Library",
"backupIncludeAppConfig": "App configuration",
"backupIncludeInstallations": "Installed platforms",
"webdavTitle": "WebDAV backup",
"webdavUrlLabel": "WebDAV URL",
"webdavUsernameLabel": "Username",
"webdavPasswordLabel": "Password or token",
"webdavRemoteDirLabel": "Remote directory",
"webdavRemoteDirPlaceholder": "skillshub",
"webdavRefresh": "Refresh remote backups",
"webdavUpload": "Upload to WebDAV",
"webdavImportSelected": "Import selected WebDAV backup",
"webdavNoBackups": "No backup files in the remote directory",
"webdavSelectBackup": "Select remote backup",
"webdavRefreshed": "Remote backup list refreshed",
"webdavUploaded": "Backup uploaded to WebDAV",
"webdavImported": "WebDAV backup imported",
"webdavMissingConfig": "Enter a WebDAV URL and remote directory",
"webdavMissingSelection": "Select a remote backup file",
"webdavRefreshError": "Failed to refresh remote backups: {{error}}",
"webdavUploadError": "WebDAV backup upload failed: {{error}}",
"webdavImportError": "WebDAV backup import failed: {{error}}",
"webdavSessionOnlyHint": "WebDAV connection details are used only for this page session and are not saved to app settings or backup files."
```

- [ ] **Step 4: Update SettingsView state and store selectors**

In `src/pages/SettingsView.tsx`, import types:

```ts
import { AgentWithStatus, BackupOptions, ScanDirectory, WebDavBackupFile } from "@/types";
```

Add store selectors:

```ts
const listWebDavBackups = useSettingsStore((s) => s.listWebDavBackups);
const uploadWebDavBackup = useSettingsStore((s) => s.uploadWebDavBackup);
const downloadWebDavBackup = useSettingsStore((s) => s.downloadWebDavBackup);
```

Add local state:

```ts
const [backupOptions, setBackupOptions] = useState<BackupOptions>({
  includeResourceLibrary: true,
  includeCentralLibrary: true,
  includeAppConfig: true,
  includeInstallations: true,
});
const [webDavBaseUrl, setWebDavBaseUrl] = useState("");
const [webDavUsername, setWebDavUsername] = useState("");
const [webDavPassword, setWebDavPassword] = useState("");
const [webDavRemoteDir, setWebDavRemoteDir] = useState("skillshub");
const [webDavFiles, setWebDavFiles] = useState<WebDavBackupFile[]>([]);
const [selectedWebDavPath, setSelectedWebDavPath] = useState("");
const [isRefreshingWebDav, setIsRefreshingWebDav] = useState(false);
const [isUploadingWebDav, setIsUploadingWebDav] = useState(false);
const [isImportingWebDav, setIsImportingWebDav] = useState(false);
```

Add helpers:

```ts
function updateBackupOption(key: keyof BackupOptions, checked: boolean) {
  setBackupOptions((current) => ({ ...current, [key]: checked }));
}

function currentWebDavConfig() {
  return {
    baseUrl: webDavBaseUrl.trim(),
    username: webDavUsername,
    password: webDavPassword,
    remoteDir: webDavRemoteDir.trim(),
  };
}
```

Update local export:

```ts
const json = await exportAppBackup(backupOptions);
```

- [ ] **Step 5: Add WebDAV handlers**

Add handlers:

```ts
async function handleRefreshWebDavBackups() {
  if (!webDavBaseUrl.trim() || !webDavRemoteDir.trim()) {
    toast.error(t("settings.webdavMissingConfig"));
    return;
  }
  setIsRefreshingWebDav(true);
  try {
    const files = await listWebDavBackups(currentWebDavConfig());
    setWebDavFiles(files);
    setSelectedWebDavPath(files[0]?.remotePath ?? "");
    toast.success(t("settings.webdavRefreshed"));
  } catch (err) {
    toast.error(t("settings.webdavRefreshError", { error: String(err) }));
  } finally {
    setIsRefreshingWebDav(false);
  }
}

async function handleUploadWebDavBackup() {
  if (!webDavBaseUrl.trim() || !webDavRemoteDir.trim()) {
    toast.error(t("settings.webdavMissingConfig"));
    return;
  }
  setIsUploadingWebDav(true);
  try {
    await uploadWebDavBackup(currentWebDavConfig(), backupOptions);
    toast.success(t("settings.webdavUploaded"));
    const files = await listWebDavBackups(currentWebDavConfig());
    setWebDavFiles(files);
    setSelectedWebDavPath(files[0]?.remotePath ?? "");
  } catch (err) {
    toast.error(t("settings.webdavUploadError", { error: String(err) }));
  } finally {
    setIsUploadingWebDav(false);
  }
}

async function handleImportSelectedWebDavBackup() {
  if (!selectedWebDavPath) {
    toast.error(t("settings.webdavMissingSelection"));
    return;
  }
  setIsImportingWebDav(true);
  try {
    const json = await downloadWebDavBackup(currentWebDavConfig(), selectedWebDavPath);
    await importAppBackup(json);
    await Promise.all([
      rescan(),
      loadScanDirectories(),
      loadCentralSkills(),
      loadResourceLibrary(),
      loadGitHubPat(),
    ]);
    toast.success(t("settings.webdavImported"));
  } catch (err) {
    toast.error(t("settings.webdavImportError", { error: String(err) }));
  } finally {
    setIsImportingWebDav(false);
  }
}
```

- [ ] **Step 6: Render backup options and WebDAV controls**

Inside the backup card `CardContent`, before the existing buttons, render a checkbox grid:

```tsx
<div className="space-y-2">
  <div className="text-xs font-medium text-muted-foreground">{t("settings.backupContent")}</div>
  <div className="grid gap-2 sm:grid-cols-2">
    {[
      ["includeResourceLibrary", "settings.backupIncludeResourceLibrary"],
      ["includeCentralLibrary", "settings.backupIncludeCentralLibrary"],
      ["includeAppConfig", "settings.backupIncludeAppConfig"],
      ["includeInstallations", "settings.backupIncludeInstallations"],
    ].map(([key, labelKey]) => (
      <label key={key} className="flex items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm">
        <input
          type="checkbox"
          checked={backupOptions[key as keyof BackupOptions]}
          onChange={(event) => updateBackupOption(key as keyof BackupOptions, event.target.checked)}
        />
        <span>{t(labelKey)}</span>
      </label>
    ))}
  </div>
</div>
```

After local backup buttons and hint, render WebDAV inputs and actions:

```tsx
<div className="mt-5 space-y-3 border-t border-border/60 pt-4">
  <div>
    <div className="text-sm font-medium">{t("settings.webdavTitle")}</div>
    <p className="mt-1 text-xs text-muted-foreground">{t("settings.webdavSessionOnlyHint")}</p>
  </div>
  <div className="grid gap-3 md:grid-cols-2">
    <div>
      <label htmlFor="webdav-url" className="mb-1 block text-xs text-muted-foreground">{t("settings.webdavUrlLabel")}</label>
      <Input id="webdav-url" value={webDavBaseUrl} onChange={(event) => setWebDavBaseUrl(event.target.value)} placeholder="https://example.com/dav" />
    </div>
    <div>
      <label htmlFor="webdav-remote-dir" className="mb-1 block text-xs text-muted-foreground">{t("settings.webdavRemoteDirLabel")}</label>
      <Input id="webdav-remote-dir" value={webDavRemoteDir} onChange={(event) => setWebDavRemoteDir(event.target.value)} placeholder={t("settings.webdavRemoteDirPlaceholder")} />
    </div>
    <div>
      <label htmlFor="webdav-username" className="mb-1 block text-xs text-muted-foreground">{t("settings.webdavUsernameLabel")}</label>
      <Input id="webdav-username" value={webDavUsername} onChange={(event) => setWebDavUsername(event.target.value)} autoComplete="off" />
    </div>
    <div>
      <label htmlFor="webdav-password" className="mb-1 block text-xs text-muted-foreground">{t("settings.webdavPasswordLabel")}</label>
      <Input id="webdav-password" type="password" value={webDavPassword} onChange={(event) => setWebDavPassword(event.target.value)} autoComplete="off" />
    </div>
  </div>
  <div className="flex flex-wrap items-center gap-2">
    <Button variant="outline" onClick={handleRefreshWebDavBackups} disabled={isRefreshingWebDav || isUploadingWebDav || isImportingWebDav}>
      {isRefreshingWebDav ? <Loader2 className="size-4 animate-spin" /> : null}
      <span>{t("settings.webdavRefresh")}</span>
    </Button>
    <Button variant="outline" onClick={handleUploadWebDavBackup} disabled={isRefreshingWebDav || isUploadingWebDav || isImportingWebDav}>
      {isUploadingWebDav ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
      <span>{t("settings.webdavUpload")}</span>
    </Button>
  </div>
  <div className="rounded-lg border border-border/70">
    {webDavFiles.length === 0 ? (
      <p className="px-3 py-3 text-xs text-muted-foreground">{t("settings.webdavNoBackups")}</p>
    ) : (
      webDavFiles.map((file) => (
        <label key={file.remotePath} className="flex items-center gap-2 border-b border-border/50 px-3 py-2 text-sm last:border-0">
          <input type="radio" name="webdav-backup-file" checked={selectedWebDavPath === file.remotePath} onChange={() => setSelectedWebDavPath(file.remotePath)} />
          <span className="flex-1 truncate">{file.name}</span>
          {file.modifiedAt ? <span className="text-xs text-muted-foreground">{file.modifiedAt}</span> : null}
        </label>
      ))
    )}
  </div>
  <Button onClick={handleImportSelectedWebDavBackup} disabled={isRefreshingWebDav || isUploadingWebDav || isImportingWebDav || !selectedWebDavPath}>
    {isImportingWebDav ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
    <span>{t("settings.webdavImportSelected")}</span>
  </Button>
</div>
```

- [ ] **Step 7: Run SettingsView tests and fix accessibility mismatches**

Run:

```bash
pnpm test -- src/test/SettingsView.test.tsx
```

Expected: tests pass. If role names differ because of translated labels, adjust the JSX labels, not the test intent.

- [ ] **Step 8: Run focused frontend tests**

Run:

```bash
pnpm test -- src/test/settingsStore.test.ts src/test/SettingsView.test.tsx
```

Expected: both test files pass.

- [ ] **Step 9: Commit**

```bash
git add src/pages/SettingsView.tsx src/test/SettingsView.test.tsx src/i18n/locales/zh.json src/i18n/locales/en.json
git commit -m "feat: add webdav backup settings UI"
```

---

### Task 6: Full Verification And Cleanup

**Files:**
- Review all files changed by Tasks 1-5.

**Interfaces:**
- Consumes all previous task outputs.
- Produces a verified feature branch ready for user review.

- [ ] **Step 1: Run Rust tests**

Run:

```bash
cd src-tauri
cargo test
```

Expected: all Rust tests pass.

- [ ] **Step 2: Run Rust lint**

Run:

```bash
cd src-tauri
cargo clippy -- -D warnings
```

Expected: no warnings.

- [ ] **Step 3: Run frontend typecheck**

Run:

```bash
pnpm typecheck
```

Expected: TypeScript completes without errors.

- [ ] **Step 4: Run frontend tests**

Run:

```bash
pnpm test
```

Expected: the suite passes except for any pre-existing failures documented in `AGENTS.md`. If the known Sidebar/Settings/PlatformIcon failures still appear, record them in the final summary as pre-existing.

- [ ] **Step 5: Run frontend lint**

Run:

```bash
pnpm lint
```

Expected: ESLint completes without new warnings or errors.

- [ ] **Step 6: Build**

Run:

```bash
pnpm build
```

Expected: production build completes.

- [ ] **Step 7: Inspect diff**

Run:

```bash
git diff --stat
git diff -- src-tauri/src/commands/backup.rs src/pages/SettingsView.tsx src/stores/settingsStore.ts
```

Expected: changes are limited to the planned backup/WebDAV feature and do not contain credentials, real tokens, or unrelated refactors.

- [ ] **Step 8: Commit final verification fixes if any**

If verification required small fixes, commit them:

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/commands/backup.rs src-tauri/src/lib.rs src/types/index.ts src/stores/settingsStore.ts src/pages/SettingsView.tsx src/i18n/locales/zh.json src/i18n/locales/en.json src/test/settingsStore.test.ts src/test/SettingsView.test.tsx
git commit -m "fix: stabilize webdav backup import"
```

Expected: no uncommitted implementation changes remain except generated artifacts the repo intentionally ignores.
