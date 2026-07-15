use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::{DateTime, NaiveDateTime, Utc};
use futures_util::StreamExt;
use percent_encoding::percent_decode_str;
use quick_xml::events::Event;
use reqwest::{Client, Method, Url};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::cmp::Ordering;
use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::time::Duration;
use tauri::State;
use uuid::Uuid;

use crate::{
    commands::linker::{install_skill_to_agent_copy_impl, install_skill_to_agent_impl},
    db::{self, Agent, Collection, DbPool, ScanDirectory, Skill, SkillMetadata, SkillSource},
    path_utils::path_to_string,
    AppState,
};

const BACKUP_SCHEMA_VERSION: u32 = 1;
const WEBDAV_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const WEBDAV_MAX_DOWNLOAD_BYTES: usize = 64 * 1024 * 1024;
const WEBDAV_MAX_LIST_BYTES: usize = 8 * 1024 * 1024;

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
struct SkillInstallationBackup {
    skill_id: String,
    agent_id: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "link_type",
        alias = "linkType"
    )]
    method: Option<String>,
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
struct AgentBackup {
    id: String,
    display_name: String,
    category: String,
    icon_name: Option<String>,
    is_detected: bool,
    is_builtin: bool,
    is_enabled: bool,
}

impl From<&Agent> for AgentBackup {
    fn from(agent: &Agent) -> Self {
        Self {
            id: agent.id.clone(),
            display_name: agent.display_name.clone(),
            category: agent.category.clone(),
            icon_name: agent.icon_name.clone(),
            is_detected: agent.is_detected,
            is_builtin: agent.is_builtin,
            is_enabled: agent.is_enabled,
        }
    }
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ScanDirectoryBackup {
    id: i64,
    label: Option<String>,
    is_active: bool,
    is_builtin: bool,
    added_at: String,
}

impl From<&ScanDirectory> for ScanDirectoryBackup {
    fn from(directory: &ScanDirectory) -> Self {
        Self {
            id: directory.id,
            label: directory.label.clone(),
            is_active: directory.is_active,
            is_builtin: directory.is_builtin,
            added_at: directory.added_at.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AppBackup {
    schema_version: u32,
    exported_at: String,
    #[serde(default)]
    included: BackupOptions,
    skills: Vec<SkillBackup>,
    collections: Vec<Collection>,
    collection_skills: Vec<CollectionSkillBackup>,
    settings: Vec<SettingBackup>,
    agents: Vec<AgentBackup>,
    scan_directories: Vec<ScanDirectoryBackup>,
    skill_registries: Vec<SkillRegistryBackup>,
    marketplace_skills: Vec<MarketplaceSkillBackup>,
    #[serde(default)]
    skill_installations: Vec<SkillInstallationBackup>,
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

fn normalize_webdav_base_url(value: &str) -> Result<String, String> {
    let trimmed = value.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("WebDAV URL cannot be empty".to_string());
    }
    let url = Url::parse(trimmed).map_err(|_| "WebDAV URL is invalid".to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("WebDAV URL must use http or https".to_string());
    }
    let authority = trimmed
        .split_once("://")
        .map(|(_, rest)| rest.split('/').next().unwrap_or(rest))
        .unwrap_or_default();
    if !url.username().is_empty()
        || url.password().is_some()
        || authority.contains('@')
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("WebDAV URL must not include query, fragment, or userinfo".to_string());
    }
    Ok(trimmed.to_string())
}

fn normalize_webdav_remote_path(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("WebDAV remote path cannot be empty".to_string());
    }
    if trimmed.starts_with('/') || trimmed.contains('\\') {
        return Err("WebDAV remote path must be relative".to_string());
    }
    if trimmed.contains('?') || trimmed.contains('#') {
        return Err("WebDAV remote path must not contain query or fragment separators".to_string());
    }
    let bytes = trimmed.as_bytes();
    if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
        return Err("WebDAV remote path must be relative".to_string());
    }
    let parts: Vec<&str> = trimmed.split('/').collect();
    if parts
        .iter()
        .any(|part| part.is_empty() || *part == "." || *part == "..")
    {
        return Err("WebDAV remote path contains unsafe traversal".to_string());
    }
    Ok(parts.join("/"))
}

fn build_webdav_url(config: &WebDavConfig, remote_path: &str) -> Result<String, String> {
    let base = normalize_webdav_base_url(&config.base_url)?;
    let remote_dir = normalize_webdav_remote_path(&config.remote_dir)?;
    let remote_path = normalize_webdav_remote_path(remote_path)?;
    let mut url = Url::parse(&base).map_err(|_| "WebDAV URL is invalid".to_string())?;
    append_webdav_path_segments(&mut url, &remote_dir)?;
    append_webdav_path_segments(&mut url, &remote_path)?;
    Ok(url.to_string())
}

fn build_webdav_directory_url(config: &WebDavConfig) -> Result<String, String> {
    let base = normalize_webdav_base_url(&config.base_url)?;
    let remote_dir = normalize_webdav_remote_path(&config.remote_dir)?;
    let mut url = Url::parse(&base).map_err(|_| "WebDAV URL is invalid".to_string())?;
    append_webdav_path_segments(&mut url, &remote_dir)?;
    Ok(url.to_string())
}

fn append_webdav_path_segments(url: &mut Url, path: &str) -> Result<(), String> {
    let mut segments = url
        .path_segments_mut()
        .map_err(|_| "WebDAV URL cannot accept path segments".to_string())?;
    for segment in path.split('/') {
        segments.push(segment);
    }
    Ok(())
}

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

async fn upload_webdav_backup_impl(
    config: WebDavConfig,
    json: String,
) -> Result<WebDavBackupFile, String> {
    let filename = generated_backup_filename();
    let url = build_webdav_url(&config, &filename)?;
    let client = webdav_client()?;
    let response = apply_webdav_auth(
        client
            .put(&url)
            .header("Content-Type", "application/json")
            .body(json.clone()),
        &config,
    )
    .send()
    .await
    .map_err(|e| format!("WebDAV upload failed: {}", sanitize_webdav_error(e)))?;
    if !response.status().is_success() {
        return Err(format!(
            "WebDAV upload failed with status {}",
            response.status()
        ));
    }
    Ok(WebDavBackupFile {
        name: filename.clone(),
        remote_path: filename,
        size: Some(json.len() as u64),
        modified_at: Some(Utc::now().to_rfc3339()),
    })
}

async fn download_webdav_backup_impl(
    config: WebDavConfig,
    remote_path: &str,
) -> Result<String, String> {
    let url = build_webdav_url(&config, remote_path)?;
    let client = webdav_client()?;
    let response = apply_webdav_auth(client.get(&url), &config)
        .send()
        .await
        .map_err(|e| format!("WebDAV download failed: {}", sanitize_webdav_error(e)))?;
    if !response.status().is_success() {
        return Err(format!(
            "WebDAV download failed with status {}",
            response.status()
        ));
    }
    read_webdav_body(
        response,
        WEBDAV_MAX_DOWNLOAD_BYTES,
        "WebDAV download failed",
    )
    .await
}

async fn list_webdav_backups_impl(config: WebDavConfig) -> Result<Vec<WebDavBackupFile>, String> {
    let url = build_webdav_directory_url(&config)?;
    let method = Method::from_bytes(b"PROPFIND").map_err(|e| e.to_string())?;
    let client = webdav_client()?;
    let response = apply_webdav_auth(client.request(method, &url).header("Depth", "1"), &config)
        .send()
        .await
        .map_err(|e| format!("WebDAV list failed: {}", sanitize_webdav_error(e)))?;
    if !response.status().is_success() {
        return Err(format!(
            "WebDAV list failed with status {}",
            response.status()
        ));
    }
    let body = read_webdav_body(response, WEBDAV_MAX_LIST_BYTES, "WebDAV list failed").await?;
    parse_webdav_backup_files(&body)
}

fn webdav_client() -> Result<Client, String> {
    Client::builder()
        .timeout(WEBDAV_REQUEST_TIMEOUT)
        .build()
        .map_err(|e| {
            format!(
                "Failed to create WebDAV client: {}",
                sanitize_webdav_error(e)
            )
        })
}

async fn read_webdav_body(
    response: reqwest::Response,
    max_bytes: usize,
    operation: &str,
) -> Result<String, String> {
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes as u64)
    {
        return Err(format!("{} response exceeds size limit", operation));
    }

    let mut body = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("{}: {}", operation, sanitize_webdav_error(e)))?;
        if chunk.len() > max_bytes.saturating_sub(body.len()) {
            return Err(format!("{} response exceeds size limit", operation));
        }
        body.extend_from_slice(&chunk);
    }
    String::from_utf8(body).map_err(|_| format!("{} response is not valid UTF-8", operation))
}

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
        match (webdav_modified_timestamp(a), webdav_modified_timestamp(b)) {
            (Some(a_date), Some(b_date)) => b_date.cmp(&a_date),
            (Some(_), None) => Ordering::Less,
            (None, Some(_)) => Ordering::Greater,
            (None, None) => Ordering::Equal,
        }
        .then_with(|| a.name.cmp(&b.name))
        .then_with(|| a.remote_path.cmp(&b.remote_path))
    });
    Ok(files)
}

fn webdav_modified_timestamp(file: &WebDavBackupFile) -> Option<DateTime<Utc>> {
    let http_timestamp = parse_webdav_modified_at(file.modified_at.as_deref());
    let filename_timestamp = generated_backup_timestamp(&file.name)
        .map(|timestamp| DateTime::<Utc>::from_naive_utc_and_offset(timestamp, Utc));
    http_timestamp.into_iter().chain(filename_timestamp).max()
}

fn parse_webdav_modified_at(value: Option<&str>) -> Option<DateTime<Utc>> {
    let value = value?.trim();
    DateTime::parse_from_rfc2822(value)
        .map(|date| date.with_timezone(&Utc))
        .ok()
        .or_else(|| {
            httpdate::parse_http_date(value)
                .ok()
                .map(DateTime::<Utc>::from)
        })
}

fn generated_backup_timestamp(name: &str) -> Option<NaiveDateTime> {
    let timestamp = name
        .strip_prefix("skillshub-backup-")?
        .strip_suffix(".json")?;
    let timestamp = timestamp.get(..17)?;
    NaiveDateTime::parse_from_str(timestamp, "%Y-%m-%d-%H%M%S").ok()
}

fn generated_backup_filename() -> String {
    format!(
        "skillshub-backup-{}-{}.json",
        Utc::now().format("%Y-%m-%d-%H%M%S"),
        Uuid::new_v4().simple()
    )
}

fn webdav_entry_to_backup_file(
    entry: &WebDavResponseEntry,
) -> Result<Option<WebDavBackupFile>, String> {
    let Some(href) = entry.href.as_deref() else {
        return Ok(None);
    };
    let href = href.trim().trim_end_matches('/');
    let encoded_name = href.rsplit('/').next().unwrap_or(href);
    let name = percent_decode_str(encoded_name)
        .decode_utf8()
        .map_err(|_| "WebDAV href contains invalid percent encoding".to_string())?
        .into_owned();
    if name.is_empty() {
        return Ok(None);
    }
    if !name.ends_with(".json") {
        return Ok(None);
    }
    if name == "." || name == ".." || name.contains('/') || name.contains('\\') {
        return Err("WebDAV href contains unsafe filename".to_string());
    }
    Ok(Some(WebDavBackupFile {
        name: name.clone(),
        remote_path: normalize_webdav_remote_path(&name)?,
        size: entry.content_length,
        modified_at: entry.last_modified.clone(),
    }))
}

fn sanitize_webdav_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "request timed out".to_string()
    } else if error.is_connect() {
        "connection failed".to_string()
    } else {
        error.without_url().to_string()
    }
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
                .filter(|setting| is_exportable_setting_key(&setting.key))
                .collect(),
            db::get_all_agents(pool)
                .await?
                .iter()
                .map(AgentBackup::from)
                .collect(),
            db::get_scan_directories(pool)
                .await?
                .iter()
                .map(ScanDirectoryBackup::from)
                .collect(),
            sqlx::query_as::<_, SkillRegistryBackup>(
                "SELECT id, name, source_type, url, is_builtin, is_enabled, last_synced,
                        last_attempted_sync, last_sync_status, last_sync_error,
                        cache_updated_at, cache_expires_at, etag, last_modified, created_at
                 FROM skill_registries ORDER BY is_builtin DESC, name",
            )
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?
            .into_iter()
            .filter_map(sanitize_registry_backup)
            .collect(),
            sqlx::query_as::<_, MarketplaceSkillBackup>(
                "SELECT id, registry_id, name, description, download_url, is_installed,
                        synced_at, cache_updated_at
                 FROM marketplace_skills ORDER BY registry_id, name",
            )
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?
            .into_iter()
            .filter(|skill| is_safe_backup_url(&skill.download_url))
            .collect(),
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

    let current_agents = db::get_all_agents(pool).await?;
    let included_skill_ids: HashSet<String> = skill_backups
        .iter()
        .map(|skill| skill.skill.id.clone())
        .collect();
    let restorable_agent_ids: HashSet<String> = current_agents
        .iter()
        .filter(|agent| options.include_app_config || agent.is_builtin)
        .map(|agent| agent.id.clone())
        .collect();
    let skill_installations = if options.include_installations {
        sqlx::query_as::<_, SkillInstallationMethodRow>(
            "SELECT skill_id, agent_id, link_type
             FROM skill_installations
             ORDER BY skill_id, agent_id",
        )
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|installation| {
            included_skill_ids.contains(&installation.skill_id)
                && restorable_agent_ids.contains(&installation.agent_id)
        })
        .map(|installation| SkillInstallationBackup {
            skill_id: installation.skill_id,
            agent_id: installation.agent_id,
            method: Some(
                validated_install_method(Some(&installation.link_type))
                    .as_str()
                    .to_string(),
            ),
        })
        .collect()
    } else {
        Vec::new()
    };

    let backup = AppBackup {
        schema_version: BACKUP_SCHEMA_VERSION,
        exported_at: Utc::now().to_rfc3339(),
        included: options,
        skills: skill_backups,
        collections,
        collection_skills,
        settings,
        agents,
        scan_directories,
        skill_registries,
        marketplace_skills,
        skill_installations,
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

    // Resolve all filesystem roots from the current database before reading any
    // backup-controlled settings or legacy path fields.
    let central_root = central_root(pool).await?;
    let resource_root = db::get_skill_resource_library_dir(pool).await?;
    std::fs::create_dir_all(&central_root)
        .map_err(|e| format!("Failed to create Central Skills root: {}", e))?;
    std::fs::create_dir_all(&resource_root)
        .map_err(|e| format!("Failed to create Skill Resource Library root: {}", e))?;
    for skill in &backup.skills {
        validate_skill_backup(skill)?;
    }

    for setting in backup.settings {
        if !is_exportable_setting_key(&setting.key) {
            continue;
        }
        db::set_setting(pool, &setting.key, &setting.value).await?;
    }

    let backup_custom_agent_ids: HashSet<String> = backup
        .agents
        .iter()
        .filter(|agent| !agent.is_builtin)
        .map(|agent| agent.id.clone())
        .collect();
    for agent in backup.agents {
        if !agent.is_builtin {
            update_existing_custom_agent_backup(pool, &agent).await?;
        }
    }

    for registry in backup
        .skill_registries
        .into_iter()
        .filter_map(sanitize_registry_backup)
    {
        upsert_registry_backup(pool, &registry).await?;
    }

    let included_skill_ids: HashSet<String> = backup
        .skills
        .iter()
        .map(|skill| skill.skill.id.clone())
        .collect();
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
        db_skill.source = sanitize_skill_origin(db_skill.source);
        db_skill.content = None;
        db::upsert_skill(pool, &db_skill).await?;
        if let Some(mut source) = sanitize_skill_source(skill.source) {
            source.skill_id = db_skill.id.clone();
            db::upsert_skill_source(pool, &source).await?;
        }
        if let Some(metadata) = skill.metadata {
            let tags = db::parse_skill_metadata_tags(Some(&metadata));
            db::upsert_skill_metadata(pool, &db_skill.id, metadata.notes.as_deref(), &tags).await?;
        }
    }

    for installation in backup.skill_installations {
        if !included_skill_ids.contains(&installation.skill_id) {
            continue;
        }
        if db::get_skill_by_id(pool, &installation.skill_id)
            .await?
            .is_none()
        {
            continue;
        }
        let Some(agent) = db::get_agent_by_id(pool, &installation.agent_id).await? else {
            continue;
        };
        if backup_custom_agent_ids.contains(&installation.agent_id) && agent.is_builtin {
            continue;
        }
        match validated_install_method(installation.method.as_deref()) {
            BackupInstallMethod::Copy => {
                prepare_copy_installation_replay(
                    pool,
                    &installation.skill_id,
                    &installation.agent_id,
                    &central_root,
                    &agent.global_skills_dir,
                )
                .await?;
                install_skill_to_agent_copy_impl(
                    pool,
                    &installation.skill_id,
                    &installation.agent_id,
                )
                .await?;
            }
            BackupInstallMethod::Symlink => {
                install_skill_to_agent_impl(pool, &installation.skill_id, &installation.agent_id)
                    .await?;
            }
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

    for skill in backup
        .marketplace_skills
        .into_iter()
        .filter(|skill| is_safe_backup_url(&skill.download_url))
    {
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
        let source = sanitize_skill_source(db::get_skill_source(pool, &skill.id).await?);
        let metadata = db::get_skill_metadata(pool, &skill.id).await?;
        let mut exported_skill = skill;
        exported_skill.file_path.clear();
        exported_skill.canonical_path = None;
        exported_skill.source = sanitize_skill_origin(exported_skill.source);
        skill_backups.push(SkillBackup {
            skill: exported_skill,
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
        .and_then(path_to_portable_relative)
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
                .ok()
                .and_then(path_to_portable_relative)
                .ok_or_else(|| {
                    format!(
                        "File path '{}' cannot be represented as a portable backup path",
                        path.display()
                    )
                })?;
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
    let trimmed = value.trim();
    if trimmed.is_empty()
        || trimmed.starts_with('/')
        || trimmed.starts_with('\\')
        || looks_like_windows_drive_path(trimmed)
    {
        return Err("Backup contains an absolute path".to_string());
    }
    let portable = trimmed.replace('\\', "/");
    let mut normalized = PathBuf::new();
    for part in portable.split('/') {
        if part.is_empty() || part == "." || part == ".." || part.contains(':') {
            return Err("Backup contains an unsafe relative path".to_string());
        }
        normalized.push(part);
    }
    if normalized.as_os_str().is_empty() {
        return Err("Backup contains an empty relative path".to_string());
    }
    Ok(normalized)
}

fn looks_like_windows_drive_path(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

fn path_to_portable_relative(path: &Path) -> Option<String> {
    let mut parts = Vec::new();
    for component in path.components() {
        let Component::Normal(part) = component else {
            return None;
        };
        parts.push(part.to_string_lossy().to_string());
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("/"))
    }
}

fn validate_skill_backup(skill: &SkillBackup) -> Result<(), String> {
    normalize_relative_path(&skill.relative_dir)?;
    let mut paths: Vec<PathBuf> = Vec::new();
    for file in &skill.files {
        let relative_path = normalize_relative_path(&file.relative_path)?;
        STANDARD
            .decode(&file.content_base64)
            .map_err(|e| format!("Invalid base64 content for '{}': {}", file.relative_path, e))?;
        paths.push(relative_path);
    }
    paths.sort();
    for index in 0..paths.len() {
        if index > 0 && paths[index] == paths[index - 1] {
            return Err("Backup contains duplicate file paths".to_string());
        }
        for ancestor in paths[index].ancestors().skip(1) {
            if ancestor.as_os_str().is_empty() {
                break;
            }
            if paths[..index]
                .binary_search(&ancestor.to_path_buf())
                .is_ok()
            {
                return Err("Backup contains conflicting file and directory paths".to_string());
            }
        }
    }
    Ok(())
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

async fn prepare_copy_installation_replay(
    pool: &DbPool,
    skill_id: &str,
    agent_id: &str,
    central_root: &Path,
    agent_root: &str,
) -> Result<(), String> {
    let Some(existing) = db::get_skill_installations(pool, skill_id)
        .await?
        .into_iter()
        .find(|installation| installation.agent_id == agent_id)
    else {
        return Ok(());
    };
    if existing.link_type != "copy" {
        return Ok(());
    }
    let Some(skill) = db::get_skill_by_id(pool, skill_id).await? else {
        return Ok(());
    };
    let canonical_path = skill.canonical_path.as_deref().unwrap_or(&skill.file_path);
    let canonical_dir = if canonical_path.ends_with("SKILL.md") {
        Path::new(canonical_path)
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from(canonical_path))
    } else {
        PathBuf::from(canonical_path)
    };
    let relative = canonical_dir
        .strip_prefix(central_root)
        .ok()
        .and_then(path_to_portable_relative)
        .unwrap_or_else(|| skill_id.to_string());
    let expected_path = PathBuf::from(agent_root).join(normalize_relative_path(&relative)?);
    let existing_path = PathBuf::from(&existing.installed_path);
    if existing_path != expected_path || !expected_path.exists() {
        return Ok(());
    }
    if !expected_path.starts_with(agent_root) {
        return Err("Existing copy installation is outside the current agent root".to_string());
    }
    let metadata = std::fs::symlink_metadata(&expected_path).map_err(|e| {
        format!(
            "Failed to inspect existing copy installation '{}': {}",
            expected_path.display(),
            e
        )
    })?;
    if metadata.is_dir() && !metadata.file_type().is_symlink() {
        std::fs::remove_dir_all(&expected_path).map_err(|e| {
            format!(
                "Failed to refresh existing copy installation '{}': {}",
                expected_path.display(),
                e
            )
        })?;
    }
    Ok(())
}

async fn update_existing_custom_agent_backup(
    pool: &DbPool,
    agent: &AgentBackup,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE agents SET
           display_name = ?,
           category = ?,
           icon_name = ?,
           is_detected = ?,
           is_enabled = ?
         WHERE id = ? AND is_builtin = 0",
    )
    .bind(&agent.display_name)
    .bind(&agent.category)
    .bind(&agent.icon_name)
    .bind(agent.is_detected)
    .bind(agent.is_enabled)
    .bind(&agent.id)
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BackupInstallMethod {
    Symlink,
    Copy,
}

impl BackupInstallMethod {
    fn as_str(self) -> &'static str {
        match self {
            Self::Symlink => "symlink",
            Self::Copy => "copy",
        }
    }
}

fn validated_install_method(value: Option<&str>) -> BackupInstallMethod {
    match value.map(str::trim) {
        Some("copy") => BackupInstallMethod::Copy,
        Some("symlink") => BackupInstallMethod::Symlink,
        _ => BackupInstallMethod::Symlink,
    }
}

#[derive(Debug, FromRow)]
struct SkillInstallationMethodRow {
    skill_id: String,
    agent_id: String,
    link_type: String,
}

const BACKUP_SETTING_ALLOWLIST: &[&str] = &[
    "language",
    "theme",
    "accent",
    "accent_color",
    "ai_provider",
    "ai_region",
    "ai_model",
];

fn is_exportable_setting_key(key: &str) -> bool {
    BACKUP_SETTING_ALLOWLIST.contains(&key)
}

fn sanitize_registry_backup(mut registry: SkillRegistryBackup) -> Option<SkillRegistryBackup> {
    if !is_safe_backup_url(&registry.url) {
        return None;
    }
    registry.last_sync_error = None;
    Some(registry)
}

fn sanitize_skill_source(source: Option<SkillSource>) -> Option<SkillSource> {
    source.map(|mut source| {
        if source
            .source_url
            .as_deref()
            .is_some_and(|url| !is_safe_backup_url(url))
        {
            source.source_url = None;
        }
        if source
            .source_path
            .as_deref()
            .is_some_and(|path| !is_portable_backup_path(path))
        {
            source.source_path = None;
        }
        source
    })
}

fn is_safe_backup_url(value: &str) -> bool {
    let Ok(url) = Url::parse(value) else {
        return false;
    };
    let scheme = url.scheme();
    matches!(scheme, "http" | "https")
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
}

fn sanitize_skill_origin(source: Option<String>) -> Option<String> {
    let source = source?;
    if Url::parse(&source).is_ok() {
        is_safe_backup_url(&source).then_some(source)
    } else if source.contains("://") {
        None
    } else {
        Some(source)
    }
}

fn is_portable_backup_path(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || trimmed.starts_with('/')
        || trimmed.starts_with('\\')
        || trimmed.contains('\\')
    {
        return false;
    }
    let bytes = trimmed.as_bytes();
    if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
        return false;
    }
    trimmed
        .split('/')
        .all(|part| !part.is_empty() && part != "." && part != "..")
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

    async fn configure_agent_root(pool: &DbPool, agent_id: &str, root: &Path) {
        std::fs::create_dir_all(root).expect("agent root");
        sqlx::query("UPDATE agents SET global_skills_dir = ? WHERE id = ?")
            .bind(path_to_string(root))
            .bind(agent_id)
            .execute(pool)
            .await
            .expect("agent path");
    }

    #[tokio::test]
    async fn backup_roundtrip_preserves_skill_installations() {
        let (source_pool, source_dir) = setup_test_db().await;
        let source_agent_root = source_dir.path().join("source-windsurf");
        configure_agent_root(&source_pool, "windsurf", &source_agent_root).await;
        let central = central_root(&source_pool).await.expect("central");
        let skill_dir = central.join("installed-demo");
        std::fs::create_dir_all(&skill_dir).expect("skill dir");
        std::fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: Installed Demo\n---\n",
        )
        .expect("skill");

        db::upsert_skill(
            &source_pool,
            &Skill {
                id: "installed-demo".to_string(),
                name: "Installed Demo".to_string(),
                description: None,
                file_path: path_to_string(&skill_dir.join("SKILL.md")),
                canonical_path: Some(path_to_string(&skill_dir)),
                is_central: true,
                source: Some("https://example.com/raw/SKILL.md?token=secret".to_string()),
                content: None,
                scanned_at: "2026-01-01T00:00:00Z".to_string(),
            },
        )
        .await
        .expect("skill");
        crate::commands::linker::install_skill_to_agent_copy_impl(
            &source_pool,
            "installed-demo",
            "windsurf",
        )
        .await
        .expect("installation");

        let json = export_app_backup_impl(&source_pool, BackupOptions::default())
            .await
            .expect("export");
        assert!(!json.contains("installed_path"));
        assert!(!json.contains("symlink_target"));
        assert!(json.contains("\"method\": \"copy\""));

        let (target_pool, target_dir) = setup_test_db().await;
        let target_agent_root = target_dir.path().join("target-windsurf");
        configure_agent_root(&target_pool, "windsurf", &target_agent_root).await;
        import_app_backup_impl(&target_pool, &json)
            .await
            .expect("import");

        let installations = db::get_skill_installations(&target_pool, "installed-demo")
            .await
            .expect("installations");
        assert_eq!(installations.len(), 1);
        assert_eq!(installations[0].agent_id, "windsurf");
        assert_eq!(installations[0].link_type, "copy");
        assert_eq!(
            installations[0].installed_path,
            path_to_string(&target_agent_root.join("installed-demo"))
        );
        assert!(target_agent_root.join("installed-demo").is_dir());
        assert_eq!(installations[0].symlink_target.as_deref(), None);

        std::fs::write(
            target_agent_root.join("installed-demo").join("stale.txt"),
            "stale copy content",
        )
        .expect("stale copy marker");
        import_app_backup_impl(&target_pool, &json)
            .await
            .expect("repeat import refreshes copy");
        assert!(target_agent_root.join("installed-demo").is_dir());
        assert!(!target_agent_root
            .join("installed-demo")
            .join("stale.txt")
            .exists());
    }

    #[tokio::test]
    async fn legacy_installation_paths_are_ignored_during_import() {
        let (source_pool, _source_dir) = setup_test_db().await;
        let central = central_root(&source_pool).await.expect("central");
        let skill_dir = central.join("legacy-demo");
        std::fs::create_dir_all(&skill_dir).expect("skill dir");
        std::fs::write(skill_dir.join("SKILL.md"), "---\nname: Legacy Demo\n---\n").expect("skill");
        db::upsert_skill(
            &source_pool,
            &Skill {
                id: "legacy-demo".to_string(),
                name: "Legacy Demo".to_string(),
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
        let json = export_app_backup_impl(
            &source_pool,
            BackupOptions {
                include_installations: false,
                ..BackupOptions::default()
            },
        )
        .await
        .expect("export");
        let mut value: serde_json::Value = serde_json::from_str(&json).expect("backup");
        value["skill_installations"] = serde_json::json!([{
            "skill_id": "legacy-demo",
            "agent_id": "windsurf",
            "installed_path": "D:\\\\outside\\\\dangerous",
            "link_type": "copy",
            "symlink_target": "D:\\\\outside\\\\canonical",
            "created_at": "2026-01-02T00:00:00Z"
        }]);

        let (target_pool, target_dir) = setup_test_db().await;
        let target_agent_root = target_dir.path().join("target-windsurf");
        configure_agent_root(&target_pool, "windsurf", &target_agent_root).await;
        import_app_backup_impl(&target_pool, &value.to_string())
            .await
            .expect("import");

        let installation = db::get_skill_installations(&target_pool, "legacy-demo")
            .await
            .expect("installations")
            .pop()
            .expect("installation");
        assert_eq!(installation.link_type, "copy");
        assert_eq!(
            installation.installed_path,
            path_to_string(&target_agent_root.join("legacy-demo"))
        );
        assert_ne!(installation.installed_path, "D:\\outside\\dangerous");
        assert_eq!(installation.symlink_target, None);
        assert!(target_agent_root.join("legacy-demo").is_dir());
    }

    #[test]
    fn installation_method_accepts_only_safe_values() {
        assert_eq!(
            validated_install_method(Some("symlink")),
            BackupInstallMethod::Symlink
        );
        assert_eq!(
            validated_install_method(Some("copy")),
            BackupInstallMethod::Copy
        );
        assert_eq!(
            validated_install_method(Some("copycat")),
            BackupInstallMethod::Symlink
        );
        assert_eq!(validated_install_method(None), BackupInstallMethod::Symlink);
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
        db::set_setting(&pool, "skill_resource_library_dir", "D:\\backup-library")
            .await
            .expect("resource library path");
        db::set_setting(&pool, "github_pat", "should-not-export")
            .await
            .expect("pat");
        db::set_setting(&pool, "ai_api_key", "should-not-export")
            .await
            .expect("api key");
        db::set_setting(&pool, "account_password", "should-not-export")
            .await
            .expect("password");
        db::set_setting(&pool, "service_secret", "should-not-export")
            .await
            .expect("secret");
        db::set_setting(&pool, "webdav_url", "https://user:pass@example.com/dav")
            .await
            .expect("userinfo URL");

        let json = export_app_backup_impl(&pool, BackupOptions::default())
            .await
            .expect("export");
        assert!(json.contains("\"language\""));
        assert!(!json.contains("skill_resource_library_dir"));
        assert!(!json.contains("should-not-export"));
        assert!(!json.contains("https://user:pass@example.com/dav"));

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
    async fn backup_excludes_credential_urls_and_sync_errors() {
        let (pool, _dir) = setup_test_db().await;
        let central = central_root(&pool).await.expect("central");
        let skill_dir = central.join("url-safety-demo");
        std::fs::create_dir_all(&skill_dir).expect("skill dir");
        std::fs::write(skill_dir.join("SKILL.md"), "---\nname: URL Safety\n---\n").expect("skill");
        db::upsert_skill(
            &pool,
            &Skill {
                id: "url-safety-demo".to_string(),
                name: "URL Safety".to_string(),
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
        db::upsert_skill_source(
            &pool,
            &SkillSource {
                skill_id: "url-safety-demo".to_string(),
                source_type: "github".to_string(),
                source_url: Some("https://token:secret@example.com/skill.md".to_string()),
                source_author: Some("example".to_string()),
                source_repo: Some("example/repo".to_string()),
                source_path: Some(r"C:\private\skill".to_string()),
                updated_at: "2026-01-01T00:00:00Z".to_string(),
            },
        )
        .await
        .expect("source");
        sqlx::query(
            "INSERT INTO skill_registries
             (id, name, source_type, url, is_builtin, is_enabled, last_sync_status, last_sync_error, created_at)
             VALUES (?, ?, ?, ?, 0, 1, ?, ?, ?)",
        )
        .bind("safe-registry")
        .bind("Safe Registry")
        .bind("github")
        .bind("https://github.com/example/safe")
        .bind("failed")
        .bind(r"C:\private\sync.log token=secret")
        .bind("2026-01-01T00:00:00Z")
        .execute(&pool)
        .await
        .expect("safe registry");
        sqlx::query(
            "INSERT INTO skill_registries
             (id, name, source_type, url, is_builtin, is_enabled, last_sync_status, last_sync_error, created_at)
             VALUES (?, ?, ?, ?, 0, 1, ?, ?, ?)",
        )
        .bind("query-registry")
        .bind("Query Registry")
        .bind("github")
        .bind("https://example.com/private?token=secret")
        .bind("failed")
        .bind("query-error")
        .bind("2026-01-01T00:00:00Z")
        .execute(&pool)
        .await
        .expect("query registry");
        sqlx::query(
            "INSERT INTO skill_registries
             (id, name, source_type, url, is_builtin, is_enabled, last_sync_status, last_sync_error, created_at)
             VALUES (?, ?, ?, ?, 0, 1, ?, ?, ?)",
        )
        .bind("unsafe-registry")
        .bind("Unsafe Registry")
        .bind("github")
        .bind("https://user:secret@example.com/private")
        .bind("failed")
        .bind("should-not-export")
        .bind("2026-01-01T00:00:00Z")
        .execute(&pool)
        .await
        .expect("unsafe registry");
        sqlx::query(
            "INSERT INTO marketplace_skills
             (id, registry_id, name, download_url, is_installed, synced_at)
             VALUES (?, ?, ?, ?, 0, ?)",
        )
        .bind("safe-marketplace")
        .bind("safe-registry")
        .bind("safe-marketplace")
        .bind("https://example.com/safe/SKILL.md")
        .bind("2026-01-01T00:00:00Z")
        .execute(&pool)
        .await
        .expect("safe marketplace");
        sqlx::query(
            "INSERT INTO marketplace_skills
             (id, registry_id, name, download_url, is_installed, synced_at)
             VALUES (?, ?, ?, ?, 0, ?)",
        )
        .bind("unsafe-marketplace")
        .bind("safe-registry")
        .bind("unsafe-marketplace")
        .bind("https://token:secret@example.com/unsafe/SKILL.md")
        .bind("2026-01-01T00:00:00Z")
        .execute(&pool)
        .await
        .expect("unsafe marketplace");

        let json = export_app_backup_impl(&pool, BackupOptions::default())
            .await
            .expect("export");

        assert!(json.contains("https://github.com/example/safe"));
        assert!(json.contains("https://example.com/safe/SKILL.md"));
        assert!(!json.contains("https://user:secret@example.com/private"));
        assert!(!json.contains("https://token:secret@example.com"));
        assert!(!json.contains("token=secret"));
        assert!(!json.contains("should-not-export"));
        assert!(!json.contains("query-error"));
        assert!(!json.contains("sync.log"));
        assert!(!json.contains("C:\\\\private"));
    }

    #[tokio::test]
    async fn import_sanitizes_credential_urls_and_sync_errors() {
        let (pool, _dir) = setup_test_db().await;
        let central = central_root(&pool).await.expect("central");
        let backup = serde_json::json!({
            "schema_version": BACKUP_SCHEMA_VERSION,
            "exported_at": "2026-01-01T00:00:00Z",
            "included": {"includeResourceLibrary": true, "includeCentralLibrary": true, "includeAppConfig": true, "includeInstallations": true},
            "skills": [{
                "skill": {
                    "id": "import-url-safety",
                    "name": "Import URL Safety",
                    "description": null,
                    "file_path": "",
                    "canonical_path": null,
                    "is_central": true,
                    "source": "https://example.com/raw/SKILL.md?token=secret",
                    "content": null,
                    "scanned_at": "2026-01-01T00:00:00Z"
                },
                "source": {
                    "skill_id": "import-url-safety",
                    "source_type": "github",
                    "source_url": "https://user:secret@example.com/SKILL.md",
                    "source_author": "example",
                    "source_repo": "example/repo",
                    "source_path": "C:\\private\\skill",
                    "updated_at": "2026-01-01T00:00:00Z"
                },
                "storage_kind": "central",
                "relative_dir": "import-url-safety",
                "files": [{"relative_path": "SKILL.md", "content_base64": "LS0tCm5hbWU6IERlbW8KLS0tCg=="}]
            }],
            "collections": [],
            "collection_skills": [],
            "settings": [],
            "agents": [],
            "scan_directories": [],
            "skill_registries": [{
                "id": "unsafe-registry",
                "name": "Unsafe Registry",
                "source_type": "github",
                "url": "https://example.com/private?token=secret",
                "is_builtin": false,
                "is_enabled": true,
                "last_synced": null,
                "last_attempted_sync": null,
                "last_sync_status": "failed",
                "last_sync_error": "token=secret",
                "cache_updated_at": null,
                "cache_expires_at": null,
                "etag": null,
                "last_modified": null,
                "created_at": "2026-01-01T00:00:00Z"
            }],
            "marketplace_skills": [{
                "id": "unsafe-marketplace",
                "registry_id": "unsafe-registry",
                "name": "unsafe-marketplace",
                "description": null,
                "download_url": "https://token:secret@example.com/SKILL.md",
                "is_installed": false,
                "synced_at": "2026-01-01T00:00:00Z",
                "cache_updated_at": null
            }],
            "skill_installations": []
        });

        import_app_backup_impl(&pool, &backup.to_string())
            .await
            .expect("import");
        let restored = db::get_skill_by_id(&pool, "import-url-safety")
            .await
            .expect("skill")
            .expect("skill row");
        assert_eq!(restored.source, None);
        let source = db::get_skill_source(&pool, "import-url-safety")
            .await
            .expect("source")
            .expect("source row");
        assert_eq!(source.source_url, None);
        assert_eq!(source.source_path, None);
        assert!(!central.join("unsafe-registry").exists());
        assert!(sqlx::query_scalar::<_, String>(
            "SELECT id FROM skill_registries WHERE id = 'unsafe-registry'"
        )
        .fetch_optional(&pool)
        .await
        .expect("registry lookup")
        .is_none());
        assert!(sqlx::query_scalar::<_, String>(
            "SELECT id FROM marketplace_skills WHERE id = 'unsafe-marketplace'"
        )
        .fetch_optional(&pool)
        .await
        .expect("marketplace lookup")
        .is_none());
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

    #[test]
    fn webdav_normalize_remote_path_rejects_traversal() {
        let result = normalize_webdav_remote_path("../secret.json");
        assert!(result.is_err());
    }

    #[test]
    fn webdav_normalize_remote_path_rejects_absolute_and_unc_like_values() {
        for value in [
            "/backups/skillshub-backup.json",
            r"\server\share\backup.json",
            r"C:\backups\skillshub-backup.json",
            "C:/backups/skillshub-backup.json",
            r"safe\..\secret.json",
        ] {
            assert!(
                normalize_webdav_remote_path(value).is_err(),
                "absolute-looking path accepted: {value}"
            );
        }
    }

    #[test]
    fn generated_backup_filenames_are_unique_and_keep_json_suffix() {
        let first = generated_backup_filename();
        let second = generated_backup_filename();
        assert_ne!(first, second);
        assert!(first.starts_with("skillshub-backup-"));
        assert!(first.ends_with(".json"));
        assert!(generated_backup_timestamp(&first).is_some());
    }

    #[test]
    fn webdav_normalize_remote_path_accepts_nested_json_backup() {
        let result =
            normalize_webdav_remote_path("backups/skillshub-backup.json").expect("normalized path");
        assert_eq!(result, "backups/skillshub-backup.json");
    }

    #[test]
    fn webdav_normalize_base_url_rejects_non_http_urls() {
        let result = normalize_webdav_base_url("file:///tmp/backups");
        assert!(result.is_err());
    }

    #[test]
    fn webdav_normalize_base_url_trims_trailing_slash() {
        let result = normalize_webdav_base_url("https://example.com/dav/").expect("normalized url");
        assert_eq!(result, "https://example.com/dav");
    }

    #[test]
    fn webdav_normalize_base_url_rejects_query_fragment_and_userinfo() {
        for value in [
            "https://example.com/dav?scope=backups",
            "https://example.com/dav#backups",
            "https://user@example.com/dav",
        ] {
            let error = normalize_webdav_base_url(value).expect_err("unsafe URL accepted");
            assert!(!error.contains("example.com"));
        }
    }

    #[test]
    fn webdav_build_url_encodes_each_path_segment() {
        let config = WebDavConfig {
            base_url: "https://example.com/dav".to_string(),
            username: None,
            password: None,
            remote_dir: "nested folder".to_string(),
        };

        let url =
            build_webdav_url(&config, "backup name%2e%2e%3Fx%23frag.json").expect("WebDAV URL");
        assert!(url.contains("/dav/nested%20folder/"));
        assert!(url.contains("backup%20name%252e%252e%253Fx%2523frag.json"));
        let parsed = Url::parse(&url).expect("encoded URL");
        assert_eq!(parsed.query(), None);
        assert_eq!(parsed.fragment(), None);
        assert_eq!(
            parsed
                .path_segments()
                .expect("path segments")
                .collect::<Vec<_>>(),
            vec![
                "dav",
                "nested%20folder",
                "backup%20name%252e%252e%253Fx%2523frag.json"
            ]
        );
    }

    #[test]
    fn webdav_build_url_keeps_encoded_delimiters_inside_remote_dir() {
        let config = WebDavConfig {
            base_url: "https://example.com/dav".to_string(),
            username: None,
            password: None,
            remote_dir: "safe".to_string(),
        };

        let url = build_webdav_url(&config, "%2e%2e/%2f/backup.json").expect("WebDAV URL");
        assert_eq!(
            url,
            "https://example.com/dav/safe/%252e%252e/%252f/backup.json"
        );
    }

    #[test]
    fn webdav_parse_namespaced_propfind_xml() {
        let xml = r#"
            <d:multistatus xmlns:d="DAV:">
              <d:response>
                <d:href>/dav/backups/</d:href>
                <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat>
              </d:response>
              <d:response>
                <d:href>/dav/backups/skillshub-backup.json</d:href>
                <d:propstat>
                  <d:prop>
                    <d:getcontentlength>42</d:getcontentlength>
                    <d:getlastmodified>Wed, 15 Jul 2026 08:00:00 GMT</d:getlastmodified>
                  </d:prop>
                  <d:status>HTTP/1.1 200 OK</d:status>
                </d:propstat>
              </d:response>
              <d:response><d:href>/dav/backups/readme.txt</d:href></d:response>
            </d:multistatus>
        "#;

        let files = parse_webdav_backup_files(xml).expect("PROPFIND XML");
        assert_eq!(
            files,
            vec![WebDavBackupFile {
                name: "skillshub-backup.json".to_string(),
                remote_path: "skillshub-backup.json".to_string(),
                size: Some(42),
                modified_at: Some("Wed, 15 Jul 2026 08:00:00 GMT".to_string()),
            }]
        );
    }

    #[test]
    fn webdav_parse_decodes_one_href_filename_segment() {
        let xml = r#"
            <d:multistatus xmlns:d="DAV:">
              <d:response>
                <d:href>/dav/backups/skillshub-backup%20copy.json</d:href>
              </d:response>
            </d:multistatus>
        "#;

        let files = parse_webdav_backup_files(xml).expect("PROPFIND XML");

        assert_eq!(files[0].name, "skillshub-backup copy.json");
        assert_eq!(files[0].remote_path, "skillshub-backup copy.json");
        let url = build_webdav_url(
            &WebDavConfig {
                base_url: "https://example.com/dav".to_string(),
                username: None,
                password: None,
                remote_dir: "backups".to_string(),
            },
            &files[0].remote_path,
        )
        .expect("WebDAV URL");
        assert!(url.ends_with("/dav/backups/skillshub-backup%20copy.json"));
    }

    #[test]
    fn webdav_parse_rejects_decoded_href_separators() {
        let xml = r#"
            <d:multistatus xmlns:d="DAV:">
              <d:response>
                <d:href>/dav/backups/skillshub-backup%2Fnested.json</d:href>
              </d:response>
            </d:multistatus>
        "#;

        assert!(parse_webdav_backup_files(xml).is_err());
    }

    #[test]
    fn webdav_parse_sorts_valid_http_dates_newest_first() {
        let xml = r#"
            <d:multistatus xmlns:d="DAV:">
              <d:response>
                <d:href>/dav/backups/skillshub-backup-2026-07-15-100000.json</d:href>
                <d:propstat><d:prop><d:getlastmodified>Wed, 15 Jul 2026 10:00:00 GMT</d:getlastmodified></d:prop></d:propstat>
              </d:response>
              <d:response>
                <d:href>/dav/backups/skillshub-backup-2026-07-16-090000.json</d:href>
                <d:propstat><d:prop><d:getlastmodified>Thu, 16 Jul 2026 09:00:00 GMT</d:getlastmodified></d:prop></d:propstat>
              </d:response>
            </d:multistatus>
        "#;

        let files = parse_webdav_backup_files(xml).expect("PROPFIND XML");

        assert_eq!(
            files
                .iter()
                .map(|file| file.name.as_str())
                .collect::<Vec<_>>(),
            vec![
                "skillshub-backup-2026-07-16-090000.json",
                "skillshub-backup-2026-07-15-100000.json",
            ]
        );
    }

    #[test]
    fn webdav_parse_sorts_missing_or_invalid_dates_by_filename_timestamp() {
        let xml = r#"
            <d:multistatus xmlns:d="DAV:">
              <d:response>
                <d:href>/dav/backups/skillshub-backup-2026-01-01-010000.json</d:href>
              </d:response>
              <d:response>
                <d:href>/dav/backups/skillshub-backup-2026-07-01-010000.json</d:href>
                <d:propstat><d:prop><d:getlastmodified>not a date</d:getlastmodified></d:prop></d:propstat>
              </d:response>
              <d:response>
                <d:href>/dav/backups/skillshub-backup-2026-06-01-010000.json</d:href>
              </d:response>
              <d:response>
                <d:href>/dav/backups/skillshub-backup-2026-08-01-010000.json</d:href>
                <d:propstat><d:prop><d:getlastmodified>Thu, 01 Jan 2026 00:00:00 GMT</d:getlastmodified></d:prop></d:propstat>
              </d:response>
            </d:multistatus>
        "#;

        let files = parse_webdav_backup_files(xml).expect("PROPFIND XML");

        assert_eq!(
            files
                .iter()
                .map(|file| file.name.as_str())
                .collect::<Vec<_>>(),
            vec![
                "skillshub-backup-2026-08-01-010000.json",
                "skillshub-backup-2026-07-01-010000.json",
                "skillshub-backup-2026-06-01-010000.json",
                "skillshub-backup-2026-01-01-010000.json",
            ]
        );
    }

    #[test]
    fn webdav_parse_sorts_by_newest_available_http_or_filename_timestamp() {
        let xml = r#"
            <d:multistatus xmlns:d="DAV:">
              <d:response>
                <d:href>/dav/backups/skillshub-backup-2026-07-17-090000.json</d:href>
                <d:propstat><d:prop><d:getlastmodified>Wed, 15 Jul 2026 08:00:00 GMT</d:getlastmodified></d:prop></d:propstat>
              </d:response>
              <d:response>
                <d:href>/dav/backups/skillshub-backup-2026-07-15-100000.json</d:href>
                <d:propstat><d:prop><d:getlastmodified>Thu, 16 Jul 2026 09:00:00 GMT</d:getlastmodified></d:prop></d:propstat>
              </d:response>
            </d:multistatus>
        "#;

        let files = parse_webdav_backup_files(xml).expect("PROPFIND XML");
        assert_eq!(
            files.first().map(|file| file.name.as_str()),
            Some("skillshub-backup-2026-07-17-090000.json")
        );
    }

    #[tokio::test]
    async fn export_omits_local_filesystem_paths() {
        let (pool, dir) = setup_test_db().await;
        let private_root = dir.path().join("private-export-root");
        let central = central_root(&pool).await.expect("central");
        let skill_dir = central.join("portable-demo");
        std::fs::create_dir_all(&skill_dir).expect("skill dir");
        std::fs::write(skill_dir.join("SKILL.md"), "---\nname: Portable\n---\n").expect("skill");
        db::upsert_skill(
            &pool,
            &Skill {
                id: "portable-demo".to_string(),
                name: "Portable".to_string(),
                description: None,
                file_path: path_to_string(&private_root.join("file-path").join("SKILL.md")),
                canonical_path: Some(path_to_string(&skill_dir)),
                is_central: true,
                source: None,
                content: None,
                scanned_at: "2026-01-01T00:00:00Z".to_string(),
            },
        )
        .await
        .expect("skill");
        db::set_setting(
            &pool,
            "skill_resource_library_dir",
            &path_to_string(&private_root),
        )
        .await
        .expect("resource setting");

        let json = export_app_backup_impl(&pool, BackupOptions::default())
            .await
            .expect("export");

        assert!(!json.contains(&path_to_string(&private_root)));
        assert!(!json.contains("central_root"));
        assert!(!json.contains("global_skills_dir"));
    }

    #[tokio::test]
    async fn import_uses_current_resource_root_and_ignores_backup_root() {
        let (pool, dir) = setup_test_db().await;
        let current_root = dir.path().join("current-resource-root");
        let malicious_root = dir.path().join("malicious-resource-root");
        db::set_skill_resource_library_dir(&pool, &current_root.to_string_lossy())
            .await
            .expect("current resource root");
        let backup = serde_json::json!({
            "schema_version": BACKUP_SCHEMA_VERSION,
            "exported_at": "2026-01-01T00:00:00Z",
            "central_root": malicious_root.join("central").to_string_lossy(),
            "included": {"includeResourceLibrary": true, "includeCentralLibrary": true, "includeAppConfig": true, "includeInstallations": true},
            "collections": [],
            "collection_skills": [],
            "settings": [{"key": "skill_resource_library_dir", "value": malicious_root.to_string_lossy()}],
            "agents": [],
            "scan_directories": [],
            "skill_registries": [],
            "marketplace_skills": [],
            "skills": [{
                "skill": {
                    "id": "resource-root-demo",
                    "name": "Resource Root Demo",
                    "description": null,
                    "file_path": malicious_root.join("file").to_string_lossy(),
                    "canonical_path": malicious_root.to_string_lossy(),
                    "is_central": false,
                    "source": null,
                    "content": null,
                    "scanned_at": "2026-01-01T00:00:00Z"
                },
                "storage_kind": "resource",
                "relative_dir": "resource-root-demo",
                "files": [{"relative_path": "SKILL.md", "content_base64": "LS0tCm5hbWU6IERlbW8KLS0tCg=="}]
            }]
        });

        import_app_backup_impl(&pool, &backup.to_string())
            .await
            .expect("import");

        assert!(current_root.join("resource-root-demo/SKILL.md").exists());
        assert!(!malicious_root.exists());
        assert_eq!(
            db::get_skill_resource_library_dir(&pool)
                .await
                .expect("resource root"),
            current_root
        );
    }

    #[tokio::test]
    async fn import_does_not_create_custom_agents_or_use_backup_paths() {
        let (pool, dir) = setup_test_db().await;
        let malicious_root = dir.path().join("malicious-agent-root");
        let backup = serde_json::json!({
            "schema_version": BACKUP_SCHEMA_VERSION,
            "exported_at": "2026-01-01T00:00:00Z",
            "included": {"includeResourceLibrary": true, "includeCentralLibrary": true, "includeAppConfig": true, "includeInstallations": true},
            "skills": [],
            "collections": [],
            "collection_skills": [],
            "settings": [],
            "agents": [{
                "id": "backup-custom-agent",
                "display_name": "Backup Agent",
                "category": "coding",
                "global_skills_dir": malicious_root.to_string_lossy(),
                "project_skills_dir": malicious_root.to_string_lossy(),
                "icon_name": null,
                "is_detected": true,
                "is_builtin": false,
                "is_enabled": true
            }],
            "scan_directories": [],
            "skill_registries": [],
            "marketplace_skills": [],
            "skill_installations": [{"skill_id": "missing-skill", "agent_id": "backup-custom-agent", "method": "copy"}]
        });

        import_app_backup_impl(&pool, &backup.to_string())
            .await
            .expect("missing custom agent is skipped");

        assert!(db::get_agent_by_id(&pool, "backup-custom-agent")
            .await
            .expect("agent lookup")
            .is_none());
        assert!(!malicious_root.exists());
    }

    #[tokio::test]
    async fn import_skips_installations_with_missing_dependencies() {
        let (pool, _dir) = setup_test_db().await;
        let backup = serde_json::json!({
            "schema_version": BACKUP_SCHEMA_VERSION,
            "exported_at": "2026-01-01T00:00:00Z",
            "included": {"includeResourceLibrary": true, "includeCentralLibrary": true, "includeAppConfig": true, "includeInstallations": true},
            "skills": [],
            "collections": [],
            "collection_skills": [],
            "settings": [],
            "agents": [],
            "scan_directories": [],
            "skill_registries": [],
            "marketplace_skills": [],
            "skill_installations": [
                {"skill_id": "missing-skill", "agent_id": "claude-code", "method": "copy"},
                {"skill_id": "missing-skill", "agent_id": "missing-agent", "method": "copy"}
            ]
        });

        import_app_backup_impl(&pool, &backup.to_string())
            .await
            .expect("missing installation dependencies are skipped");
        assert!(db::get_skill_installations(&pool, "missing-skill")
            .await
            .expect("installations")
            .is_empty());
    }

    #[tokio::test]
    async fn import_validates_files_before_replacing_existing_skill_directory() {
        let (pool, _dir) = setup_test_db().await;
        let central = central_root(&pool).await.expect("central");
        let skill_dir = central.join("invalid-content-demo");
        std::fs::create_dir_all(&skill_dir).expect("skill dir");
        std::fs::write(skill_dir.join("SKILL.md"), "---\nname: Existing\n---\n")
            .expect("existing skill");
        db::upsert_skill(
            &pool,
            &Skill {
                id: "invalid-content-demo".to_string(),
                name: "Existing".to_string(),
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
        let backup = serde_json::json!({
            "schema_version": BACKUP_SCHEMA_VERSION,
            "exported_at": "2026-01-01T00:00:00Z",
            "included": {"includeResourceLibrary": true, "includeCentralLibrary": true, "includeAppConfig": true, "includeInstallations": true},
            "skills": [{
                "skill": {
                    "id": "invalid-content-demo",
                    "name": "Invalid Content Demo",
                    "description": null,
                    "file_path": "",
                    "canonical_path": null,
                    "is_central": true,
                    "source": null,
                    "content": null,
                    "scanned_at": "2026-01-01T00:00:00Z"
                },
                "storage_kind": "central",
                "relative_dir": "invalid-content-demo",
                "files": [{"relative_path": "SKILL.md", "content_base64": "not base64"}]
            }],
            "collections": [],
            "collection_skills": [],
            "settings": [],
            "agents": [],
            "scan_directories": [],
            "skill_registries": [],
            "marketplace_skills": [],
            "skill_installations": []
        });

        let error = import_app_backup_impl(&pool, &backup.to_string())
            .await
            .expect_err("invalid backup accepted");
        assert!(error.contains("Invalid base64 content"));
        assert_eq!(
            std::fs::read_to_string(skill_dir.join("SKILL.md")).expect("existing skill content"),
            "---\nname: Existing\n---\n"
        );
    }

    #[tokio::test]
    async fn import_rejects_conflicting_file_tree_before_replacing_existing_skill_directory() {
        let (pool, _dir) = setup_test_db().await;
        let central = central_root(&pool).await.expect("central");
        let skill_dir = central.join("conflict-demo");
        std::fs::create_dir_all(&skill_dir).expect("skill dir");
        std::fs::write(skill_dir.join("SKILL.md"), "---\nname: Existing\n---\n")
            .expect("existing skill");
        let backup = serde_json::json!({
            "schema_version": BACKUP_SCHEMA_VERSION,
            "exported_at": "2026-01-01T00:00:00Z",
            "included": {"includeResourceLibrary": true, "includeCentralLibrary": true, "includeAppConfig": true, "includeInstallations": true},
            "skills": [{
                "skill": {
                    "id": "conflict-demo",
                    "name": "Conflict Demo",
                    "description": null,
                    "file_path": "",
                    "canonical_path": null,
                    "is_central": true,
                    "source": null,
                    "content": null,
                    "scanned_at": "2026-01-01T00:00:00Z"
                },
                "storage_kind": "central",
                "relative_dir": "conflict-demo",
                "files": [
                    {"relative_path": "node", "content_base64": "bm9kZQ=="},
                    {"relative_path": "node/child", "content_base64": "Y2hpbGQ="}
                ]
            }],
            "collections": [],
            "collection_skills": [],
            "settings": [],
            "agents": [],
            "scan_directories": [],
            "skill_registries": [],
            "marketplace_skills": [],
            "skill_installations": []
        });

        let error = import_app_backup_impl(&pool, &backup.to_string())
            .await
            .expect_err("conflicting backup accepted");
        assert!(error.contains("conflicting file and directory paths"));
        assert_eq!(
            std::fs::read_to_string(skill_dir.join("SKILL.md")).expect("existing skill content"),
            "---\nname: Existing\n---\n"
        );
    }

    #[test]
    fn normalize_relative_path_rejects_nested_windows_drive_segments() {
        assert!(normalize_relative_path("safe/C:/escape").is_err());
    }

    #[tokio::test]
    async fn import_accepts_legacy_backslash_relative_paths_as_portable_segments() {
        let (pool, _dir) = setup_test_db().await;
        let central = central_root(&pool).await.expect("central");
        let backup = serde_json::json!({
            "schema_version": BACKUP_SCHEMA_VERSION,
            "exported_at": "2026-01-01T00:00:00Z",
            "included": {"includeResourceLibrary": true, "includeCentralLibrary": true, "includeAppConfig": true, "includeInstallations": true},
            "skills": [{
                "skill": {
                    "id": "legacy-path-demo",
                    "name": "Legacy Path Demo",
                    "description": null,
                    "file_path": "",
                    "canonical_path": null,
                    "is_central": true,
                    "source": null,
                    "content": null,
                    "scanned_at": "2026-01-01T00:00:00Z"
                },
                "storage_kind": "central",
                "relative_dir": "nested\\legacy-path-demo",
                "files": [{"relative_path": "docs\\guide.md", "content_base64": "Z3VpZGU="}]
            }],
            "collections": [],
            "collection_skills": [],
            "settings": [],
            "agents": [],
            "scan_directories": [],
            "skill_registries": [],
            "marketplace_skills": [],
            "skill_installations": []
        });

        import_app_backup_impl(&pool, &backup.to_string())
            .await
            .expect("import");
        assert_eq!(
            std::fs::read_to_string(central.join("nested/legacy-path-demo/docs/guide.md"))
                .expect("restored file"),
            "guide"
        );
    }
}
