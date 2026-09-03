use chrono::Utc;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

use super::{github_import, skills, skills_cli};
use crate::{db, path_utils::source_grouped_skill_dir, AppState};

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SkillRegistry {
    pub id: String,
    pub name: String,
    pub source_type: String,
    pub url: String,
    pub is_builtin: bool,
    pub is_enabled: bool,
    pub last_synced: Option<String>,
    pub last_attempted_sync: Option<String>,
    pub last_sync_status: String,
    pub last_sync_error: Option<String>,
    pub cache_updated_at: Option<String>,
    pub cache_expires_at: Option<String>,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MarketplaceSkill {
    pub id: String,
    pub registry_id: String,
    pub name: String,
    pub description: Option<String>,
    pub download_url: String,
    pub is_installed: bool,
    pub synced_at: String,
    pub cache_updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RegistrySyncStatus {
    Never,
    Success,
    Error,
}

impl RegistrySyncStatus {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Never => "never",
            Self::Success => "success",
            Self::Error => "error",
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct RegistryCacheMetadata {
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    pub cache_expires_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncRegistryOptions {
    pub force_refresh: bool,
}

// ─── Registry Fetcher ────────────────────────────────────────────────────────

/// Fetch skills from a GitHub repository.
/// Reuses the same repository snapshot + manifest classification logic as
/// the GitHub import flow so Marketplace preview and import stay in sync.
async fn fetch_github_skills(
    pool: &crate::db::DbPool,
    url: &str,
    registry_id: &str,
) -> Result<Vec<MarketplaceSkill>, String> {
    let auth = github_import::github_direct_auth_from_settings(pool).await?;
    let repo = github_import::resolve_repo_ref(url, auth.as_deref()).await?;
    let candidates = github_import::fetch_repo_skill_candidates(&repo, auth.as_deref()).await?;
    Ok(marketplace_skills_from_candidates(registry_id, candidates))
}

fn marketplace_skills_from_candidates(
    registry_id: &str,
    candidates: Vec<github_import::RemoteSkillCandidate>,
) -> Vec<MarketplaceSkill> {
    let now = chrono::Utc::now().to_rfc3339();
    let mut seen_names = HashSet::new();
    let mut skills = Vec::new();

    for candidate in candidates {
        if !seen_names.insert(candidate.skill_name.clone()) {
            continue;
        }

        skills.push(MarketplaceSkill {
            id: format!("{}::{}", registry_id, candidate.skill_id),
            registry_id: registry_id.to_string(),
            name: candidate.skill_name,
            description: candidate.description,
            download_url: candidate.download_url,
            is_installed: false,
            synced_at: now.clone(),
            cache_updated_at: Some(now.clone()),
        });
    }

    skills
}

// ─── IPC Commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_registries(state: State<'_, AppState>) -> Result<Vec<SkillRegistry>, String> {
    let rows = sqlx::query(
        "SELECT id, name, source_type, url, is_builtin, is_enabled, last_synced,
                last_attempted_sync, last_sync_status, last_sync_error,
                cache_updated_at, cache_expires_at, etag, last_modified, created_at
         FROM skill_registries ORDER BY is_builtin DESC, name",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|r| {
            use sqlx::Row;
            SkillRegistry {
                id: r.get("id"),
                name: r.get("name"),
                source_type: r.get("source_type"),
                url: r.get("url"),
                is_builtin: r.get("is_builtin"),
                is_enabled: r.get("is_enabled"),
                last_synced: r.get("last_synced"),
                last_attempted_sync: r.get("last_attempted_sync"),
                last_sync_status: r.get("last_sync_status"),
                last_sync_error: r.get("last_sync_error"),
                cache_updated_at: r.get("cache_updated_at"),
                cache_expires_at: r.get("cache_expires_at"),
                etag: r.get("etag"),
                last_modified: r.get("last_modified"),
                created_at: r.get("created_at"),
            }
        })
        .collect())
}

#[tauri::command]
pub async fn add_registry(
    state: State<'_, AppState>,
    name: String,
    source_type: String,
    url: String,
) -> Result<SkillRegistry, String> {
    add_registry_impl(&state.db, name, source_type, url, None).await
}

async fn add_registry_impl(
    pool: &crate::db::DbPool,
    name: String,
    source_type: String,
    url: String,
    cache_metadata: Option<RegistryCacheMetadata>,
) -> Result<SkillRegistry, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let cache_metadata = cache_metadata.unwrap_or_default();

    sqlx::query(
        "INSERT INTO skill_registries
         (id, name, source_type, url, is_builtin, is_enabled, last_sync_status,
          cache_expires_at, etag, last_modified, created_at)
         VALUES (?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&name)
    .bind(&source_type)
    .bind(&url)
    .bind(RegistrySyncStatus::Never.as_str())
    .bind(&cache_metadata.cache_expires_at)
    .bind(&cache_metadata.etag)
    .bind(&cache_metadata.last_modified)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(SkillRegistry {
        id,
        name,
        source_type,
        url,
        is_builtin: false,
        is_enabled: true,
        last_synced: None,
        last_attempted_sync: None,
        last_sync_status: RegistrySyncStatus::Never.as_str().to_string(),
        last_sync_error: None,
        cache_updated_at: None,
        cache_expires_at: cache_metadata.cache_expires_at,
        etag: cache_metadata.etag,
        last_modified: cache_metadata.last_modified,
        created_at: now,
    })
}

#[tauri::command]
pub async fn remove_registry(
    state: State<'_, AppState>,
    registry_id: String,
) -> Result<(), String> {
    // Don't allow removing built-in registries
    let row = sqlx::query("SELECT is_builtin FROM skill_registries WHERE id = ?")
        .bind(&registry_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(r) = &row {
        use sqlx::Row;
        if r.get::<bool, _>("is_builtin") {
            return Err("Cannot remove built-in registry".to_string());
        }
    }

    // Delete cached skills first
    sqlx::query("DELETE FROM marketplace_skills WHERE registry_id = ?")
        .bind(&registry_id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM skill_registries WHERE id = ?")
        .bind(&registry_id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn sync_registry(
    state: State<'_, AppState>,
    registry_id: String,
) -> Result<Vec<MarketplaceSkill>, String> {
    sync_registry_impl(&state.db, registry_id, SyncRegistryOptions::default()).await
}

#[tauri::command]
pub async fn sync_registry_with_options(
    state: State<'_, AppState>,
    registry_id: String,
    options: Option<SyncRegistryOptions>,
) -> Result<Vec<MarketplaceSkill>, String> {
    sync_registry_impl(&state.db, registry_id, options.unwrap_or_default()).await
}

async fn sync_registry_impl(
    pool: &crate::db::DbPool,
    registry_id: String,
    options: SyncRegistryOptions,
) -> Result<Vec<MarketplaceSkill>, String> {
    // Get registry info
    let row = sqlx::query(
        "SELECT id, name, source_type, url, is_builtin, is_enabled, last_synced,
                last_attempted_sync, last_sync_status, last_sync_error,
                cache_updated_at, cache_expires_at, etag, last_modified, created_at
         FROM skill_registries WHERE id = ?",
    )
    .bind(&registry_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Registry not found".to_string())?;

    let registry = {
        use sqlx::Row;
        SkillRegistry {
            id: row.get("id"),
            name: row.get("name"),
            source_type: row.get("source_type"),
            url: row.get("url"),
            is_builtin: row.get("is_builtin"),
            is_enabled: row.get("is_enabled"),
            last_synced: row.get("last_synced"),
            last_attempted_sync: row.get("last_attempted_sync"),
            last_sync_status: row.get("last_sync_status"),
            last_sync_error: row.get("last_sync_error"),
            cache_updated_at: row.get("cache_updated_at"),
            cache_expires_at: row.get("cache_expires_at"),
            etag: row.get("etag"),
            last_modified: row.get("last_modified"),
            created_at: row.get("created_at"),
        }
    };

    if !options.force_refresh && registry_has_cached_skills(pool, &registry.id).await? {
        return search_marketplace_skills_impl(pool, Some(registry_id), None).await;
    }

    let attempt_time = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE skill_registries
         SET last_attempted_sync = ?, last_sync_error = NULL
         WHERE id = ?",
    )
    .bind(&attempt_time)
    .bind(&registry.id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    // Fetch skills based on source type
    let skills = match registry.source_type.as_str() {
        "github" => match fetch_github_skills(pool, &registry.url, &registry.id).await {
            Ok(skills) => skills,
            Err(error) => {
                sqlx::query(
                    "UPDATE skill_registries
                     SET last_attempted_sync = ?, last_sync_status = ?, last_sync_error = ?
                     WHERE id = ?",
                )
                .bind(&attempt_time)
                .bind(RegistrySyncStatus::Error.as_str())
                .bind(&error)
                .bind(&registry.id)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;

                if registry_has_cached_skills(pool, &registry.id).await? {
                    return search_marketplace_skills_impl(pool, Some(registry_id), None).await;
                }

                return Err(error);
            }
        },
        _ => return Err(format!("Unsupported source type: {}", registry.source_type)),
    };

    // Check which skills are already installed locally
    let central_dir = central_skills_root(pool).await?;

    // Upsert skills into marketplace_skills
    for skill in &skills {
        let is_installed = central_dir.join(&skill.name).join("SKILL.md").exists();

        sqlx::query(
            "INSERT INTO marketplace_skills (id, registry_id, name, description, download_url, is_installed, synced_at, cache_updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
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
        .bind(is_installed)
        .bind(&skill.synced_at)
        .bind(&skill.cache_updated_at)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Update last_synced
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE skill_registries
         SET last_synced = ?, last_attempted_sync = ?, last_sync_status = ?, last_sync_error = NULL, cache_updated_at = ?
         WHERE id = ?",
    )
        .bind(&now)
        .bind(&attempt_time)
        .bind(RegistrySyncStatus::Success.as_str())
        .bind(&now)
        .bind(&registry_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    // Return the updated list
    search_marketplace_skills_impl(pool, Some(registry_id), None).await
}

#[tauri::command]
pub async fn search_marketplace_skills(
    state: State<'_, AppState>,
    registry_id: Option<String>,
    query: Option<String>,
) -> Result<Vec<MarketplaceSkill>, String> {
    search_marketplace_skills_impl(&state.db, registry_id, query).await
}

async fn search_marketplace_skills_impl(
    pool: &crate::db::DbPool,
    registry_id: Option<String>,
    query: Option<String>,
) -> Result<Vec<MarketplaceSkill>, String> {
    let mut sql = String::from(
        r#"SELECT id, registry_id, name, description, download_url,
            is_installed, synced_at, cache_updated_at
         FROM marketplace_skills WHERE 1=1"#,
    );
    let mut bindings: Vec<String> = Vec::new();

    if let Some(ref rid) = registry_id {
        sql.push_str(" AND registry_id = ?");
        bindings.push(rid.clone());
    }
    if let Some(ref q) = query {
        if !q.trim().is_empty() {
            sql.push_str(" AND (name LIKE ? OR description LIKE ?)");
            let pattern = format!("%{}%", q);
            bindings.push(pattern.clone());
            bindings.push(pattern);
        }
    }
    sql.push_str(" ORDER BY name");

    let mut q = sqlx::query(&sql);
    for b in &bindings {
        q = q.bind(b);
    }

    let rows = q.fetch_all(pool).await.map_err(|e| e.to_string())?;
    Ok(rows.iter().map(row_to_marketplace_skill).collect())
}

async fn registry_has_cached_skills(
    pool: &crate::db::DbPool,
    registry_id: &str,
) -> Result<bool, String> {
    let count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM marketplace_skills WHERE registry_id = ?",
    )
    .bind(registry_id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(count > 0)
}

fn row_to_marketplace_skill(row: &sqlx::sqlite::SqliteRow) -> MarketplaceSkill {
    use sqlx::Row;

    MarketplaceSkill {
        id: row.get("id"),
        registry_id: row.get("registry_id"),
        name: row.get("name"),
        description: row.get("description"),
        download_url: row.get("download_url"),
        is_installed: row.get::<i64, _>("is_installed") != 0,
        synced_at: row.get("synced_at"),
        cache_updated_at: row.get("cache_updated_at"),
    }
}

#[derive(sqlx::FromRow)]
struct MarketplaceSkillRow {
    id: String,
    registry_id: String,
    name: String,
    description: Option<String>,
    download_url: String,
    registry_name: Option<String>,
    registry_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MarketplaceSkillFrontmatter {
    name: String,
    description: Option<String>,
}

async fn central_skills_root(pool: &db::DbPool) -> Result<PathBuf, String> {
    let central = db::get_agent_by_id(pool, "central")
        .await?
        .ok_or_else(|| "Central agent not found in database".to_string())?;
    Ok(PathBuf::from(central.global_skills_dir))
}

async fn skill_resource_library_root(pool: &db::DbPool) -> Result<PathBuf, String> {
    db::get_skill_resource_library_dir(pool).await
}

fn parse_marketplace_skill_frontmatter(content: &str) -> Option<MarketplaceSkillFrontmatter> {
    let after_open = content
        .strip_prefix("---\n")
        .or_else(|| content.strip_prefix("---\r\n"))?;
    let close_pos = after_open.find("\n---")?;
    serde_yaml::from_str(&after_open[..close_pos]).ok()
}

fn validate_update_skill_markdown(skill_id: &str, content: &str) -> Result<(), String> {
    parse_marketplace_skill_frontmatter(content)
        .map(|_| ())
        .ok_or_else(|| {
            format!(
                "Refusing to update '{}': downloaded content is not a valid SKILL.md file",
                skill_id
            )
        })
}

fn is_updatable_skill_source_url(url: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url) else {
        return false;
    };
    matches!(parsed.scheme(), "http" | "https") && parsed.path().ends_with("/SKILL.md")
}

fn source_path_to_skill_md_path(source_path: &str) -> Option<String> {
    let trimmed = source_path.trim().trim_matches('/');
    if trimmed.is_empty() {
        return None;
    }
    if trimmed == "." {
        return Some("SKILL.md".to_string());
    }
    if trimmed.ends_with("/SKILL.md") || trimmed == "SKILL.md" {
        Some(trimmed.to_string())
    } else {
        Some(format!("{trimmed}/SKILL.md"))
    }
}

fn github_raw_update_urls(source: &db::SkillSource) -> Vec<String> {
    let mut urls = Vec::new();
    if let Some(url) = source
        .source_url
        .as_deref()
        .filter(|url| is_updatable_skill_source_url(url))
    {
        urls.push(url.to_string());
    }
    if source.source_type != "github" {
        return urls;
    }
    let Some(repo) = source.source_repo.as_deref() else {
        return urls;
    };
    let Some(source_path) = source.source_path.as_deref() else {
        return urls;
    };
    let Some(skill_md_path) = source_path_to_skill_md_path(source_path) else {
        return urls;
    };
    let skill_md_paths = if skill_md_path == "SKILL.md" || skill_md_path.starts_with("skills/") {
        vec![skill_md_path]
    } else {
        vec![skill_md_path.clone(), format!("skills/{skill_md_path}")]
    };
    for branch in ["main", "master"] {
        for skill_md_path in &skill_md_paths {
            let candidate = format!(
                "https://raw.githubusercontent.com/{}/{}/{}",
                repo.trim_matches('/'),
                branch,
                skill_md_path
            );
            if !urls.iter().any(|url| url == &candidate) {
                urls.push(candidate);
            }
        }
    }
    urls
}

fn skill_directory_name_from_source_path(source_path: &str) -> Option<String> {
    let trimmed = source_path.trim().trim_matches('/');
    if trimmed.is_empty() || trimmed == "SKILL.md" || trimmed == "." {
        return None;
    }

    let without_manifest = trimmed.strip_suffix("/SKILL.md").unwrap_or(trimmed);
    without_manifest
        .rsplit('/')
        .find(|segment| !segment.trim().is_empty())
        .map(|segment| segment.to_string())
}

fn relocated_github_skill_md_url(
    source: &db::SkillSource,
    branch: &str,
    repo_paths: &[String],
) -> Option<(String, String)> {
    if source.source_type != "github" {
        return None;
    }
    let repo = source.source_repo.as_deref()?.trim_matches('/');
    let source_path = source.source_path.as_deref()?;
    let skill_dir = skill_directory_name_from_source_path(source_path)?;
    let repo_name = repo.rsplit('/').next()?;
    let root_repo_skill_name = repo_name.strip_suffix("-skill").unwrap_or(repo_name);
    if repo_paths.iter().any(|path| path == "SKILL.md")
        && (skill_dir == repo_name
            || skill_dir == root_repo_skill_name
            || skill_dir == source.skill_id)
    {
        return Some((
            format!("https://raw.githubusercontent.com/{repo}/{branch}/SKILL.md"),
            "SKILL.md".to_string(),
        ));
    }

    let expected_suffix = format!("/{skill_dir}/SKILL.md");
    let mut matches = repo_paths
        .iter()
        .filter(|path| {
            path.ends_with(&expected_suffix) || path.as_str() == format!("{skill_dir}/SKILL.md")
        })
        .collect::<Vec<_>>();
    matches.sort();
    matches.dedup();
    if matches.len() != 1 {
        return None;
    }

    let relocated_path = matches[0].trim_start_matches('/').to_string();
    Some((
        format!(
            "https://raw.githubusercontent.com/{}/{}/{}",
            repo, branch, relocated_path
        ),
        relocated_path,
    ))
}

fn github_source_from_url(url: &str) -> (Option<String>, Option<String>, Option<String>) {
    let Some(marker_index) = url.find("githubusercontent.com/") else {
        return (None, None, None);
    };
    let tail = &url[marker_index + "githubusercontent.com/".len()..];
    let parts: Vec<&str> = tail.split('/').collect();
    if parts.len() < 4 {
        return (None, None, None);
    }
    let author = parts[0].to_string();
    let repo = format!("{}/{}", parts[0], parts[1]);
    let source_path = if parts.len() >= 4 {
        let path = parts[3..].join("/").trim_matches('/').to_string();
        if path.is_empty() {
            None
        } else {
            Some(path)
        }
    } else {
        None
    };
    (Some(author), Some(repo), source_path)
}

async fn fetch_update_skill_markdown(
    client: &reqwest::Client,
    urls: &[String],
    auth: Option<&str>,
) -> Result<(String, String), String> {
    let mut last_error = None;
    for url in urls {
        match github_import::fetch_raw_text(client, url, auth).await {
            Ok(content) => return Ok((url.clone(), content)),
            Err(error) => last_error = Some(error),
        }
    }
    let tried = if urls.is_empty() {
        "no URL candidates".to_string()
    } else {
        urls.join(", ")
    };
    Err(format!(
        "{} Tried: {}",
        last_error.unwrap_or_else(|| "No update URL is available.".to_string()),
        tried
    ))
}

async fn fetch_relocated_github_skill_markdown(
    client: &reqwest::Client,
    source: &db::SkillSource,
    auth: Option<&str>,
) -> Result<Option<(String, String, String)>, String> {
    if source.source_type != "github" {
        return Ok(None);
    }
    let Some(repo) = source.source_repo.as_deref() else {
        return Ok(None);
    };
    let repo_url = format!("https://github.com/{}", repo.trim_matches('/'));
    let repo_ref = github_import::resolve_repo_ref(&repo_url, auth).await?;
    let repo_paths = github_import::fetch_repo_skill_manifest_paths(&repo_ref, auth).await?;
    let Some((relocated_url, relocated_path)) =
        relocated_github_skill_md_url(source, &repo_ref.branch, &repo_paths)
    else {
        return Ok(None);
    };
    let content = github_import::fetch_raw_text(client, &relocated_url, auth).await?;
    Ok(Some((relocated_url, relocated_path, content)))
}

fn skill_markdown_is_current(path: &Path, content: &str) -> bool {
    std::fs::read_to_string(path).is_ok_and(|existing| existing == content)
}

fn is_local_only_skill_source(source_type: &str) -> bool {
    matches!(source_type, "local-folder" | "manual")
}

fn source_update_item(
    skill: &db::Skill,
    status: SkillSourceUpdateStatus,
    error: Option<String>,
) -> SkillSourceUpdateItem {
    SkillSourceUpdateItem {
        skill_id: skill.id.clone(),
        name: skill.name.clone(),
        status,
        error,
    }
}

async fn apply_source_update_content(
    pool: &db::DbPool,
    skill: &db::Skill,
    source: &mut db::SkillSource,
    used_url: String,
    relocated_source_path: Option<String>,
    content: String,
) -> Result<SkillSourceUpdateStatus, String> {
    validate_update_skill_markdown(&skill.id, &content)?;
    let skill_md_path = PathBuf::from(&skill.file_path);
    let unchanged = skill_markdown_is_current(&skill_md_path, &content);
    if !unchanged {
        std::fs::write(&skill_md_path, &content)
            .map_err(|e| format!("Failed to write update for {}: {}", skill.id, e))?;
    }
    let used_source_path = relocated_source_path.or_else(|| github_source_from_url(&used_url).2);
    if source.source_url.as_deref() != Some(used_url.as_str())
        || used_source_path
            .as_deref()
            .is_some_and(|source_path| source.source_path.as_deref() != Some(source_path))
    {
        source.source_url = Some(used_url);
        if let Some(source_path) = used_source_path {
            source.source_path = Some(source_path);
        }
        source.updated_at = Utc::now().to_rfc3339();
        db::upsert_skill_source(pool, source).await?;
    }
    Ok(if unchanged {
        SkillSourceUpdateStatus::Unchanged
    } else {
        SkillSourceUpdateStatus::Updated
    })
}

fn sanitize_local_skill_id(name: &str) -> Result<String, String> {
    let id = name
        .trim()
        .to_lowercase()
        .replace(' ', "-")
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();

    if id.is_empty() {
        Err("Skill name cannot produce a valid local id".to_string())
    } else {
        Ok(id)
    }
}

async fn local_skill_id_for_source(
    pool: &db::DbPool,
    name: &str,
    source_url: &str,
    source_repo: Option<&str>,
    source_author: Option<&str>,
) -> Result<String, String> {
    let base_id = sanitize_local_skill_id(name)?;
    if skill_id_can_be_used_for_source(pool, &base_id, source_url).await? {
        return Ok(base_id);
    }

    let suffix_seed = source_repo.or(source_author).unwrap_or("remote-source");
    let suffix = sanitize_local_skill_id(&suffix_seed.replace('/', "-"))?;
    let mut candidate = format!("{}-{}", base_id, suffix);
    if skill_id_can_be_used_for_source(pool, &candidate, source_url).await? {
        return Ok(candidate);
    }

    for index in 2..1000 {
        candidate = format!("{}-{}-{}", base_id, suffix, index);
        if skill_id_can_be_used_for_source(pool, &candidate, source_url).await? {
            return Ok(candidate);
        }
    }

    Err(format!(
        "Unable to allocate a unique local id for skill '{}'",
        name
    ))
}

async fn skill_id_can_be_used_for_source(
    pool: &db::DbPool,
    skill_id: &str,
    source_url: &str,
) -> Result<bool, String> {
    if db::get_skill_by_id(pool, skill_id).await?.is_none() {
        return Ok(true);
    }

    let existing_source = db::get_skill_source(pool, skill_id).await?;
    Ok(existing_source
        .as_ref()
        .and_then(|source| source.source_url.as_deref())
        .is_some_and(|existing_url| existing_url == source_url))
}

async fn marketplace_skill_row(
    pool: &db::DbPool,
    skill_id: &str,
) -> Result<MarketplaceSkillRow, String> {
    sqlx::query_as::<_, MarketplaceSkillRow>(
        "SELECT ms.id, ms.registry_id, ms.name, ms.description, ms.download_url,
                sr.name AS registry_name, sr.url AS registry_url
         FROM marketplace_skills ms
         LEFT JOIN skill_registries sr ON sr.id = ms.registry_id
         WHERE ms.id = ?",
    )
    .bind(skill_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Skill not found".to_string())
}

pub async fn install_marketplace_skill_content_impl(
    pool: &db::DbPool,
    skill_id: &str,
    content: &str,
) -> Result<(), String> {
    let skill = marketplace_skill_row(pool, skill_id).await?;
    let frontmatter = parse_marketplace_skill_frontmatter(content);
    let resource_root = skill_resource_library_root(pool).await?;
    std::fs::create_dir_all(&resource_root)
        .map_err(|e| format!("Failed to create skill resource library directory: {}", e))?;

    let (url_author, url_repo, url_source_path) = github_source_from_url(&skill.download_url);
    let local_skill_id = local_skill_id_for_source(
        pool,
        &skill.name,
        &skill.download_url,
        url_repo.as_deref().or(skill.registry_url.as_deref()),
        url_author.as_deref().or(skill.registry_name.as_deref()),
    )
    .await?;
    let source_author = url_author.or(skill.registry_name.clone());
    let source_repo = url_repo.or(skill.registry_url.clone());
    let skill_dir = source_grouped_skill_dir(
        &resource_root,
        source_author.as_deref(),
        source_repo.as_deref(),
        Some(&skill.registry_id),
        &local_skill_id,
    );
    std::fs::create_dir_all(&skill_dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    let skill_md_path = skill_dir.join("SKILL.md");
    std::fs::write(&skill_md_path, content)
        .map_err(|e| format!("Failed to write SKILL.md: {}", e))?;

    let now = chrono::Utc::now().to_rfc3339();
    let name = frontmatter
        .as_ref()
        .map(|frontmatter| frontmatter.name.clone())
        .unwrap_or_else(|| skill.name.clone());
    let description = frontmatter
        .and_then(|frontmatter| frontmatter.description)
        .or(skill.description.clone());

    let db_skill = db::Skill {
        id: local_skill_id.clone(),
        name,
        description,
        file_path: skill_md_path.to_string_lossy().into_owned(),
        canonical_path: Some(skill_dir.to_string_lossy().into_owned()),
        is_central: false,
        source: skill
            .registry_url
            .clone()
            .or_else(|| Some(skill.registry_id.clone())),
        content: None,
        scanned_at: now.clone(),
    };
    db::upsert_skill(pool, &db_skill).await?;

    let source = db::SkillSource {
        skill_id: local_skill_id,
        source_type: "marketplace".to_string(),
        source_url: Some(skill.download_url.clone()),
        source_author,
        source_repo,
        source_path: url_source_path,
        updated_at: now,
    };
    db::upsert_skill_source(pool, &source).await?;

    sqlx::query("UPDATE marketplace_skills SET is_installed = 1 WHERE id = ?")
        .bind(&skill.id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

async fn install_remote_skill_content_impl(
    pool: &db::DbPool,
    name: &str,
    description: Option<String>,
    download_url: &str,
    source_label: Option<String>,
    content: &str,
) -> Result<(), String> {
    let frontmatter = parse_marketplace_skill_frontmatter(content);
    let resource_root = skill_resource_library_root(pool).await?;
    std::fs::create_dir_all(&resource_root)
        .map_err(|e| format!("Failed to create skill resource library directory: {}", e))?;

    let (url_author, url_repo, url_source_path) = github_source_from_url(download_url);
    let local_skill_id = local_skill_id_for_source(
        pool,
        name,
        download_url,
        url_repo.as_deref(),
        url_author.as_deref().or(source_label.as_deref()),
    )
    .await?;
    let source_author = url_author.or(source_label.clone());
    let source_repo = url_repo;
    let skill_dir = source_grouped_skill_dir(
        &resource_root,
        source_author.as_deref(),
        source_repo.as_deref(),
        Some("raw-url"),
        &local_skill_id,
    );
    std::fs::create_dir_all(&skill_dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    let skill_md_path = skill_dir.join("SKILL.md");
    std::fs::write(&skill_md_path, content)
        .map_err(|e| format!("Failed to write SKILL.md: {}", e))?;

    let now = chrono::Utc::now().to_rfc3339();
    let name = frontmatter
        .as_ref()
        .map(|frontmatter| frontmatter.name.clone())
        .unwrap_or_else(|| name.to_string());
    let description = frontmatter
        .and_then(|frontmatter| frontmatter.description)
        .or(description);
    let db_skill = db::Skill {
        id: local_skill_id.clone(),
        name,
        description,
        file_path: skill_md_path.to_string_lossy().into_owned(),
        canonical_path: Some(skill_dir.to_string_lossy().into_owned()),
        is_central: false,
        source: Some(download_url.to_string()),
        content: None,
        scanned_at: now.clone(),
    };
    db::upsert_skill(pool, &db_skill).await?;
    db::upsert_skill_source(
        pool,
        &db::SkillSource {
            skill_id: local_skill_id,
            source_type: "raw".to_string(),
            source_url: Some(download_url.to_string()),
            source_author,
            source_repo,
            source_path: url_source_path,
            updated_at: now,
        },
    )
    .await?;

    Ok(())
}

#[tauri::command]
pub async fn install_marketplace_skill(
    state: State<'_, AppState>,
    skill_id: String,
) -> Result<(), String> {
    let skill = marketplace_skill_row(&state.db, &skill_id).await?;

    // Download SKILL.md content
    let client = reqwest::Client::builder()
        .user_agent("SkillsHub/0.10.7")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(&skill.download_url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Download returned {}", resp.status()));
    }

    let content = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    install_marketplace_skill_content_impl(&state.db, &skill_id, &content).await
}

#[tauri::command]
pub async fn install_remote_skill_from_url(
    state: State<'_, AppState>,
    name: String,
    description: Option<String>,
    download_url: String,
    source_label: Option<String>,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent("SkillsHub/0.10.7")
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("Download returned {}", resp.status()));
    }
    let content = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    install_remote_skill_content_impl(
        &state.db,
        &name,
        description,
        &download_url,
        source_label,
        &content,
    )
    .await
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSourceUpdateProgress {
    pub current: u32,
    pub total: u32,
    pub name: String,
    pub skill_id: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SkillSourceUpdateStatus {
    Updated,
    Unchanged,
    Deleted,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSourceUpdateItem {
    pub skill_id: String,
    pub name: String,
    pub status: SkillSourceUpdateStatus,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSourceUpdateReport {
    pub items: Vec<SkillSourceUpdateItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositorySyncPreviewItem {
    pub skill_id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositorySyncPreview {
    pub repository: String,
    pub current_ref: Option<String>,
    pub remote_ref: Option<String>,
    pub added: Vec<RepositorySyncPreviewItem>,
    pub modified: Vec<RepositorySyncPreviewItem>,
    pub deleted: Vec<RepositorySyncPreviewItem>,
    pub unchanged: Vec<RepositorySyncPreviewItem>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositorySyncPreviewReport {
    pub repositories: Vec<RepositorySyncPreview>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RepositorySyncApplyOptions {
    pub remove_deleted: bool,
}

fn emit_source_update_progress(
    app: Option<&AppHandle>,
    current: u32,
    total: u32,
    name: &str,
    skill_id: &str,
) {
    if let Some(app) = app {
        let _ = app.emit(
            "skill-source-update:progress",
            SkillSourceUpdateProgress {
                current,
                total,
                name: name.to_string(),
                skill_id: skill_id.to_string(),
            },
        );
    }
}

#[tauri::command]
pub async fn update_source_backed_central_skills(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<SkillSourceUpdateReport, String> {
    update_source_backed_skills_impl(&state.db, true, Some(&app), false).await
}

#[tauri::command]
pub async fn update_source_backed_resource_skills(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<SkillSourceUpdateReport, String> {
    update_source_backed_skills_impl(&state.db, false, Some(&app), false).await
}

#[tauri::command]
pub async fn sync_source_backed_resource_skills(
    app: AppHandle,
    state: State<'_, AppState>,
    options: Option<RepositorySyncApplyOptions>,
) -> Result<SkillSourceUpdateReport, String> {
    update_source_backed_skills_impl(
        &state.db,
        false,
        Some(&app),
        options.unwrap_or_default().remove_deleted,
    )
    .await
}

async fn npx_repo_source_groups(
    pool: &db::DbPool,
    is_central: bool,
) -> Result<HashMap<String, Vec<(db::SkillSource, db::Skill)>>, String> {
    let sources = db::get_all_skill_sources(pool).await?;
    let syncs = db::get_all_skill_source_syncs(pool).await?;
    let syncs_by_skill = syncs
        .into_iter()
        .map(|sync| (sync.skill_id.clone(), sync))
        .collect::<HashMap<_, _>>();
    let mut groups: HashMap<String, Vec<(db::SkillSource, db::Skill)>> = HashMap::new();

    for source in sources {
        if source.source_type != "skills-cli" {
            continue;
        }
        let sync_scope = syncs_by_skill
            .get(&source.skill_id)
            .map(|sync| sync.sync_scope.as_str())
            .unwrap_or(skills_cli::NPX_SYNC_SCOPE_SKILL);
        if sync_scope != skills_cli::NPX_SYNC_SCOPE_REPO {
            continue;
        }
        let Some(skill) = db::get_skill_by_id(pool, &source.skill_id).await? else {
            continue;
        };
        if skill.is_central != is_central {
            continue;
        }
        if let Some(repo) = source
            .source_repo
            .as_deref()
            .or(source.source_url.as_deref())
            .map(str::trim)
            .filter(|repo| !repo.is_empty())
        {
            groups
                .entry(repo.to_string())
                .or_default()
                .push((source, skill));
        }
    }

    Ok(groups)
}

fn preview_item_from_skill(skill: &db::Skill) -> RepositorySyncPreviewItem {
    RepositorySyncPreviewItem {
        skill_id: skill.id.clone(),
        name: skill.name.clone(),
    }
}

fn preview_item_from_candidate(
    candidate: &github_import::RemoteSkillCandidate,
) -> RepositorySyncPreviewItem {
    RepositorySyncPreviewItem {
        skill_id: candidate.skill_id.clone(),
        name: candidate.skill_name.clone(),
    }
}

async fn preview_npx_repo_group(
    pool: &db::DbPool,
    repo: &str,
    group: &[(db::SkillSource, db::Skill)],
    auth: Option<&str>,
) -> RepositorySyncPreview {
    let mut current_ref = None;
    for (source, _) in group {
        if let Ok(Some(sync)) = db::get_skill_source_sync(pool, &source.skill_id).await {
            if sync
                .remote_ref
                .as_deref()
                .is_some_and(|value| !value.trim().is_empty())
            {
                current_ref = sync.remote_ref;
                break;
            }
        }
    }

    let repo_ref =
        match github_import::resolve_repo_ref(&format!("https://github.com/{repo}"), auth).await {
            Ok(repo_ref) => repo_ref,
            Err(error) => {
                return RepositorySyncPreview {
                    repository: repo.to_string(),
                    current_ref,
                    remote_ref: None,
                    added: Vec::new(),
                    modified: Vec::new(),
                    deleted: Vec::new(),
                    unchanged: group
                        .iter()
                        .map(|(_, skill)| preview_item_from_skill(skill))
                        .collect(),
                    error: Some(error),
                }
            }
        };

    let remote_ref = match github_import::fetch_repo_head_ref(&repo_ref, auth).await {
        Ok(remote_ref) => remote_ref,
        Err(error) => {
            return RepositorySyncPreview {
                repository: repo.to_string(),
                current_ref,
                remote_ref: None,
                added: Vec::new(),
                modified: Vec::new(),
                deleted: Vec::new(),
                unchanged: group
                    .iter()
                    .map(|(_, skill)| preview_item_from_skill(skill))
                    .collect(),
                error: Some(error),
            }
        }
    };

    let candidates = match github_import::fetch_repo_skill_candidates(&repo_ref, auth).await {
        Ok(candidates) => candidates,
        Err(error) => {
            return RepositorySyncPreview {
                repository: repo.to_string(),
                current_ref,
                remote_ref: Some(remote_ref),
                added: Vec::new(),
                modified: Vec::new(),
                deleted: Vec::new(),
                unchanged: group
                    .iter()
                    .map(|(_, skill)| preview_item_from_skill(skill))
                    .collect(),
                error: Some(error),
            }
        }
    };

    let local_ids = group
        .iter()
        .map(|(_, skill)| skill.id.clone())
        .collect::<HashSet<_>>();
    let remote_ids = candidates
        .iter()
        .map(|candidate| candidate.skill_id.clone())
        .collect::<HashSet<_>>();
    let remote_by_id = candidates
        .iter()
        .map(|candidate| (candidate.skill_id.clone(), candidate))
        .collect::<HashMap<_, _>>();
    let remote_changed = current_ref.as_deref() != Some(remote_ref.as_str());

    let mut added = candidates
        .iter()
        .filter(|candidate| !local_ids.contains(&candidate.skill_id))
        .map(preview_item_from_candidate)
        .collect::<Vec<_>>();
    let mut modified = Vec::new();
    let mut deleted = Vec::new();
    let mut unchanged = Vec::new();

    for (_, skill) in group {
        if remote_ids.contains(&skill.id) {
            let item = remote_by_id
                .get(&skill.id)
                .map(|candidate| preview_item_from_candidate(candidate))
                .unwrap_or_else(|| preview_item_from_skill(skill));
            if remote_changed {
                modified.push(item);
            } else {
                unchanged.push(item);
            }
        } else {
            deleted.push(preview_item_from_skill(skill));
        }
    }

    added.sort_by(|left, right| left.skill_id.cmp(&right.skill_id));
    modified.sort_by(|left, right| left.skill_id.cmp(&right.skill_id));
    deleted.sort_by(|left, right| left.skill_id.cmp(&right.skill_id));
    unchanged.sort_by(|left, right| left.skill_id.cmp(&right.skill_id));

    RepositorySyncPreview {
        repository: repo.to_string(),
        current_ref,
        remote_ref: Some(remote_ref),
        added,
        modified,
        deleted,
        unchanged,
        error: None,
    }
}

#[tauri::command]
pub async fn preview_source_backed_resource_repository_updates(
    state: State<'_, AppState>,
) -> Result<RepositorySyncPreviewReport, String> {
    let auth = github_import::github_direct_auth_from_settings(&state.db).await?;
    let groups = npx_repo_source_groups(&state.db, false).await?;
    let mut repositories = Vec::new();
    for (repo, group) in groups {
        repositories.push(preview_npx_repo_group(&state.db, &repo, &group, auth.as_deref()).await);
    }
    repositories.sort_by(|left, right| left.repository.cmp(&right.repository));
    Ok(RepositorySyncPreviewReport { repositories })
}

async fn update_source_backed_skills_impl(
    pool: &db::DbPool,
    is_central: bool,
    app: Option<&AppHandle>,
    remove_remote_deleted: bool,
) -> Result<SkillSourceUpdateReport, String> {
    let sources = db::get_all_skill_sources(pool).await?;
    let syncs = db::get_all_skill_source_syncs(pool).await?;
    let syncs_by_skill = syncs
        .into_iter()
        .map(|sync| (sync.skill_id.clone(), sync))
        .collect::<HashMap<_, _>>();
    let auth = github_import::github_direct_auth_from_settings(pool).await?;
    let client = reqwest::Client::builder()
        .user_agent("SkillsHub/0.10.7")
        .build()
        .map_err(|e| e.to_string())?;
    let mut items = Vec::new();
    let mut github_jobs: Vec<(db::SkillSource, db::Skill)> = Vec::new();
    let mut npx_repo_sources: HashMap<String, Vec<(db::SkillSource, db::Skill)>> = HashMap::new();
    let mut npx_skill_sources = Vec::new();
    let mut local_skipped = Vec::new();
    let mut unupdatable = Vec::new();

    for source in sources {
        let Some(skill) = db::get_skill_by_id(pool, &source.skill_id).await? else {
            continue;
        };
        if skill.is_central != is_central {
            continue;
        }

        if is_local_only_skill_source(&source.source_type) {
            local_skipped.push(skill);
            continue;
        }

        if source.source_type == "skills-cli" {
            let sync_scope = syncs_by_skill
                .get(&source.skill_id)
                .map(|sync| sync.sync_scope.as_str())
                .unwrap_or(skills_cli::NPX_SYNC_SCOPE_SKILL);
            if sync_scope == skills_cli::NPX_SYNC_SCOPE_REPO {
                if let Some(repo) = source
                    .source_repo
                    .as_deref()
                    .or(source.source_url.as_deref())
                    .map(str::trim)
                    .filter(|repo| !repo.is_empty())
                {
                    npx_repo_sources
                        .entry(repo.to_string())
                        .or_default()
                        .push((source, skill));
                }
            } else {
                npx_skill_sources.push((source, skill));
            }
            continue;
        }

        if github_raw_update_urls(&source).is_empty() {
            unupdatable.push(skill);
            continue;
        }
        github_jobs.push((source, skill));
    }

    let npx_repo_skill_count: usize = npx_repo_sources.values().map(Vec::len).sum();
    let total = (github_jobs.len()
        + npx_repo_skill_count
        + npx_skill_sources.len()
        + local_skipped.len()
        + unupdatable.len()) as u32;
    let mut current = 0_u32;

    for (mut source, skill) in github_jobs {
        current += 1;
        emit_source_update_progress(app, current, total, &skill.name, &skill.id);
        let urls = github_raw_update_urls(&source);
        let (used_url, relocated_source_path, content) =
            match fetch_update_skill_markdown(&client, &urls, auth.as_deref()).await {
                Ok((used_url, content)) => (used_url, None, content),
                Err(primary_error) => {
                    match fetch_relocated_github_skill_markdown(&client, &source, auth.as_deref())
                        .await
                    {
                        Ok(Some((used_url, source_path, content))) => {
                            (used_url, Some(source_path), content)
                        }
                        Ok(None) => {
                            items.push(source_update_item(
                                &skill,
                                SkillSourceUpdateStatus::Failed,
                                Some(primary_error),
                            ));
                            continue;
                        }
                        Err(relocate_error) => {
                            items.push(source_update_item(
                                &skill,
                                SkillSourceUpdateStatus::Failed,
                                Some(format!(
                                    "{primary_error}; relocate failed: {relocate_error}"
                                )),
                            ));
                            continue;
                        }
                    }
                }
            };
        match apply_source_update_content(
            pool,
            &skill,
            &mut source,
            used_url,
            relocated_source_path,
            content,
        )
        .await
        {
            Ok(status) => items.push(source_update_item(&skill, status, None)),
            Err(error) => {
                items.push(source_update_item(
                    &skill,
                    SkillSourceUpdateStatus::Failed,
                    Some(error),
                ));
            }
        }
    }

    for (repo, group) in npx_repo_sources {
        if let Some((_, first)) = group.first() {
            emit_source_update_progress(app, current + 1, total, &first.name, &first.id);
        }
        let group_result = update_npx_repo_source_group(pool, &repo, &group, auth.as_deref()).await;
        for (_, skill) in group {
            current += 1;
            emit_source_update_progress(app, current, total, &skill.name, &skill.id);
            match &group_result {
                Ok(result) if result.unchanged => {
                    items.push(source_update_item(
                        &skill,
                        SkillSourceUpdateStatus::Unchanged,
                        None,
                    ));
                }
                Ok(result) if result.updated_ids.contains(&skill.id) => {
                    items.push(source_update_item(
                        &skill,
                        SkillSourceUpdateStatus::Updated,
                        None,
                    ));
                }
                Ok(result) if result.deleted_ids.contains(&skill.id) => {
                    if remove_remote_deleted && !is_central {
                        match skills::delete_resource_skill_impl(
                            pool,
                            &skill.id,
                            skills::DeleteResourceSkillOptions {
                                cascade_uninstall: true,
                            },
                        )
                        .await
                        {
                            Ok(_) => items.push(source_update_item(
                                &skill,
                                SkillSourceUpdateStatus::Deleted,
                                Some(
                                    "Removed because the skill no longer exists upstream."
                                        .to_string(),
                                ),
                            )),
                            Err(error) => items.push(source_update_item(
                                &skill,
                                SkillSourceUpdateStatus::Failed,
                                Some(error),
                            )),
                        }
                    } else {
                        items.push(source_update_item(
                            &skill,
                            SkillSourceUpdateStatus::Skipped,
                            Some(
                                "The skill was not returned by the latest repository import."
                                    .to_string(),
                            ),
                        ));
                    }
                }
                Ok(_) => {
                    items.push(source_update_item(
                        &skill,
                        SkillSourceUpdateStatus::Skipped,
                        None,
                    ));
                }
                Err(error) => {
                    items.push(source_update_item(
                        &skill,
                        SkillSourceUpdateStatus::Failed,
                        Some(error.clone()),
                    ));
                }
            }
        }
        if let Ok(result) = &group_result {
            for added_id in &result.added_ids {
                if let Some(skill) = db::get_skill_by_id(pool, added_id).await? {
                    items.push(source_update_item(
                        &skill,
                        SkillSourceUpdateStatus::Updated,
                        Some("Added from the latest repository import.".to_string()),
                    ));
                }
            }
        }
    }

    for (source, skill) in npx_skill_sources {
        current += 1;
        emit_source_update_progress(app, current, total, &skill.name, &skill.id);
        match update_npx_skill_source(pool, &source, &skill, auth.as_deref()).await {
            Ok(Some(_)) => items.push(source_update_item(
                &skill,
                SkillSourceUpdateStatus::Updated,
                None,
            )),
            Ok(None) => items.push(source_update_item(
                &skill,
                SkillSourceUpdateStatus::Unchanged,
                None,
            )),
            Err(error) => items.push(source_update_item(
                &skill,
                SkillSourceUpdateStatus::Failed,
                Some(error),
            )),
        }
    }

    for skill in local_skipped {
        current += 1;
        emit_source_update_progress(app, current, total, &skill.name, &skill.id);
        items.push(source_update_item(
            &skill,
            SkillSourceUpdateStatus::Skipped,
            None,
        ));
    }

    for skill in unupdatable {
        current += 1;
        emit_source_update_progress(app, current, total, &skill.name, &skill.id);
        items.push(source_update_item(
            &skill,
            SkillSourceUpdateStatus::Failed,
            Some(format!(
                "Skill '{}' source is not an updatable SKILL.md file",
                skill.id
            )),
        ));
    }

    Ok(SkillSourceUpdateReport { items })
}

fn npx_source_input(source: &db::SkillSource) -> Option<String> {
    source
        .source_repo
        .as_deref()
        .or(source.source_url.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

async fn fetch_npx_source_remote_ref(repo: &str, auth: Option<&str>) -> Result<String, String> {
    let repo_ref = github_import::resolve_repo_ref(&format!("https://github.com/{repo}"), auth)
        .await
        .map_err(|error| format!("failed to resolve repository: {error}"))?;
    github_import::fetch_repo_head_ref(&repo_ref, auth)
        .await
        .map_err(|error| format!("failed to inspect repository head: {error}"))
}

async fn current_skill_sync(
    pool: &db::DbPool,
    skill_id: &str,
) -> Result<db::SkillSourceSync, String> {
    let now = Utc::now().to_rfc3339();
    Ok(db::get_skill_source_sync(pool, skill_id)
        .await?
        .unwrap_or(db::SkillSourceSync {
            skill_id: skill_id.to_string(),
            sync_scope: skills_cli::NPX_SYNC_SCOPE_SKILL.to_string(),
            remote_ref: None,
            skill_fingerprint: None,
            last_checked_at: None,
            last_sync_at: None,
            sync_status: "never".to_string(),
            sync_error: None,
            remote_deleted: false,
            updated_at: now,
        }))
}

struct NpxSyncStatusRecord<'a> {
    skill_id: &'a str,
    sync_scope: &'a str,
    remote_ref: Option<&'a str>,
    status: &'a str,
    error: Option<&'a str>,
    remote_deleted: bool,
    synced: bool,
}

async fn record_npx_sync_status(
    pool: &db::DbPool,
    record: NpxSyncStatusRecord<'_>,
) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    let existing = db::get_skill_source_sync(pool, record.skill_id).await?;
    db::upsert_skill_source_sync(
        pool,
        &db::SkillSourceSync {
            skill_id: record.skill_id.to_string(),
            sync_scope: record.sync_scope.to_string(),
            remote_ref: record
                .remote_ref
                .map(str::to_string)
                .or_else(|| existing.as_ref().and_then(|sync| sync.remote_ref.clone())),
            skill_fingerprint: existing
                .as_ref()
                .and_then(|sync| sync.skill_fingerprint.clone()),
            last_checked_at: Some(now.clone()),
            last_sync_at: if record.synced {
                Some(now.clone())
            } else {
                existing.as_ref().and_then(|sync| sync.last_sync_at.clone())
            },
            sync_status: record.status.to_string(),
            sync_error: record.error.map(str::to_string),
            remote_deleted: record.remote_deleted,
            updated_at: now,
        },
    )
    .await
}

struct NpxRepoGroupUpdate {
    updated_ids: HashSet<String>,
    added_ids: HashSet<String>,
    deleted_ids: HashSet<String>,
    unchanged: bool,
}

async fn update_npx_repo_source_group(
    pool: &db::DbPool,
    repo: &str,
    group: &[(db::SkillSource, db::Skill)],
    auth: Option<&str>,
) -> Result<NpxRepoGroupUpdate, String> {
    let remote_ref = fetch_npx_source_remote_ref(repo, auth).await?;
    let mut last_remote_ref = None;
    for (source, _) in group {
        if let Some(sync) = db::get_skill_source_sync(pool, &source.skill_id).await? {
            if sync
                .remote_ref
                .as_deref()
                .is_some_and(|value| !value.trim().is_empty())
            {
                last_remote_ref = sync.remote_ref;
                break;
            }
        }
    }
    if last_remote_ref.as_deref() == Some(remote_ref.as_str()) {
        for (source, _) in group {
            record_npx_sync_status(
                pool,
                NpxSyncStatusRecord {
                    skill_id: &source.skill_id,
                    sync_scope: skills_cli::NPX_SYNC_SCOPE_REPO,
                    remote_ref: Some(&remote_ref),
                    status: "unchanged",
                    error: None,
                    remote_deleted: false,
                    synced: false,
                },
            )
            .await?;
        }
        return Ok(NpxRepoGroupUpdate {
            updated_ids: HashSet::new(),
            added_ids: HashSet::new(),
            deleted_ids: HashSet::new(),
            unchanged: true,
        });
    }

    let request = skills_cli::ImportSkillsViaNpxRequest {
        input: repo.to_string(),
        skill: None,
        overwrite: true,
    };
    let result = skills_cli::import_skills_via_npx_impl(pool, request).await?;
    let imported_ids = result
        .local_import
        .added_skills
        .iter()
        .map(|skill| skill.id.clone())
        .collect::<HashSet<_>>();
    let existing_ids = group
        .iter()
        .map(|(source, _)| source.skill_id.clone())
        .collect::<HashSet<_>>();
    let added_ids = imported_ids
        .difference(&existing_ids)
        .cloned()
        .collect::<HashSet<_>>();
    let deleted_ids = existing_ids
        .difference(&imported_ids)
        .cloned()
        .collect::<HashSet<_>>();
    for skill in &result.local_import.added_skills {
        record_npx_sync_status(
            pool,
            NpxSyncStatusRecord {
                skill_id: &skill.id,
                sync_scope: skills_cli::NPX_SYNC_SCOPE_REPO,
                remote_ref: Some(&remote_ref),
                status: "success",
                error: None,
                remote_deleted: false,
                synced: true,
            },
        )
        .await?;
    }
    for (source, _) in group {
        if !imported_ids.contains(&source.skill_id) {
            record_npx_sync_status(
                pool,
                NpxSyncStatusRecord {
                    skill_id: &source.skill_id,
                    sync_scope: skills_cli::NPX_SYNC_SCOPE_REPO,
                    remote_ref: Some(&remote_ref),
                    status: "remote_deleted",
                    error: Some("The skill was not returned by the latest repository import."),
                    remote_deleted: true,
                    synced: false,
                },
            )
            .await?;
        }
    }
    Ok(NpxRepoGroupUpdate {
        updated_ids: imported_ids,
        added_ids,
        deleted_ids,
        unchanged: false,
    })
}

async fn update_npx_skill_source(
    pool: &db::DbPool,
    source: &db::SkillSource,
    skill: &db::Skill,
    auth: Option<&str>,
) -> Result<Option<String>, String> {
    let repo = npx_source_input(source)
        .ok_or_else(|| "source repository is missing for npx skills update".to_string())?;
    let remote_ref = fetch_npx_source_remote_ref(&repo, auth).await?;
    let sync = current_skill_sync(pool, &source.skill_id).await?;
    if sync.remote_ref.as_deref() == Some(remote_ref.as_str()) {
        record_npx_sync_status(
            pool,
            NpxSyncStatusRecord {
                skill_id: &source.skill_id,
                sync_scope: skills_cli::NPX_SYNC_SCOPE_SKILL,
                remote_ref: Some(&remote_ref),
                status: "unchanged",
                error: None,
                remote_deleted: false,
                synced: false,
            },
        )
        .await?;
        return Ok(None);
    }
    let mut request = skills_cli::npx_update_request_from_source(source)
        .ok_or_else(|| "source is not an npx skills source".to_string())?;
    if request.skill.is_none() {
        request.skill = Some(skill.id.clone());
    }
    let result = skills_cli::import_skills_via_npx_impl(pool, request).await?;
    let updated = result
        .local_import
        .added_skills
        .into_iter()
        .find(|updated_skill| updated_skill.id == skill.id);
    if updated.is_some() {
        record_npx_sync_status(
            pool,
            NpxSyncStatusRecord {
                skill_id: &source.skill_id,
                sync_scope: skills_cli::NPX_SYNC_SCOPE_SKILL,
                remote_ref: Some(&remote_ref),
                status: "success",
                error: None,
                remote_deleted: false,
                synced: true,
            },
        )
        .await?;
        Ok(Some(skill.id.clone()))
    } else {
        record_npx_sync_status(
            pool,
            NpxSyncStatusRecord {
                skill_id: &source.skill_id,
                sync_scope: skills_cli::NPX_SYNC_SCOPE_SKILL,
                remote_ref: Some(&remote_ref),
                status: "remote_deleted",
                error: Some("The skill was not returned by the latest repository import."),
                remote_deleted: true,
                synced: false,
            },
        )
        .await?;
        Err(
            "npx skills did not import this skill; it may have been removed or renamed upstream."
                .to_string(),
        )
    }
}

#[tauri::command]
pub async fn update_source_backed_central_skill(
    state: State<'_, AppState>,
    skill_id: String,
) -> Result<String, String> {
    update_source_backed_skill_impl(&state.db, &skill_id, true).await
}

#[tauri::command]
pub async fn update_source_backed_resource_skill(
    state: State<'_, AppState>,
    skill_id: String,
) -> Result<String, String> {
    update_source_backed_skill_impl(&state.db, &skill_id, false).await
}

async fn update_source_backed_skill_impl(
    pool: &db::DbPool,
    skill_id: &str,
    is_central: bool,
) -> Result<String, String> {
    let mut source = db::get_skill_source(pool, skill_id)
        .await?
        .ok_or_else(|| format!("Skill '{}' has no recorded source", skill_id))?;
    let skill = db::get_skill_by_id(pool, skill_id)
        .await?
        .ok_or_else(|| format!("Skill '{}' not found", skill_id))?;
    if skill.is_central != is_central {
        return Err(format!(
            "Skill '{}' is not in the requested update scope",
            skill_id
        ));
    }

    if let Some(request) = skills_cli::npx_update_request_from_source(&source) {
        let auth = github_import::github_direct_auth_from_settings(pool).await?;
        if request.skill.is_none() {
            let result = update_npx_repo_source_group(
                pool,
                &request.input,
                &[(source.clone(), skill.clone())],
                auth.as_deref(),
            )
            .await?;
            if result.unchanged || result.updated_ids.contains(&skill.id) {
                return Ok(skill.id.clone());
            }
            return Err(
                "npx skills did not import this skill; it may have been removed or renamed upstream."
                    .to_string(),
            );
        }
        return update_npx_skill_source(pool, &source, &skill, auth.as_deref())
            .await
            .map(|updated| updated.unwrap_or_else(|| skill.id.clone()))
            .map_err(|error| format!("Failed to update {}: {}", skill.id, error));
    }

    let urls = github_raw_update_urls(&source);
    if urls.is_empty() {
        return Err(format!(
            "Skill '{}' source is not an updatable SKILL.md file",
            skill_id
        ));
    }
    let auth = github_import::github_direct_auth_from_settings(pool).await?;
    let client = reqwest::Client::builder()
        .user_agent("SkillsHub/0.10.7")
        .build()
        .map_err(|e| e.to_string())?;
    let (used_url, relocated_source_path, content) =
        match fetch_update_skill_markdown(&client, &urls, auth.as_deref()).await {
            Ok((used_url, content)) => (used_url, None, content),
            Err(primary_error) => {
                fetch_relocated_github_skill_markdown(&client, &source, auth.as_deref())
                    .await?
                    .map(|(used_url, source_path, content)| (used_url, Some(source_path), content))
                    .ok_or_else(|| format!("Failed to update {}: {}", skill.id, primary_error))?
            }
        };
    apply_source_update_content(
        pool,
        &skill,
        &mut source,
        used_url,
        relocated_source_path,
        content,
    )
    .await?;
    Ok(skill.id.clone())
}

// ─── AI Explanation ──────────────────────────────────────────────────────────

#[derive(Serialize)]
struct ClaudeRequest {
    model: String,
    max_tokens: u32,
    messages: Vec<ClaudeMessage>,
}

#[derive(Serialize)]
struct ClaudeMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct ClaudeResponse {
    content: Vec<ClaudeContentBlock>,
}

#[derive(Deserialize)]
struct ClaudeContentBlock {
    #[serde(rename = "type", default)]
    block_type: String,
    #[serde(default)]
    text: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ExplanationApiProtocol {
    AnthropicCompatible,
    OpenAiCompatible,
    Unknown,
}

fn detect_explanation_api_protocol(api_url: &str) -> ExplanationApiProtocol {
    let path = reqwest::Url::parse(api_url)
        .ok()
        .map(|url| url.path().trim_end_matches('/').to_ascii_lowercase())
        .unwrap_or_else(|| api_url.trim_end_matches('/').to_ascii_lowercase());

    if path.ends_with("/v1/messages") || path.contains("/anthropic/v1/messages") {
        return ExplanationApiProtocol::AnthropicCompatible;
    }

    if path.ends_with("/v1/chat/completions") {
        return ExplanationApiProtocol::OpenAiCompatible;
    }

    ExplanationApiProtocol::Unknown
}

/// Error kind for AI explanation network failures, used by the frontend
/// to render targeted UI (friendly summary + expandable details).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ExplanationErrorKind {
    Proxy,
    Connect,
    Timeout,
    Dns,
    Tls,
    Auth,
    Response,
    Unknown,
}

/// Structured AI explanation error payload sent via Tauri events.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplanationErrorInfo {
    pub message: String,
    pub details: String,
    pub kind: ExplanationErrorKind,
    pub retryable: bool,
    pub fallback_tried: bool,
}

/// Classify a reqwest error into a structured `ExplanationErrorInfo`.
fn classify_reqwest_error(e: &reqwest::Error, fallback_tried: bool) -> ExplanationErrorInfo {
    use std::error::Error as _;

    let mut parts: Vec<String> = vec![e.to_string()];
    let mut cur: Option<&(dyn std::error::Error + 'static)> = e.source();
    while let Some(src) = cur {
        parts.push(src.to_string());
        cur = src.source();
    }
    let chain = parts.join(" → ");
    let low = chain.to_ascii_lowercase();

    let (kind, message, retryable) = if low.contains("tunnel")
        || (low.contains("proxy") && low.contains("connect"))
        || (low.contains("proxy") && low.contains("unsuccessful"))
    {
        (
            ExplanationErrorKind::Proxy,
            "代理或网络隧道连接失败，请尝试切换区域端点或在终端执行 `unset HTTPS_PROXY HTTP_PROXY ALL_PROXY` 后重启应用".to_string(),
            true,
        )
    } else if low.contains("proxy") {
        (
            ExplanationErrorKind::Proxy,
            "系统代理可能拦截了请求。请尝试为该域名配置直连规则或切换区域端点".to_string(),
            true,
        )
    } else if e.is_timeout() || low.contains("timed out") {
        (
            ExplanationErrorKind::Timeout,
            "请求超时，可能网络不通或被防火墙拦截。可在终端 `curl -v <url>` 验证连通性".to_string(),
            true,
        )
    } else if e.is_connect() || low.contains("connect") {
        (
            ExplanationErrorKind::Connect,
            "无法建立连接。请确认 URL 可从本机访问，或尝试切换区域端点".to_string(),
            true,
        )
    } else if low.contains("dns") || low.contains("lookup") {
        (
            ExplanationErrorKind::Dns,
            "DNS 解析失败。请确认域名拼写正确，或尝试切换 DNS".to_string(),
            true,
        )
    } else if low.contains("certificate") || low.contains("tls") || low.contains("handshake") {
        (
            ExplanationErrorKind::Tls,
            "TLS/证书握手失败。请检查系统时间是否正确，或排查中间人代理".to_string(),
            false,
        )
    } else {
        (
            ExplanationErrorKind::Unknown,
            "网络请求失败".to_string(),
            false,
        )
    };

    ExplanationErrorInfo {
        message,
        details: chain,
        kind,
        retryable,
        fallback_tried,
    }
}

/// Expand a `reqwest::Error` into a single readable string (for non-streaming path).
fn format_reqwest_error(e: &reqwest::Error) -> String {
    let info = classify_reqwest_error(e, false);
    if info.message.is_empty() {
        info.details
    } else {
        format!("{}\n{}", info.details, info.message)
    }
}

#[tauri::command]
pub async fn explain_skill(state: State<'_, AppState>, content: String) -> Result<String, String> {
    // Read dynamic provider settings
    async fn get_setting(pool: &crate::db::DbPool, key: &str) -> Option<String> {
        sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
            .bind(key)
            .fetch_optional(pool)
            .await
            .ok()
            .flatten()
            .filter(|v| !v.trim().is_empty())
    }

    let api_key = get_setting(&state.db, "ai_api_key")
        .await
        .ok_or_else(|| "请先在设置中配置 AI API Key".to_string())?;

    let api_url = get_setting(&state.db, "ai_api_url")
        .await
        .unwrap_or_else(|| "https://api.anthropic.com/v1/messages".to_string());

    let model = get_setting(&state.db, "ai_model")
        .await
        .unwrap_or_else(|| "claude-sonnet-4-20250514".to_string());

    let client = reqwest::Client::builder()
        .user_agent("SkillsHub/0.10.7")
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    // Truncate content if too long
    let truncated = if content.len() > 8000 {
        format!("{}...\n\n(内容已截断)", &content[..8000])
    } else {
        content
    };

    let request = ClaudeRequest {
        model,
        max_tokens: 1024,
        messages: vec![ClaudeMessage {
            role: "user".to_string(),
            content: format!(
                "请用中文简洁地解释以下 AI Agent Skill（SKILL.md）的用途、使用场景和关键功能。\
                分为三部分：1) 一句话总结 2) 适用场景 3) 关键功能点。\
                控制在 200 字以内。\n\n---\n\n{}",
                truncated
            ),
        }],
    };

    let protocol = detect_explanation_api_protocol(&api_url);
    let mut req_builder = client
        .post(&api_url)
        .header("content-type", "application/json");

    match protocol {
        ExplanationApiProtocol::AnthropicCompatible | ExplanationApiProtocol::Unknown => {
            req_builder = req_builder
                .header("x-api-key", &api_key)
                .header("anthropic-version", "2023-06-01");
        }
        ExplanationApiProtocol::OpenAiCompatible => {
            req_builder = req_builder.header("authorization", format!("Bearer {}", api_key));
        }
    }

    let resp = req_builder
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("API 请求失败: {}", format_reqwest_error(&e)))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("API 返回错误 {}: {}", status, body));
    }

    let body = resp
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {}", e))?;

    // Try parsing as Anthropic format: { "content": [{ "type": "text", "text": "..." }] }
    if let Ok(claude_resp) = serde_json::from_str::<ClaudeResponse>(&body) {
        // Filter for "text" type blocks, skip "thinking" blocks
        if let Some(block) = claude_resp
            .content
            .iter()
            .find(|b| b.block_type.is_empty() || b.block_type == "text")
        {
            if !block.text.is_empty() {
                return Ok(block.text.clone());
            }
        }
    }

    // Fallback: try extracting text from any JSON with a "text" or "content" field
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&body) {
        // Some providers return { "choices": [{ "message": { "content": "..." } }] }
        if let Some(text) = val
            .get("choices")
            .and_then(|c| c.get(0))
            .and_then(|c| c.get("message"))
            .and_then(|m| m.get("content"))
            .and_then(|c| c.as_str())
        {
            return Ok(text.to_string());
        }
    }

    Err(format!("无法解析响应: {}", &body[..body.len().min(500)]))
}

// ─── Streaming AI Explanation ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExplanationChunkPayload {
    pub skill_id: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExplanationCompletePayload {
    pub skill_id: String,
    pub explanation: Option<String>,
}

fn explanation_has_content(explanation: &str) -> bool {
    !explanation.trim().is_empty()
}

async fn delete_cached_skill_explanation(
    pool: &crate::db::DbPool,
    skill_id: &str,
    lang: &str,
) -> Result<(), String> {
    sqlx::query("DELETE FROM skill_explanations WHERE skill_id = ? AND lang = ?")
        .bind(skill_id)
        .bind(lang)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

async fn load_cached_skill_explanation(
    pool: &crate::db::DbPool,
    skill_id: &str,
    lang: &str,
) -> Result<Option<String>, String> {
    use sqlx::Row;

    let row =
        sqlx::query("SELECT explanation FROM skill_explanations WHERE skill_id = ? AND lang = ?")
            .bind(skill_id)
            .bind(lang)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;

    match row {
        Some(row) => {
            let explanation: String = row.get("explanation");
            if explanation_has_content(&explanation) {
                Ok(Some(explanation))
            } else {
                // Older builds could persist empty strings. Treat them as cache
                // corruption so the next request re-generates a fresh explanation.
                delete_cached_skill_explanation(pool, skill_id, lang).await?;
                Ok(None)
            }
        }
        None => Ok(None),
    }
}

async fn cache_skill_explanation(
    pool: &crate::db::DbPool,
    skill_id: &str,
    lang: &str,
    model: &str,
    explanation: &str,
) -> Result<(), String> {
    if !explanation_has_content(explanation) {
        return Err("AI explanation returned no content.".to_string());
    }

    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT OR REPLACE INTO skill_explanations (skill_id, explanation, lang, model, created_at, updated_at)
         VALUES (?, ?, ?, ?, 
            COALESCE((SELECT created_at FROM skill_explanations WHERE skill_id = ? AND lang = ?), ?),
            ?)",
    )
    .bind(skill_id)
    .bind(explanation)
    .bind(lang)
    .bind(model)
    .bind(skill_id)
    .bind(lang)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| format!("缓存解释失败: {}", e))?;

    Ok(())
}

fn empty_explanation_error_info(lang: &str, saw_thinking_delta: bool) -> ExplanationErrorInfo {
    let message = match lang {
        "en" => "The model returned no displayable explanation text.".to_string(),
        _ => "模型没有返回可显示的解释正文。".to_string(),
    };
    let details = if saw_thinking_delta {
        "Streaming completed without any text_delta content. The provider emitted thinking deltas but no final text block.".to_string()
    } else {
        "Streaming completed without any text_delta content.".to_string()
    };

    ExplanationErrorInfo {
        message,
        details,
        kind: ExplanationErrorKind::Response,
        retryable: true,
        fallback_tried: false,
    }
}

/// Helper: read a setting from the DB, filtering out empty values.
async fn get_ai_setting(pool: &crate::db::DbPool, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.trim().is_empty())
}

/// Helper: truncate skill content to 8000 chars.
fn truncate_content(content: &str) -> String {
    if content.len() > 8000 {
        format!("{}...\n\n(内容已截断)", &content[..8000])
    } else {
        content.to_string()
    }
}

/// Helper: build the explanation prompt based on language.
fn build_explanation_prompt(truncated: &str, lang: &str) -> String {
    match lang {
        "en" => format!(
            "Please explain in English concisely the purpose, use cases, and key features \
            of the following AI Agent Skill (SKILL.md). \
            Divide into three parts: 1) One-sentence summary 2) Applicable scenarios 3) Key features. \
            Keep it under 200 words.\n\n---\n\n{}",
            truncated
        ),
        _ => format!(
            "请用中文简洁地解释以下 AI Agent Skill（SKILL.md）的用途、使用场景和关键功能。\
            分为三部分：1) 一句话总结 2) 适用场景 3) 关键功能点。\
            控制在 200 字以内。\n\n---\n\n{}",
            truncated
        ),
    }
}

/// Build the streaming request body as serde_json::Value.
/// Both Anthropic and OpenAI use the same messages format with `stream: true`.
fn build_stream_request_body(model: &str, prompt: &str) -> serde_json::Value {
    serde_json::json!({
        "model": model,
        "max_tokens": 1024,
        "stream": true,
        "messages": [{
            "role": "user",
            "content": prompt
        }]
    })
}

/// Provider fallback endpoint mapping. Returns the alternative endpoint for
/// multi-region providers so the backend can retry once on connect failure.
fn get_fallback_endpoint(provider: &str, current_url: &str) -> Option<String> {
    let alternatives: &[(&str, &str)] = match provider {
        "minimax" => &[
            (
                "minimaxi.com",
                "https://api.minimax.io/anthropic/v1/messages",
            ),
            (
                "minimax.io",
                "https://api.minimaxi.com/anthropic/v1/messages",
            ),
        ],
        "glm" => &[
            ("bigmodel.cn", "https://api.z.ai/api/anthropic/v1/messages"),
            (
                "api.z.ai",
                "https://open.bigmodel.cn/api/anthropic/v1/messages",
            ),
        ],
        _ => return None,
    };
    for (needle, fallback) in alternatives {
        if current_url.contains(needle) {
            return Some(fallback.to_string());
        }
    }
    None
}

/// Send a streaming explanation request to the given URL. Returns the response
/// on success, or a classified `ExplanationErrorInfo` on connect / transport failure.
async fn send_stream_request(
    client: &reqwest::Client,
    api_url: &str,
    api_key: &str,
    body: &serde_json::Value,
    is_anthropic: bool,
    fallback_tried: bool,
) -> Result<reqwest::Response, ExplanationErrorInfo> {
    let mut req_builder = client
        .post(api_url)
        .header("content-type", "application/json");

    if is_anthropic {
        req_builder = req_builder
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01");
    } else {
        req_builder = req_builder.header("authorization", format!("Bearer {}", api_key));
    }

    match req_builder.json(body).send().await {
        Ok(resp) => Ok(resp),
        Err(e) => Err(classify_reqwest_error(&e, fallback_tried)),
    }
}

/// Core streaming logic shared by `explain_skill_stream` and `refresh_skill_explanation`.
async fn do_explain_skill_stream(
    pool: &crate::db::DbPool,
    app: &AppHandle,
    skill_id: &str,
    content: &str,
    lang: &str,
) -> Result<(), String> {
    let api_key = get_ai_setting(pool, "ai_api_key")
        .await
        .ok_or_else(|| "请先在设置中配置 AI API Key".to_string())?;

    let api_url = get_ai_setting(pool, "ai_api_url")
        .await
        .unwrap_or_else(|| "https://api.anthropic.com/v1/messages".to_string());

    let model = get_ai_setting(pool, "ai_model")
        .await
        .unwrap_or_else(|| "claude-sonnet-4-20250514".to_string());

    let provider = get_ai_setting(pool, "ai_provider")
        .await
        .unwrap_or_default();

    let protocol = detect_explanation_api_protocol(&api_url);
    let is_anthropic = matches!(
        protocol,
        ExplanationApiProtocol::AnthropicCompatible | ExplanationApiProtocol::Unknown
    );

    let truncated = truncate_content(content);
    let prompt = build_explanation_prompt(&truncated, lang);
    let body = build_stream_request_body(&model, &prompt);

    // Streaming: only connect_timeout (total `.timeout()` would kill long streams).
    let client = reqwest::Client::builder()
        .user_agent("SkillsHub/0.10.7")
        .connect_timeout(Duration::from_secs(10))
        .pool_idle_timeout(Duration::from_secs(90))
        .build()
        .map_err(|e| e.to_string())?;

    // Try primary endpoint; on connect-layer failure, try fallback once
    let resp =
        match send_stream_request(&client, &api_url, &api_key, &body, is_anthropic, false).await {
            Ok(r) => r,
            Err(err_info) => {
                // Only retry on connect-layer errors that are retryable
                if err_info.retryable {
                    if let Some(fallback_url) = get_fallback_endpoint(&provider, &api_url) {
                        eprintln!(
                            "[explain] primary endpoint failed ({:?}), trying fallback: {}",
                            err_info.kind, fallback_url
                        );
                        let fallback_protocol = detect_explanation_api_protocol(&fallback_url);
                        let fallback_anthropic = matches!(
                            fallback_protocol,
                            ExplanationApiProtocol::AnthropicCompatible
                                | ExplanationApiProtocol::Unknown
                        );
                        match send_stream_request(
                            &client,
                            &fallback_url,
                            &api_key,
                            &body,
                            fallback_anthropic,
                            true,
                        )
                        .await
                        {
                            Ok(r) => r,
                            Err(fallback_err) => {
                                let _ = app.emit(
                                    "skill:explanation:error",
                                    serde_json::json!({
                                        "skill_id": skill_id,
                                        "error": &fallback_err.message,
                                        "error_info": fallback_err,
                                    }),
                                );
                                return Err(fallback_err.message);
                            }
                        }
                    } else {
                        let _ = app.emit(
                            "skill:explanation:error",
                            serde_json::json!({
                                "skill_id": skill_id,
                                "error": &err_info.message,
                                "error_info": err_info,
                            }),
                        );
                        return Err(err_info.message);
                    }
                } else {
                    let _ = app.emit(
                        "skill:explanation:error",
                        serde_json::json!({
                            "skill_id": skill_id,
                            "error": &err_info.message,
                            "error_info": err_info,
                        }),
                    );
                    return Err(err_info.message);
                }
            }
        };

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        let status_code = status.as_u16();
        let err_kind = if status_code == 401 || status_code == 403 {
            ExplanationErrorKind::Auth
        } else {
            ExplanationErrorKind::Response
        };
        let user_msg = if status_code == 401 || status_code == 403 {
            "API Key 无效或权限不足，请检查设置中的 API Key".to_string()
        } else if status_code == 429 {
            "请求过于频繁，请稍后重试".to_string()
        } else {
            format!("API 返回错误 {}", status)
        };
        let err_info = ExplanationErrorInfo {
            message: user_msg,
            details: format!("HTTP {}: {}", status, body_text),
            kind: err_kind,
            retryable: status_code == 429,
            fallback_tried: false,
        };
        let _ = app.emit(
            "skill:explanation:error",
            serde_json::json!({
                "skill_id": skill_id,
                "error": &err_info.message,
                "error_info": err_info,
            }),
        );
        return Err(format!("API 返回错误 {}: {}", status, body_text));
    }

    // Stream SSE response
    let mut stream = resp.bytes_stream();
    let mut full_text = String::new();
    let mut sse_buffer = String::new();
    let mut saw_thinking_delta = false;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("流读取失败: {}", e))?;
        sse_buffer.push_str(&String::from_utf8_lossy(&chunk));

        // Process complete SSE lines
        while let Some(newline_pos) = sse_buffer.find('\n') {
            let line = sse_buffer[..newline_pos].trim().to_string();
            sse_buffer = sse_buffer[newline_pos + 1..].to_string();

            if line.is_empty() || line.starts_with(':') {
                continue;
            }

            let data = if let Some(stripped) = line.strip_prefix("data: ") {
                stripped
            } else if let Some(stripped) = line.strip_prefix("data:") {
                stripped.trim()
            } else {
                continue;
            };

            if data == "[DONE]" {
                continue;
            }

            let parsed: serde_json::Value = match serde_json::from_str(data) {
                Ok(v) => v,
                Err(_) => continue,
            };

            let text_chunk = if is_anthropic {
                // Anthropic SSE: { "type": "content_block_delta", "delta": { "type": "text_delta", "text": "..." } }
                let event_type = parsed.get("type").and_then(|t| t.as_str()).unwrap_or("");
                let delta_type = parsed
                    .get("delta")
                    .and_then(|d| d.get("type"))
                    .and_then(|t| t.as_str())
                    .unwrap_or("");
                if event_type == "content_block_delta" && delta_type == "thinking_delta" {
                    saw_thinking_delta = true;
                }
                if event_type == "content_block_delta" {
                    parsed
                        .get("delta")
                        .and_then(|d| d.get("text"))
                        .and_then(|t| t.as_str())
                        .unwrap_or("")
                        .to_string()
                } else {
                    String::new()
                }
            } else {
                // OpenAI SSE: { "choices": [{ "delta": { "content": "..." } }] }
                parsed
                    .get("choices")
                    .and_then(|c| c.get(0))
                    .and_then(|c| c.get("delta"))
                    .and_then(|d| d.get("content"))
                    .and_then(|c| c.as_str())
                    .unwrap_or("")
                    .to_string()
            };

            if !text_chunk.is_empty() {
                full_text.push_str(&text_chunk);
                let _ = app.emit(
                    "skill:explanation:chunk",
                    ExplanationChunkPayload {
                        skill_id: skill_id.to_string(),
                        text: text_chunk,
                    },
                );
            }
        }
    }

    if !explanation_has_content(&full_text) {
        let err_info = empty_explanation_error_info(lang, saw_thinking_delta);
        let _ = app.emit(
            "skill:explanation:error",
            serde_json::json!({
                "skill_id": skill_id,
                "error": &err_info.message,
                "error_info": err_info,
            }),
        );
        return Err("AI explanation returned no content.".to_string());
    }

    cache_skill_explanation(pool, skill_id, lang, &model, &full_text).await?;

    let _ = app.emit(
        "skill:explanation:complete",
        ExplanationCompletePayload {
            skill_id: skill_id.to_string(),
            explanation: Some(full_text.clone()),
        },
    );

    Ok(())
}

/// Retrieve a cached skill explanation from the database.
#[tauri::command]
pub async fn get_skill_explanation(
    state: State<'_, AppState>,
    skill_id: String,
    lang: String,
) -> Result<Option<String>, String> {
    load_cached_skill_explanation(&state.db, &skill_id, &lang).await
}

/// Stream an AI-generated explanation for a skill, with DB caching.
/// If a cached explanation exists, it is emitted as a single chunk.
/// Otherwise, the AI API is called with streaming and chunks are emitted
/// as they arrive. The full explanation is cached after completion.
#[tauri::command]
pub async fn explain_skill_stream(
    state: State<'_, AppState>,
    app: AppHandle,
    skill_id: String,
    content: String,
    lang: String,
) -> Result<(), String> {
    // Check cache first
    if let Some(explanation) = load_cached_skill_explanation(&state.db, &skill_id, &lang).await? {
        let _ = app.emit(
            "skill:explanation:chunk",
            ExplanationChunkPayload {
                skill_id: skill_id.clone(),
                text: explanation.clone(),
            },
        );
        let _ = app.emit(
            "skill:explanation:complete",
            ExplanationCompletePayload {
                skill_id: skill_id.clone(),
                explanation: Some(explanation),
            },
        );
        return Ok(());
    }

    do_explain_skill_stream(&state.db, &app, &skill_id, &content, &lang).await
}

/// Refresh (re-generate) a skill explanation by deleting the cache and re-streaming.
#[tauri::command]
pub async fn refresh_skill_explanation(
    state: State<'_, AppState>,
    app: AppHandle,
    skill_id: String,
    content: String,
    lang: String,
) -> Result<(), String> {
    // Delete cached explanation
    delete_cached_skill_explanation(&state.db, &skill_id, &lang).await?;

    do_explain_skill_stream(&state.db, &app, &skill_id, &content, &lang).await
}

#[cfg(test)]
mod tests {
    use super::{
        add_registry_impl, cache_skill_explanation, classify_reqwest_error,
        detect_explanation_api_protocol, format_reqwest_error, get_fallback_endpoint,
        github_raw_update_urls, install_marketplace_skill_content_impl, is_local_only_skill_source,
        is_updatable_skill_source_url, load_cached_skill_explanation,
        marketplace_skills_from_candidates, registry_has_cached_skills,
        relocated_github_skill_md_url, search_marketplace_skills_impl, skill_markdown_is_current,
        sync_registry_impl, validate_update_skill_markdown, ExplanationApiProtocol,
        ExplanationErrorKind, RegistryCacheMetadata, RegistrySyncStatus, SyncRegistryOptions,
    };
    use crate::commands::github_import::RemoteSkillCandidate;
    use crate::db;
    use tempfile::{tempdir, TempDir};

    async fn setup_test_db() -> (crate::db::DbPool, TempDir) {
        let dir = tempdir().expect("create tempdir");
        let db_path = dir.path().join("marketplace-cache.sqlite");
        let db_path = db_path.to_string_lossy().into_owned();
        let pool = db::create_pool(&db_path).await.expect("create pool");
        db::init_database(&pool).await.expect("init db");
        (pool, dir)
    }

    #[test]
    fn marketplace_skills_from_candidates_supports_namespaced_layouts() {
        let skills = marketplace_skills_from_candidates(
            "openai",
            vec![
                RemoteSkillCandidate {
                    source_path: "skills/.curated/openai-docs".to_string(),
                    source_manifest_path: "skills/.curated/openai-docs/SKILL.md".to_string(),
                    skill_id: "openai-docs".to_string(),
                    skill_name: "openai-docs".to_string(),
                    description: Some("Docs skill".to_string()),
                    root_directory: "skills/.curated".to_string(),
                    skill_directory_name: "openai-docs".to_string(),
                    download_url:
                        "https://raw.githubusercontent.com/openai/skills/main/skills/.curated/openai-docs/SKILL.md"
                            .to_string(),
                },
                RemoteSkillCandidate {
                    source_path: "skills/.system/skill-creator".to_string(),
                    source_manifest_path: "skills/.system/skill-creator/SKILL.md".to_string(),
                    skill_id: "skill-creator".to_string(),
                    skill_name: "skill-creator".to_string(),
                    description: Some("Create skills".to_string()),
                    root_directory: "skills/.system".to_string(),
                    skill_directory_name: "skill-creator".to_string(),
                    download_url:
                        "https://raw.githubusercontent.com/openai/skills/main/skills/.system/skill-creator/SKILL.md"
                            .to_string(),
                },
            ],
        );

        assert_eq!(skills.len(), 2);
        assert_eq!(skills[0].id, "openai::openai-docs");
        assert_eq!(skills[0].name, "openai-docs");
        assert!(skills[0]
            .download_url
            .contains("skills/.curated/openai-docs"));
        assert_eq!(skills[1].id, "openai::skill-creator");
        assert_eq!(skills[1].name, "skill-creator");
        assert!(skills[1]
            .download_url
            .contains("skills/.system/skill-creator"));
    }

    #[test]
    fn detects_anthropic_compatible_message_endpoints() {
        assert_eq!(
            detect_explanation_api_protocol("https://api.minimaxi.com/anthropic/v1/messages"),
            ExplanationApiProtocol::AnthropicCompatible
        );
        assert_eq!(
            detect_explanation_api_protocol("https://open.bigmodel.cn/api/anthropic/v1/messages"),
            ExplanationApiProtocol::AnthropicCompatible
        );
        assert_eq!(
            detect_explanation_api_protocol("https://api.anthropic.com/v1/messages"),
            ExplanationApiProtocol::AnthropicCompatible
        );
    }

    #[test]
    fn detects_openai_chat_completions_endpoints() {
        assert_eq!(
            detect_explanation_api_protocol("https://api.openai.com/v1/chat/completions"),
            ExplanationApiProtocol::OpenAiCompatible
        );
    }

    #[test]
    fn leaves_unknown_endpoints_unclassified() {
        assert_eq!(
            detect_explanation_api_protocol("https://example.com/custom/generate"),
            ExplanationApiProtocol::Unknown
        );
    }

    #[test]
    fn source_update_rejects_non_skill_markdown() {
        let err =
            validate_update_skill_markdown("resource-skill", "\n\n<!DOCTYPE html><html></html>")
                .expect_err("HTML pages must never be accepted as skill updates");

        assert!(err.contains("not a valid SKILL.md"));
    }

    #[test]
    fn source_update_url_filter_skips_repository_homepages() {
        assert!(is_updatable_skill_source_url(
            "https://raw.githubusercontent.com/example/skills/main/demo/SKILL.md"
        ));
        assert!(is_updatable_skill_source_url(
            "https://example.com/demo/SKILL.md"
        ));
        assert!(!is_updatable_skill_source_url(
            "https://github.com/example/skills"
        ));
        assert!(!is_updatable_skill_source_url(
            "https://example.com/demo/README.md"
        ));
    }

    /// A live reqwest error (connect-refused on localhost:1) must be
    /// classified with an actionable Chinese hint, not just the opaque
    /// top-level "error sending request for url (...)".
    /// `.no_proxy()` ensures the test is deterministic even when the
    /// developer has `HTTP(S)_PROXY` set in their environment.
    #[tokio::test]
    async fn format_reqwest_error_surfaces_actionable_hint() {
        let client = reqwest::Client::builder()
            .no_proxy()
            .connect_timeout(std::time::Duration::from_millis(500))
            .build()
            .expect("build client");
        let err = client
            .post("http://127.0.0.1:1/")
            .send()
            .await
            .expect_err("expected connect failure");
        let msg = format_reqwest_error(&err);
        assert!(
            msg.contains("切换区域端点") || msg.contains("建立连接") || msg.contains("请求超时"),
            "expected actionable Chinese hint in formatted error, got: {msg}"
        );
    }

    #[tokio::test]
    async fn classify_connect_error_as_connect_kind() {
        let client = reqwest::Client::builder()
            .no_proxy()
            .connect_timeout(std::time::Duration::from_millis(500))
            .build()
            .expect("build client");
        let err = client
            .post("http://127.0.0.1:1/")
            .send()
            .await
            .expect_err("expected connect failure");
        let info = classify_reqwest_error(&err, false);
        assert!(
            matches!(
                info.kind,
                ExplanationErrorKind::Connect | ExplanationErrorKind::Timeout
            ),
            "localhost refused connection can surface as connect or timeout depending on platform, got {:?}",
            info.kind
        );
        assert!(info.retryable);
        assert!(!info.message.is_empty());
        assert!(!info.details.is_empty());
    }

    // ── Fallback endpoint tests ──────────────────────────────────────────

    #[test]
    fn minimax_cn_falls_back_to_intl() {
        let fb = get_fallback_endpoint("minimax", "https://api.minimaxi.com/anthropic/v1/messages");
        assert_eq!(
            fb.as_deref(),
            Some("https://api.minimax.io/anthropic/v1/messages")
        );
    }

    #[test]
    fn minimax_intl_falls_back_to_cn() {
        let fb = get_fallback_endpoint("minimax", "https://api.minimax.io/anthropic/v1/messages");
        assert_eq!(
            fb.as_deref(),
            Some("https://api.minimaxi.com/anthropic/v1/messages")
        );
    }

    #[test]
    fn glm_cn_falls_back_to_intl() {
        let fb = get_fallback_endpoint("glm", "https://open.bigmodel.cn/api/anthropic/v1/messages");
        assert_eq!(
            fb.as_deref(),
            Some("https://api.z.ai/api/anthropic/v1/messages")
        );
    }

    #[test]
    fn glm_intl_falls_back_to_cn() {
        let fb = get_fallback_endpoint("glm", "https://api.z.ai/api/anthropic/v1/messages");
        assert_eq!(
            fb.as_deref(),
            Some("https://open.bigmodel.cn/api/anthropic/v1/messages")
        );
    }

    #[test]
    fn claude_has_no_fallback() {
        let fb = get_fallback_endpoint("claude", "https://api.anthropic.com/v1/messages");
        assert!(fb.is_none());
    }

    #[test]
    fn custom_provider_has_no_fallback() {
        let fb = get_fallback_endpoint("custom", "https://my-proxy.example.com/v1/messages");
        assert!(fb.is_none());
    }

    #[tokio::test]
    async fn load_cached_skill_explanation_drops_empty_rows() {
        let (pool, _dir) = setup_test_db().await;

        sqlx::query(
            "INSERT INTO skill_explanations (skill_id, explanation, lang, model, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind("defuddle")
        .bind("")
        .bind("zh")
        .bind("MiniMax-M2.7")
        .bind("2026-04-19T00:00:00Z")
        .bind("2026-04-19T00:00:00Z")
        .execute(&pool)
        .await
        .expect("insert empty explanation");

        let explanation = load_cached_skill_explanation(&pool, "defuddle", "zh")
            .await
            .expect("load cached explanation");
        assert!(explanation.is_none());

        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM skill_explanations WHERE skill_id = ? AND lang = ?",
        )
        .bind("defuddle")
        .bind("zh")
        .fetch_one(&pool)
        .await
        .expect("count explanations");
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn cache_skill_explanation_rejects_blank_text() {
        let (pool, _dir) = setup_test_db().await;

        let err = cache_skill_explanation(&pool, "defuddle", "zh", "MiniMax-M2.7", "   ")
            .await
            .expect_err("blank explanations should be rejected");
        assert!(err.contains("no content"));

        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM skill_explanations WHERE skill_id = ? AND lang = ?",
        )
        .bind("defuddle")
        .bind("zh")
        .fetch_one(&pool)
        .await
        .expect("count explanations");
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn add_registry_persists_cache_metadata() {
        let (pool, _dir) = setup_test_db().await;
        let registry = add_registry_impl(
            &pool,
            "Custom Repo".to_string(),
            "github".to_string(),
            "https://github.com/example/custom".to_string(),
            Some(RegistryCacheMetadata {
                etag: Some("etag-123".to_string()),
                last_modified: Some("Wed, 01 Jan 2025 00:00:00 GMT".to_string()),
                cache_expires_at: Some("2026-04-16T00:00:00Z".to_string()),
            }),
        )
        .await
        .expect("registry created");

        let row = sqlx::query(
            "SELECT last_sync_status, etag, last_modified, cache_expires_at
             FROM skill_registries WHERE id = ?",
        )
        .bind(&registry.id)
        .fetch_one(&pool)
        .await
        .expect("fetch registry");

        use sqlx::Row;
        assert_eq!(
            row.get::<String, _>("last_sync_status"),
            RegistrySyncStatus::Never.as_str()
        );
        assert_eq!(
            row.get::<Option<String>, _>("etag").as_deref(),
            Some("etag-123")
        );
        assert_eq!(
            row.get::<Option<String>, _>("last_modified").as_deref(),
            Some("Wed, 01 Jan 2025 00:00:00 GMT")
        );
        assert_eq!(
            row.get::<Option<String>, _>("cache_expires_at").as_deref(),
            Some("2026-04-16T00:00:00Z")
        );
    }

    #[tokio::test]
    async fn sync_registry_uses_cached_skills_without_refresh() {
        let (pool, _dir) = setup_test_db().await;
        let registry = add_registry_impl(
            &pool,
            "Cached Repo".to_string(),
            "github".to_string(),
            "https://github.com/example/invalid".to_string(),
            None,
        )
        .await
        .expect("registry created");

        sqlx::query(
            "INSERT INTO marketplace_skills
             (id, registry_id, name, description, download_url, is_installed, synced_at, cache_updated_at)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
        )
        .bind(format!("{}::cached-skill", registry.id))
        .bind(&registry.id)
        .bind("cached-skill")
        .bind("served from cache")
        .bind("https://example.com/SKILL.md")
        .bind("2026-04-16T12:00:00Z")
        .bind("2026-04-16T12:00:00Z")
        .execute(&pool)
        .await
        .expect("insert cached skill");

        let skills = sync_registry_impl(&pool, registry.id.clone(), SyncRegistryOptions::default())
            .await
            .expect("sync succeeds from cache");

        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "cached-skill");

        let row = sqlx::query(
            "SELECT last_attempted_sync, last_synced, last_sync_status
             FROM skill_registries WHERE id = ?",
        )
        .bind(&registry.id)
        .fetch_one(&pool)
        .await
        .expect("fetch registry");

        use sqlx::Row;
        assert!(row
            .get::<Option<String>, _>("last_attempted_sync")
            .is_none());
        assert!(row.get::<Option<String>, _>("last_synced").is_none());
        assert_eq!(
            row.get::<String, _>("last_sync_status"),
            RegistrySyncStatus::Never.as_str()
        );
    }

    #[tokio::test]
    async fn force_refresh_failure_preserves_last_good_cached_data() {
        let (pool, _dir) = setup_test_db().await;
        let registry = add_registry_impl(
            &pool,
            "Broken Repo".to_string(),
            "github".to_string(),
            "not-a-valid-github-url".to_string(),
            None,
        )
        .await
        .expect("registry created");

        sqlx::query(
            "INSERT INTO marketplace_skills
             (id, registry_id, name, description, download_url, is_installed, synced_at, cache_updated_at)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
        )
        .bind(format!("{}::last-good", registry.id))
        .bind(&registry.id)
        .bind("last-good")
        .bind("cached before failure")
        .bind("https://example.com/last-good/SKILL.md")
        .bind("2026-04-16T12:00:00Z")
        .bind("2026-04-16T12:00:00Z")
        .execute(&pool)
        .await
        .expect("insert cached skill");

        let skills = sync_registry_impl(
            &pool,
            registry.id.clone(),
            SyncRegistryOptions {
                force_refresh: true,
            },
        )
        .await
        .expect("force refresh returns cached data on failure");

        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "last-good");

        let row = sqlx::query(
            "SELECT last_sync_status, last_sync_error, last_synced
             FROM skill_registries WHERE id = ?",
        )
        .bind(&registry.id)
        .fetch_one(&pool)
        .await
        .expect("fetch registry");

        use sqlx::Row;
        assert_eq!(
            row.get::<String, _>("last_sync_status"),
            RegistrySyncStatus::Error.as_str()
        );
        let last_sync_error = row
            .get::<Option<String>, _>("last_sync_error")
            .unwrap_or_default();
        assert!(
            last_sync_error.contains("GitHub repository URL")
                || last_sync_error.contains("github.com"),
            "unexpected sync error: {last_sync_error}"
        );
        assert!(row.get::<Option<String>, _>("last_synced").is_none());

        let cached_skills = search_marketplace_skills_impl(&pool, Some(registry.id.clone()), None)
            .await
            .expect("cached skills still queryable");
        assert_eq!(cached_skills.len(), 1);
        assert_eq!(cached_skills[0].name, "last-good");
    }

    #[tokio::test]
    async fn registry_cache_column_migration_is_idempotent() {
        let dir = tempdir().expect("create tempdir");
        let db_path = dir.path().join("migration.sqlite");
        let db_path = db_path.to_string_lossy().into_owned();
        let pool = db::create_pool(&db_path).await.expect("create pool");

        sqlx::query(
            "CREATE TABLE skill_registries (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                source_type TEXT NOT NULL,
                url TEXT NOT NULL,
                is_builtin BOOLEAN NOT NULL DEFAULT 0,
                is_enabled BOOLEAN NOT NULL DEFAULT 1,
                last_synced TEXT,
                created_at TEXT NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .expect("create legacy skill_registries");
        sqlx::query(
            "CREATE TABLE marketplace_skills (
                id TEXT PRIMARY KEY,
                registry_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                download_url TEXT NOT NULL,
                is_installed BOOLEAN NOT NULL DEFAULT 0,
                synced_at TEXT NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .expect("create legacy marketplace_skills");

        db::init_database(&pool).await.expect("migrate once");
        db::init_database(&pool).await.expect("migrate twice");

        let registry_columns = sqlx::query("PRAGMA table_info(skill_registries)")
            .fetch_all(&pool)
            .await
            .expect("pragma registry");
        let skill_columns = sqlx::query("PRAGMA table_info(marketplace_skills)")
            .fetch_all(&pool)
            .await
            .expect("pragma skills");

        use sqlx::Row;
        let registry_names: Vec<String> =
            registry_columns.iter().map(|row| row.get("name")).collect();
        let skill_names: Vec<String> = skill_columns.iter().map(|row| row.get("name")).collect();

        for expected in [
            "last_attempted_sync",
            "last_sync_status",
            "last_sync_error",
            "cache_updated_at",
            "cache_expires_at",
            "etag",
            "last_modified",
        ] {
            assert!(
                registry_names.iter().any(|name| name == expected),
                "missing registry column {expected}"
            );
        }
        assert!(
            skill_names.iter().any(|name| name == "cache_updated_at"),
            "missing marketplace_skills.cache_updated_at"
        );
    }

    #[tokio::test]
    async fn registry_has_cached_skills_detects_persisted_rows() {
        let (pool, _dir) = setup_test_db().await;
        let registry = add_registry_impl(
            &pool,
            "Cache Check".to_string(),
            "github".to_string(),
            "https://github.com/example/cache-check".to_string(),
            None,
        )
        .await
        .expect("registry created");

        assert!(!registry_has_cached_skills(&pool, &registry.id)
            .await
            .expect("empty"));

        sqlx::query(
            "INSERT INTO marketplace_skills
             (id, registry_id, name, description, download_url, is_installed, synced_at, cache_updated_at)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
        )
        .bind(format!("{}::cached", registry.id))
        .bind(&registry.id)
        .bind("cached")
        .bind("cached row")
        .bind("https://example.com/cached/SKILL.md")
        .bind("2026-04-16T12:00:00Z")
        .bind("2026-04-16T12:00:00Z")
        .execute(&pool)
        .await
        .expect("insert skill");

        assert!(registry_has_cached_skills(&pool, &registry.id)
            .await
            .expect("cached"));
    }

    #[tokio::test]
    async fn install_marketplace_skill_uses_configured_resource_dir_and_records_source() {
        let (pool, _dir) = setup_test_db().await;
        let central_dir = tempdir().expect("central dir");
        let resource_dir = tempdir().expect("resource dir");
        sqlx::query("UPDATE agents SET global_skills_dir = ? WHERE id = 'central'")
            .bind(central_dir.path().to_string_lossy().to_string())
            .execute(&pool)
            .await
            .expect("set central dir");
        db::set_setting(
            &pool,
            "skill_resource_library_dir",
            &resource_dir.path().to_string_lossy(),
        )
        .await
        .expect("set resource dir");

        let registry = add_registry_impl(
            &pool,
            "Example Author".to_string(),
            "github".to_string(),
            "https://github.com/example/skills".to_string(),
            None,
        )
        .await
        .expect("registry created");
        let skill_id = format!("{}::brand-guidelines", registry.id);
        sqlx::query(
            "INSERT INTO marketplace_skills
             (id, registry_id, name, description, download_url, is_installed, synced_at, cache_updated_at)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
        )
        .bind(&skill_id)
        .bind(&registry.id)
        .bind("brand-guidelines")
        .bind("Brand guidance")
        .bind("https://raw.githubusercontent.com/example/skills/main/skills/brand-guidelines/SKILL.md")
        .bind("2026-04-16T12:00:00Z")
        .bind("2026-04-16T12:00:00Z")
        .execute(&pool)
        .await
        .expect("insert marketplace skill");

        install_marketplace_skill_content_impl(
            &pool,
            &skill_id,
            "---\nname: brand-guidelines\ndescription: Brand guidance\n---\n",
        )
        .await
        .expect("install marketplace skill");

        assert!(resource_dir
            .path()
            .join("example")
            .join("skills")
            .join("brand-guidelines")
            .join("SKILL.md")
            .exists());
        let installed = db::get_skill_by_id(&pool, "brand-guidelines")
            .await
            .unwrap()
            .expect("skill should be tracked as a resource library skill");
        let expected_canonical = resource_dir
            .path()
            .join("example")
            .join("skills")
            .join("brand-guidelines")
            .to_string_lossy()
            .to_string();
        assert_eq!(
            installed.canonical_path.as_deref(),
            Some(expected_canonical.as_str())
        );
        assert!(!installed.is_central);

        let source = db::get_skill_source(&pool, "brand-guidelines")
            .await
            .unwrap()
            .expect("source metadata should be recorded");
        assert_eq!(source.source_author.as_deref(), Some("example"));
        assert_eq!(source.source_repo.as_deref(), Some("example/skills"));
        assert_eq!(
            source.source_url.as_deref(),
            Some(
                "https://raw.githubusercontent.com/example/skills/main/skills/brand-guidelines/SKILL.md"
            )
        );
        assert_eq!(
            source.source_path.as_deref(),
            Some("skills/brand-guidelines/SKILL.md")
        );
    }

    #[test]
    fn github_raw_update_urls_recovers_missing_source_url_from_repo_and_path() {
        let source = db::SkillSource {
            skill_id: "brand-guidelines".to_string(),
            source_type: "github".to_string(),
            source_url: None,
            source_author: Some("example".to_string()),
            source_repo: Some("example/skills".to_string()),
            source_path: Some("brand-guidelines/SKILL.md".to_string()),
            updated_at: "2026-04-16T12:00:00Z".to_string(),
        };

        assert_eq!(
            github_raw_update_urls(&source),
            vec![
                "https://raw.githubusercontent.com/example/skills/main/brand-guidelines/SKILL.md",
                "https://raw.githubusercontent.com/example/skills/main/skills/brand-guidelines/SKILL.md",
                "https://raw.githubusercontent.com/example/skills/master/brand-guidelines/SKILL.md",
                "https://raw.githubusercontent.com/example/skills/master/skills/brand-guidelines/SKILL.md",
            ]
        );
    }

    #[test]
    fn skill_markdown_is_current_detects_identical_and_changed_files() {
        let dir = tempdir().expect("create tempdir");
        let path = dir.path().join("SKILL.md");
        std::fs::write(&path, "---\nname: demo\n---\nbody\n").unwrap();
        assert!(skill_markdown_is_current(
            &path,
            "---\nname: demo\n---\nbody\n"
        ));
        assert!(!skill_markdown_is_current(
            &path,
            "---\nname: demo\n---\nupdated\n"
        ));
        assert!(!skill_markdown_is_current(
            &dir.path().join("missing.md"),
            "---\nname: demo\n---\nbody\n"
        ));
    }

    #[test]
    fn local_only_skill_sources_are_skipped_during_source_updates() {
        assert!(is_local_only_skill_source("local-folder"));
        assert!(is_local_only_skill_source("manual"));
        assert!(!is_local_only_skill_source("github"));
        assert!(!is_local_only_skill_source("skills-cli"));
        assert!(!is_local_only_skill_source("marketplace"));
    }

    #[test]
    fn relocated_github_skill_md_url_recovers_category_moved_skill_paths() {
        let source = db::SkillSource {
            skill_id: "ask-matt".to_string(),
            source_type: "github".to_string(),
            source_url: None,
            source_author: Some("mattpocock".to_string()),
            source_repo: Some("mattpocock/skills".to_string()),
            source_path: Some("ask-matt/SKILL.md".to_string()),
            updated_at: "2026-08-12T12:00:00Z".to_string(),
        };
        let repo_paths = vec![
            "skills/engineering/ask-matt/SKILL.md".to_string(),
            "skills/productivity/handoff/SKILL.md".to_string(),
        ];

        assert_eq!(
            relocated_github_skill_md_url(&source, "main", &repo_paths),
            Some((
                "https://raw.githubusercontent.com/mattpocock/skills/main/skills/engineering/ask-matt/SKILL.md"
                    .to_string(),
                "skills/engineering/ask-matt/SKILL.md".to_string()
            ))
        );
    }

    #[test]
    fn relocated_github_skill_md_url_recovers_root_repo_skill_path() {
        let source = db::SkillSource {
            skill_id: "guizang-ppt-skill".to_string(),
            source_type: "github".to_string(),
            source_url: None,
            source_author: Some("op7418".to_string()),
            source_repo: Some("op7418/guizang-ppt-skill".to_string()),
            source_path: Some("guizang-ppt-skill/SKILL.md".to_string()),
            updated_at: "2026-09-02T12:00:00Z".to_string(),
        };
        let repo_paths = vec!["SKILL.md".to_string(), "assets/template.html".to_string()];

        assert_eq!(
            relocated_github_skill_md_url(&source, "main", &repo_paths),
            Some((
                "https://raw.githubusercontent.com/op7418/guizang-ppt-skill/main/SKILL.md"
                    .to_string(),
                "SKILL.md".to_string()
            ))
        );
    }

    #[tokio::test]
    async fn install_marketplace_skill_writes_resource_library_not_central() {
        let (pool, _dir) = setup_test_db().await;
        let central_dir = tempdir().expect("central dir");
        let resource_dir = tempdir().expect("resource dir");
        sqlx::query("UPDATE agents SET global_skills_dir = ? WHERE id = 'central'")
            .bind(central_dir.path().to_string_lossy().to_string())
            .execute(&pool)
            .await
            .expect("set central dir");
        db::set_setting(
            &pool,
            "skill_resource_library_dir",
            &resource_dir.path().to_string_lossy(),
        )
        .await
        .expect("set resource dir");

        let registry = add_registry_impl(
            &pool,
            "Example Author".to_string(),
            "github".to_string(),
            "https://github.com/example/skills".to_string(),
            None,
        )
        .await
        .expect("registry created");
        let skill_id = format!("{}::brand-guidelines", registry.id);
        sqlx::query(
            "INSERT INTO marketplace_skills
             (id, registry_id, name, description, download_url, is_installed, synced_at, cache_updated_at)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
        )
        .bind(&skill_id)
        .bind(&registry.id)
        .bind("brand-guidelines")
        .bind("Brand guidance")
        .bind("https://raw.githubusercontent.com/example/skills/main/brand-guidelines/SKILL.md")
        .bind("2026-04-16T12:00:00Z")
        .bind("2026-04-16T12:00:00Z")
        .execute(&pool)
        .await
        .expect("insert marketplace skill");

        install_marketplace_skill_content_impl(
            &pool,
            &skill_id,
            "---\nname: brand-guidelines\ndescription: Brand guidance\n---\n",
        )
        .await
        .expect("install marketplace skill");

        let resource_skill_dir = resource_dir
            .path()
            .join("example")
            .join("skills")
            .join("brand-guidelines");
        assert!(resource_skill_dir.join("SKILL.md").exists());
        assert!(
            !central_dir
                .path()
                .join("example")
                .join("skills")
                .join("brand-guidelines")
                .exists(),
            "marketplace install should not make a skill visible via central library"
        );

        let installed = db::get_skill_by_id(&pool, "brand-guidelines")
            .await
            .unwrap()
            .expect("skill should be tracked");
        assert_eq!(
            installed.canonical_path.as_deref(),
            Some(resource_skill_dir.to_string_lossy().as_ref())
        );
        assert!(
            !installed.is_central,
            "resource library installs are not central until explicitly synced"
        );
    }

    #[tokio::test]
    async fn install_marketplace_skill_keeps_same_name_different_sources_distinct() {
        let (pool, _dir) = setup_test_db().await;
        let central_dir = tempdir().expect("central dir");
        let resource_dir = tempdir().expect("resource dir");
        sqlx::query("UPDATE agents SET global_skills_dir = ? WHERE id = 'central'")
            .bind(central_dir.path().to_string_lossy().to_string())
            .execute(&pool)
            .await
            .expect("set central dir");
        db::set_setting(
            &pool,
            "skill_resource_library_dir",
            &resource_dir.path().to_string_lossy(),
        )
        .await
        .expect("set resource dir");

        let first_registry = add_registry_impl(
            &pool,
            "Example".to_string(),
            "github".to_string(),
            "https://github.com/example/skills".to_string(),
            None,
        )
        .await
        .expect("first registry");
        let second_registry = add_registry_impl(
            &pool,
            "Other".to_string(),
            "github".to_string(),
            "https://github.com/other/skills".to_string(),
            None,
        )
        .await
        .expect("second registry");

        let first_skill_id = format!("{}::brand-guidelines", first_registry.id);
        let second_skill_id = format!("{}::brand-guidelines", second_registry.id);
        for (skill_id, registry_id, download_url) in [
            (
                &first_skill_id,
                &first_registry.id,
                "https://raw.githubusercontent.com/example/skills/main/brand-guidelines/SKILL.md",
            ),
            (
                &second_skill_id,
                &second_registry.id,
                "https://raw.githubusercontent.com/other/skills/main/brand-guidelines/SKILL.md",
            ),
        ] {
            sqlx::query(
                "INSERT INTO marketplace_skills
                 (id, registry_id, name, description, download_url, is_installed, synced_at, cache_updated_at)
                 VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
            )
            .bind(skill_id)
            .bind(registry_id)
            .bind("brand-guidelines")
            .bind("Brand guidance")
            .bind(download_url)
            .bind("2026-04-16T12:00:00Z")
            .bind("2026-04-16T12:00:00Z")
            .execute(&pool)
            .await
            .expect("insert marketplace skill");
        }

        install_marketplace_skill_content_impl(
            &pool,
            &first_skill_id,
            "---\nname: brand-guidelines\ndescription: First\n---\n",
        )
        .await
        .expect("install first skill");
        install_marketplace_skill_content_impl(
            &pool,
            &second_skill_id,
            "---\nname: brand-guidelines\ndescription: Second\n---\n",
        )
        .await
        .expect("install second skill");

        assert!(resource_dir
            .path()
            .join("example")
            .join("skills")
            .join("brand-guidelines")
            .join("SKILL.md")
            .exists());
        assert!(resource_dir
            .path()
            .join("other")
            .join("skills")
            .join("brand-guidelines-other-skills")
            .join("SKILL.md")
            .exists());

        let first_source = db::get_skill_source(&pool, "brand-guidelines")
            .await
            .unwrap()
            .expect("first source");
        let second_source = db::get_skill_source(&pool, "brand-guidelines-other-skills")
            .await
            .unwrap()
            .expect("second source");
        assert_eq!(first_source.source_repo.as_deref(), Some("example/skills"));
        assert_eq!(second_source.source_repo.as_deref(), Some("other/skills"));
    }
}
