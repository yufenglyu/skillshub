use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::path::{Component, Path, PathBuf};
use tauri::State;

use crate::{
    db::{self, Agent, Collection, DbPool, ScanDirectory, Skill, SkillMetadata, SkillSource},
    path_utils::path_to_string,
    AppState,
};

const BACKUP_SCHEMA_VERSION: u32 = 1;

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

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
struct CollectionSkillBackup {
    collection_id: String,
    skill_id: String,
    added_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
struct SettingBackup {
    key: String,
    value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
struct SkillRegistryBackup {
    id: String,
    name: String,
    source_type: String,
    url: String,
    is_builtin: bool,
    is_enabled: bool,
    last_synced: Option<String>,
    last_attempted_sync: Option<String>,
    last_sync_status: String,
    last_sync_error: Option<String>,
    cache_updated_at: Option<String>,
    cache_expires_at: Option<String>,
    etag: Option<String>,
    last_modified: Option<String>,
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
struct MarketplaceSkillBackup {
    id: String,
    registry_id: String,
    name: String,
    description: Option<String>,
    download_url: String,
    is_installed: bool,
    synced_at: String,
    cache_updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SkillFileBackup {
    relative_path: String,
    content_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SkillBackup {
    skill: Skill,
    source: Option<SkillSource>,
    metadata: Option<SkillMetadata>,
    #[serde(default = "default_skill_backup_storage_kind")]
    storage_kind: String,
    relative_dir: String,
    files: Vec<SkillFileBackup>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AppBackup {
    schema_version: u32,
    exported_at: String,
    central_root: String,
    #[serde(default)]
    included: BackupOptions,
    skills: Vec<SkillBackup>,
    collections: Vec<Collection>,
    collection_skills: Vec<CollectionSkillBackup>,
    settings: Vec<SettingBackup>,
    agents: Vec<Agent>,
    scan_directories: Vec<ScanDirectory>,
    skill_registries: Vec<SkillRegistryBackup>,
    marketplace_skills: Vec<MarketplaceSkillBackup>,
}

#[tauri::command]
pub async fn export_app_backup(
    state: State<'_, AppState>,
    options: Option<BackupOptions>,
) -> Result<String, String> {
    export_app_backup_impl(&state.db, options.unwrap_or_default()).await
}

#[tauri::command]
pub async fn import_app_backup(state: State<'_, AppState>, json: String) -> Result<(), String> {
    import_app_backup_impl(&state.db, &json).await
}

pub async fn export_app_backup_impl(
    pool: &DbPool,
    options: BackupOptions,
) -> Result<String, String> {
    let central_root = central_root(pool).await?;
    let resource_root = db::get_skill_resource_library_dir(pool).await?;
    let mut skill_backups = Vec::new();
    if options.include_central_library {
        let central_skills = db::get_central_skills(pool).await?;
        append_skill_backups(
            pool,
            &mut skill_backups,
            central_skills,
            &central_root,
            "central",
        )
        .await?;
    }
    if options.include_resource_library {
        let resource_skills = db::get_resource_library_skills(pool).await?;
        append_skill_backups(
            pool,
            &mut skill_backups,
            resource_skills,
            &resource_root,
            "resource",
        )
        .await?;
    }

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
        (
            Vec::new(),
            Vec::new(),
            Vec::new(),
            Vec::new(),
            Vec::new(),
            Vec::new(),
            Vec::new(),
        )
    };

    let backup = AppBackup {
        schema_version: BACKUP_SCHEMA_VERSION,
        exported_at: Utc::now().to_rfc3339(),
        central_root: path_to_string(&central_root),
        included: options,
        skills: skill_backups,
        collections,
        collection_skills,
        settings,
        agents,
        scan_directories,
        skill_registries,
        marketplace_skills,
    };

    serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())
}

async fn import_app_backup_impl(pool: &DbPool, json: &str) -> Result<(), String> {
    let backup: AppBackup = serde_json::from_str(json).map_err(|e| e.to_string())?;
    if backup.schema_version != BACKUP_SCHEMA_VERSION {
        return Err(format!(
            "Unsupported backup schema version {}",
            backup.schema_version
        ));
    }

    let central_root = central_root(pool).await?;
    std::fs::create_dir_all(&central_root)
        .map_err(|e| format!("Failed to create Central Skills root: {}", e))?;

    for setting in backup.settings {
        if is_sensitive_setting_key(&setting.key) {
            continue;
        }
        db::set_setting(pool, &setting.key, &setting.value).await?;
    }

    let resource_root = db::get_skill_resource_library_dir(pool).await?;
    std::fs::create_dir_all(&resource_root)
        .map_err(|e| format!("Failed to create Skill Resource Library root: {}", e))?;

    for agent in backup.agents {
        if !agent.is_builtin {
            upsert_agent_backup(pool, &agent).await?;
        }
    }

    for dir in backup.scan_directories {
        if !dir.is_builtin {
            sqlx::query(
                "INSERT INTO scan_directories (path, label, is_active, is_builtin, added_at)
                 VALUES (?, ?, ?, 0, ?)
                 ON CONFLICT(path) DO UPDATE SET
                   label = excluded.label,
                   is_active = excluded.is_active",
            )
            .bind(&dir.path)
            .bind(&dir.label)
            .bind(dir.is_active)
            .bind(&dir.added_at)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    for registry in backup.skill_registries {
        upsert_registry_backup(pool, &registry).await?;
    }

    for skill in backup.skills {
        let relative_dir = normalize_relative_path(&skill.relative_dir)?;
        let is_resource_skill = skill.storage_kind == "resource";
        let target_root = if is_resource_skill {
            &resource_root
        } else {
            &central_root
        };
        let target_dir = target_root.join(relative_dir);
        if target_dir.exists() {
            std::fs::remove_dir_all(&target_dir).map_err(|e| {
                format!(
                    "Failed to replace existing skill directory '{}': {}",
                    target_dir.display(),
                    e
                )
            })?;
        }
        std::fs::create_dir_all(&target_dir)
            .map_err(|e| format!("Failed to create skill directory: {}", e))?;
        write_files(&target_dir, &skill.files)?;

        let mut db_skill = skill.skill;
        db_skill.file_path = path_to_string(&target_dir.join("SKILL.md"));
        db_skill.canonical_path = Some(path_to_string(&target_dir));
        db_skill.is_central = !is_resource_skill;
        db_skill.content = None;
        db::upsert_skill(pool, &db_skill).await?;
        if let Some(mut source) = skill.source {
            source.skill_id = db_skill.id.clone();
            db::upsert_skill_source(pool, &source).await?;
        }
        if let Some(metadata) = skill.metadata {
            let tags = db::parse_skill_metadata_tags(Some(&metadata));
            db::upsert_skill_metadata(pool, &db_skill.id, metadata.notes.as_deref(), &tags).await?;
        }
    }

    for collection in backup.collections {
        upsert_collection_backup(pool, &collection).await?;
    }

    for membership in backup.collection_skills {
        sqlx::query(
            "INSERT OR IGNORE INTO collection_skills (collection_id, skill_id, added_at)
             VALUES (?, ?, ?)",
        )
        .bind(&membership.collection_id)
        .bind(&membership.skill_id)
        .bind(&membership.added_at)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    for skill in backup.marketplace_skills {
        upsert_marketplace_skill_backup(pool, &skill).await?;
    }

    Ok(())
}

fn default_skill_backup_storage_kind() -> String {
    "central".to_string()
}

async fn append_skill_backups(
    pool: &DbPool,
    skill_backups: &mut Vec<SkillBackup>,
    skills: Vec<Skill>,
    root: &Path,
    storage_kind: &str,
) -> Result<(), String> {
    for skill in skills {
        let skill_dir = skill_directory(&skill);
        let relative_dir = relative_to_root(&skill_dir, root).unwrap_or_else(|| skill.id.clone());
        let files = collect_files(&skill_dir)?;
        let source = db::get_skill_source(pool, &skill.id).await?;
        let metadata = db::get_skill_metadata(pool, &skill.id).await?;
        skill_backups.push(SkillBackup {
            skill,
            source,
            metadata,
            storage_kind: storage_kind.to_string(),
            relative_dir,
            files,
        });
    }
    Ok(())
}

async fn central_root(pool: &DbPool) -> Result<PathBuf, String> {
    let central = db::get_agent_by_id(pool, "central")
        .await?
        .ok_or_else(|| "Central agent not found in database".to_string())?;
    Ok(PathBuf::from(central.global_skills_dir))
}

fn skill_directory(skill: &Skill) -> PathBuf {
    skill
        .canonical_path
        .as_deref()
        .map(PathBuf::from)
        .or_else(|| Path::new(&skill.file_path).parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from(&skill.file_path))
}

fn relative_to_root(path: &Path, root: &Path) -> Option<String> {
    path.strip_prefix(root)
        .ok()
        .map(|path| path.to_string_lossy().into_owned())
}

fn collect_files(root: &Path) -> Result<Vec<SkillFileBackup>, String> {
    let mut files = Vec::new();
    collect_files_inner(root, root, &mut files)?;
    files.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(files)
}

fn collect_files_inner(
    root: &Path,
    current: &Path,
    files: &mut Vec<SkillFileBackup>,
) -> Result<(), String> {
    for entry in std::fs::read_dir(current)
        .map_err(|e| format!("Failed to read directory '{}': {}", current.display(), e))?
    {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let metadata = std::fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            collect_files_inner(root, &path, files)?;
            continue;
        }
        if metadata.is_file() {
            let relative_path = path
                .strip_prefix(root)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .into_owned();
            let bytes = std::fs::read(&path)
                .map_err(|e| format!("Failed to read '{}': {}", path.display(), e))?;
            files.push(SkillFileBackup {
                relative_path,
                content_base64: STANDARD.encode(bytes),
            });
        }
    }
    Ok(())
}

fn normalize_relative_path(value: &str) -> Result<PathBuf, String> {
    let path = Path::new(value);
    if path.is_absolute() {
        return Err("Backup contains an absolute path".to_string());
    }
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => normalized.push(part),
            _ => return Err("Backup contains an unsafe relative path".to_string()),
        }
    }
    if normalized.as_os_str().is_empty() {
        return Err("Backup contains an empty relative path".to_string());
    }
    Ok(normalized)
}

fn write_files(root: &Path, files: &[SkillFileBackup]) -> Result<(), String> {
    for file in files {
        let relative_path = normalize_relative_path(&file.relative_path)?;
        let target = root.join(relative_path);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory '{}': {}", parent.display(), e))?;
        }
        let bytes = STANDARD
            .decode(&file.content_base64)
            .map_err(|e| format!("Invalid base64 content for '{}': {}", file.relative_path, e))?;
        std::fs::write(&target, bytes)
            .map_err(|e| format!("Failed to write '{}': {}", target.display(), e))?;
    }
    Ok(())
}

async fn upsert_agent_backup(pool: &DbPool, agent: &Agent) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO agents
         (id, display_name, category, global_skills_dir, project_skills_dir,
          icon_name, is_detected, is_builtin, is_enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           display_name = excluded.display_name,
           category = excluded.category,
           global_skills_dir = excluded.global_skills_dir,
           project_skills_dir = excluded.project_skills_dir,
           icon_name = excluded.icon_name,
           is_detected = excluded.is_detected,
           is_enabled = excluded.is_enabled",
    )
    .bind(&agent.id)
    .bind(&agent.display_name)
    .bind(&agent.category)
    .bind(&agent.global_skills_dir)
    .bind(&agent.project_skills_dir)
    .bind(&agent.icon_name)
    .bind(agent.is_detected)
    .bind(agent.is_builtin)
    .bind(agent.is_enabled)
    .execute(pool)
    .await
    .map(|_| ())
    .map_err(|e| e.to_string())
}

async fn upsert_collection_backup(pool: &DbPool, collection: &Collection) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO collections (id, name, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           description = excluded.description,
           updated_at = excluded.updated_at",
    )
    .bind(&collection.id)
    .bind(&collection.name)
    .bind(&collection.description)
    .bind(&collection.created_at)
    .bind(&collection.updated_at)
    .execute(pool)
    .await
    .map(|_| ())
    .map_err(|e| e.to_string())
}

async fn upsert_registry_backup(
    pool: &DbPool,
    registry: &SkillRegistryBackup,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO skill_registries
         (id, name, source_type, url, is_builtin, is_enabled, last_synced,
          last_attempted_sync, last_sync_status, last_sync_error, cache_updated_at,
          cache_expires_at, etag, last_modified, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           source_type = excluded.source_type,
           url = excluded.url,
           is_enabled = excluded.is_enabled,
           last_synced = excluded.last_synced,
           last_attempted_sync = excluded.last_attempted_sync,
           last_sync_status = excluded.last_sync_status,
           last_sync_error = excluded.last_sync_error,
           cache_updated_at = excluded.cache_updated_at,
           cache_expires_at = excluded.cache_expires_at,
           etag = excluded.etag,
           last_modified = excluded.last_modified",
    )
    .bind(&registry.id)
    .bind(&registry.name)
    .bind(&registry.source_type)
    .bind(&registry.url)
    .bind(registry.is_builtin)
    .bind(registry.is_enabled)
    .bind(&registry.last_synced)
    .bind(&registry.last_attempted_sync)
    .bind(&registry.last_sync_status)
    .bind(&registry.last_sync_error)
    .bind(&registry.cache_updated_at)
    .bind(&registry.cache_expires_at)
    .bind(&registry.etag)
    .bind(&registry.last_modified)
    .bind(&registry.created_at)
    .execute(pool)
    .await
    .map(|_| ())
    .map_err(|e| e.to_string())
}

async fn upsert_marketplace_skill_backup(
    pool: &DbPool,
    skill: &MarketplaceSkillBackup,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO marketplace_skills
         (id, registry_id, name, description, download_url, is_installed, synced_at, cache_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           registry_id = excluded.registry_id,
           name = excluded.name,
           description = excluded.description,
           download_url = excluded.download_url,
           is_installed = excluded.is_installed,
           synced_at = excluded.synced_at,
           cache_updated_at = excluded.cache_updated_at",
    )
    .bind(&skill.id)
    .bind(&skill.registry_id)
    .bind(&skill.name)
    .bind(&skill.description)
    .bind(&skill.download_url)
    .bind(skill.is_installed)
    .bind(&skill.synced_at)
    .bind(&skill.cache_updated_at)
    .execute(pool)
    .await
    .map(|_| ())
    .map_err(|e| e.to_string())
}

fn is_sensitive_setting_key(key: &str) -> bool {
    let lower = key.to_ascii_lowercase();
    ["api_key", "token", "secret", "password", "pat"]
        .iter()
        .any(|needle| lower.contains(needle))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    async fn setup_test_db() -> (DbPool, tempfile::TempDir) {
        let dir = tempdir().expect("tempdir");
        let db_path = dir.path().join("db.sqlite");
        let pool = db::create_pool(&db_path.to_string_lossy())
            .await
            .expect("pool");
        db::init_database(&pool).await.expect("init");
        let central = dir.path().join("central");
        std::fs::create_dir_all(&central).expect("central");
        sqlx::query("UPDATE agents SET global_skills_dir = ? WHERE id = 'central'")
            .bind(central.to_string_lossy().to_string())
            .execute(&pool)
            .await
            .expect("central path");
        (pool, dir)
    }

    #[tokio::test]
    async fn backup_roundtrip_preserves_grouped_skill_files_and_source() {
        let (pool, _dir) = setup_test_db().await;
        let central = central_root(&pool).await.expect("central");
        let skill_dir = central.join("openai").join("skills").join("demo");
        std::fs::create_dir_all(&skill_dir).expect("skill dir");
        std::fs::write(skill_dir.join("SKILL.md"), "---\nname: Demo\n---\n").expect("skill");
        std::fs::write(skill_dir.join("asset.bin"), [0, 1, 2, 3]).expect("asset");

        db::upsert_skill(
            &pool,
            &Skill {
                id: "demo".to_string(),
                name: "Demo".to_string(),
                description: None,
                file_path: path_to_string(&skill_dir.join("SKILL.md")),
                canonical_path: Some(path_to_string(&skill_dir)),
                is_central: true,
                source: Some("github:openai/skills".to_string()),
                content: None,
                scanned_at: "2026-01-01T00:00:00Z".to_string(),
            },
        )
        .await
        .expect("skill");
        db::upsert_skill_source(
            &pool,
            &SkillSource {
                skill_id: "demo".to_string(),
                source_type: "github".to_string(),
                source_url: Some(
                    "https://raw.githubusercontent.com/openai/skills/main/demo/SKILL.md"
                        .to_string(),
                ),
                source_author: Some("openai".to_string()),
                source_repo: Some("openai/skills".to_string()),
                source_path: Some("demo".to_string()),
                updated_at: "2026-01-01T00:00:00Z".to_string(),
            },
        )
        .await
        .expect("source");
        db::upsert_skill_metadata(
            &pool,
            "demo",
            Some("Use for imported repository demos."),
            &["repo".to_string(), "demo".to_string()],
        )
        .await
        .expect("metadata");

        let json = export_app_backup_impl(&pool, BackupOptions::default())
            .await
            .expect("export");
        std::fs::remove_dir_all(&skill_dir).expect("remove original files");
        db::delete_skill(&pool, "demo").await.expect("delete db");

        import_app_backup_impl(&pool, &json).await.expect("import");

        assert!(skill_dir.join("SKILL.md").exists());
        assert_eq!(
            std::fs::read(skill_dir.join("asset.bin")).unwrap(),
            vec![0, 1, 2, 3]
        );
        let source = db::get_skill_source(&pool, "demo")
            .await
            .expect("source")
            .expect("source row");
        assert_eq!(source.source_author.as_deref(), Some("openai"));
        assert_eq!(source.source_repo.as_deref(), Some("openai/skills"));
        let metadata = db::get_skill_metadata(&pool, "demo")
            .await
            .expect("metadata")
            .expect("metadata row");
        assert_eq!(
            metadata.notes.as_deref(),
            Some("Use for imported repository demos.")
        );
        assert_eq!(
            db::parse_skill_metadata_tags(Some(&metadata)),
            vec!["repo".to_string(), "demo".to_string()]
        );
    }

    #[tokio::test]
    async fn backup_roundtrip_preserves_resource_library_skills() {
        let (pool, dir) = setup_test_db().await;
        let resource_root = dir.path().join("resource-library");
        db::set_skill_resource_library_dir(&pool, &resource_root.to_string_lossy())
            .await
            .expect("resource dir");
        let skill_dir = resource_root
            .join("example")
            .join("skills")
            .join("resource-demo");
        std::fs::create_dir_all(&skill_dir).expect("skill dir");
        std::fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: Resource Demo\n---\n",
        )
        .expect("skill");

        db::upsert_skill(
            &pool,
            &Skill {
                id: "resource-demo".to_string(),
                name: "Resource Demo".to_string(),
                description: None,
                file_path: path_to_string(&skill_dir.join("SKILL.md")),
                canonical_path: Some(path_to_string(&skill_dir)),
                is_central: false,
                source: Some("github:example/skills".to_string()),
                content: None,
                scanned_at: "2026-01-01T00:00:00Z".to_string(),
            },
        )
        .await
        .expect("skill");

        let json = export_app_backup_impl(&pool, BackupOptions::default())
            .await
            .expect("export");
        assert!(json.contains("\"storage_kind\": \"resource\""));
        std::fs::remove_dir_all(&skill_dir).expect("remove original files");
        db::delete_skill(&pool, "resource-demo")
            .await
            .expect("delete db");

        import_app_backup_impl(&pool, &json).await.expect("import");

        assert!(skill_dir.join("SKILL.md").exists());
        let restored = db::get_skill_by_id(&pool, "resource-demo")
            .await
            .expect("restored query")
            .expect("restored skill");
        assert_eq!(
            restored.canonical_path.as_deref(),
            Some(path_to_string(&skill_dir).as_str())
        );
        assert!(
            !restored.is_central,
            "resource library backups must restore as resource skills"
        );
    }

    #[tokio::test]
    async fn backup_excludes_sensitive_settings_and_import_ignores_them() {
        let (pool, _dir) = setup_test_db().await;
        db::set_setting(&pool, "language", "zh")
            .await
            .expect("language");
        db::set_setting(&pool, "github_pat", "should-not-export")
            .await
            .expect("pat");
        db::set_setting(&pool, "ai_api_key", "should-not-export")
            .await
            .expect("api key");

        let json = export_app_backup_impl(&pool, BackupOptions::default())
            .await
            .expect("export");
        assert!(json.contains("\"language\""));
        assert!(!json.contains("should-not-export"));

        let mut backup: AppBackup = serde_json::from_str(&json).expect("backup");
        backup.settings.push(SettingBackup {
            key: "github_pat".to_string(),
            value: "should-not-import".to_string(),
        });
        let import_json = serde_json::to_string(&backup).expect("json");
        db::set_setting(&pool, "github_pat", "existing")
            .await
            .expect("existing");

        import_app_backup_impl(&pool, &import_json)
            .await
            .expect("import");

        assert_eq!(
            db::get_setting(&pool, "language").await.expect("language"),
            Some("zh".to_string())
        );
        assert_eq!(
            db::get_setting(&pool, "github_pat").await.expect("pat"),
            Some("existing".to_string())
        );
    }

    #[tokio::test]
    async fn backup_options_resource_only_excludes_central_and_app_config() {
        let (pool, dir) = setup_test_db().await;
        db::set_setting(&pool, "language", "zh")
            .await
            .expect("setting");

        let central = central_root(&pool).await.expect("central");
        let central_skill_dir = central.join("central-demo");
        std::fs::create_dir_all(&central_skill_dir).expect("central skill dir");
        std::fs::write(
            central_skill_dir.join("SKILL.md"),
            "---\nname: Central Demo\n---\n",
        )
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
        std::fs::write(
            resource_skill_dir.join("SKILL.md"),
            "---\nname: Resource Demo\n---\n",
        )
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

        assert!(backup
            .skills
            .iter()
            .any(|skill| skill.skill.id == "resource-demo"));
        assert!(!backup
            .skills
            .iter()
            .any(|skill| skill.skill.id == "central-demo"));
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
        std::fs::write(
            central_skill_dir.join("SKILL.md"),
            "---\nname: Central Only Demo\n---\n",
        )
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
        std::fs::write(
            resource_skill_dir.join("SKILL.md"),
            "---\nname: Resource Only Demo\n---\n",
        )
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

        assert!(backup
            .skills
            .iter()
            .any(|skill| skill.skill.id == "central-only-demo"));
        assert!(!backup
            .skills
            .iter()
            .any(|skill| skill.skill.id == "resource-only-demo"));
    }
}
