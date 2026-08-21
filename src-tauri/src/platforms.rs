use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::{Deserialize, Serialize};

use crate::db::Agent;
use crate::default_platform_icons::default_icon_bytes;
#[cfg(not(test))]
use crate::path_utils::app_data_dir;
use crate::path_utils::{expand_home_path, path_to_string};

const DEFAULTS_JSON: &str = include_str!("../resources/default-platforms/defaults.json");
const LEGACY_OVERRIDES_FILE: &str = "builtin-agent-overrides.json";
const CATALOG_FILE_NAME: &str = "platform.json";
const ICONS_DIR_NAME: &str = "icons";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformDefinition {
    pub id: String,
    pub display_name: String,
    pub category: String,
    pub global_skills_dir: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_skills_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub supports_universal_agents_skills: bool,
}

fn default_enabled() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PlatformCatalogFile {
    platforms: Vec<PlatformDefinition>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct LegacyBuiltinAgentOverrides {
    #[serde(default)]
    edited: std::collections::HashMap<String, LegacyBuiltinAgentOverride>,
    #[serde(default)]
    deleted: HashSet<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LegacyBuiltinAgentOverride {
    display_name: String,
    category: String,
    global_skills_dir: String,
}

#[cfg(not(test))]
pub fn platform_dir() -> Option<PathBuf> {
    Some(app_data_dir().join("platform"))
}

#[cfg(test)]
pub fn platform_dir() -> Option<PathBuf> {
    std::env::var_os("SKILLSHUB_PLATFORM_DIR")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

fn catalog_path(dir: &Path) -> PathBuf {
    dir.join(CATALOG_FILE_NAME)
}

fn icons_dir(dir: &Path) -> PathBuf {
    dir.join(ICONS_DIR_NAME)
}

pub fn default_platform_definitions() -> Result<Vec<PlatformDefinition>, String> {
    serde_json::from_str(DEFAULTS_JSON)
        .map_err(|e| format!("Invalid default platform catalog: {}", e))
}

fn default_platform_ids() -> HashSet<String> {
    default_platform_definitions()
        .unwrap_or_default()
        .into_iter()
        .map(|platform| platform.id)
        .collect()
}

fn is_project_agent_id(agent_id: &str) -> bool {
    agent_id.starts_with("project:")
}

fn apply_legacy_overrides(mut platforms: Vec<PlatformDefinition>) -> Vec<PlatformDefinition> {
    let Some(path) = platform_dir().and_then(|dir| {
        dir.parent()
            .map(|parent| parent.join(LEGACY_OVERRIDES_FILE))
    }) else {
        return platforms;
    };
    if !path.exists() {
        return platforms;
    }
    let Ok(content) = fs::read_to_string(&path) else {
        return platforms;
    };
    let Ok(overrides) = serde_json::from_str::<LegacyBuiltinAgentOverrides>(&content) else {
        return platforms;
    };
    platforms.retain(|platform| !overrides.deleted.contains(&platform.id));
    for platform in &mut platforms {
        if let Some(edited) = overrides.edited.get(&platform.id) {
            platform.display_name = edited.display_name.clone();
            platform.category = edited.category.clone();
            platform.global_skills_dir = edited.global_skills_dir.clone();
        }
    }
    platforms
}

fn json_files_in(dir: &Path) -> Result<Vec<PathBuf>, String> {
    if !dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut files = Vec::new();
    for entry in
        fs::read_dir(dir).map_err(|e| format!("Failed to read platform directory: {}", e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read platform directory entry: {}", e))?;
        let path = entry.path();
        if path.file_name().and_then(|name| name.to_str()) == Some(CATALOG_FILE_NAME) {
            continue;
        }
        if path.extension().and_then(|ext| ext.to_str()) == Some("json") {
            files.push(path);
        }
    }
    files.sort();
    Ok(files)
}

fn load_definition_file(path: &Path) -> Result<PlatformDefinition, String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read platform file '{}': {}", path.display(), e))?;
    let mut definition: PlatformDefinition = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid platform file '{}': {}", path.display(), e))?;
    if definition.id.trim().is_empty() {
        definition.id = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or_default()
            .to_string();
    }
    if definition.id.trim().is_empty() {
        return Err(format!(
            "Platform file '{}' is missing an id",
            path.display()
        ));
    }
    Ok(definition)
}

fn write_catalog(dir: &Path, platforms: &[PlatformDefinition]) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("Failed to create platform directory: {}", e))?;
    fs::create_dir_all(icons_dir(dir))
        .map_err(|e| format!("Failed to create platform icons directory: {}", e))?;
    let path = catalog_path(dir);
    let content = serde_json::to_string_pretty(&PlatformCatalogFile {
        platforms: platforms.to_vec(),
    })
    .map_err(|e| format!("Failed to serialize platform catalog: {}", e))?;
    fs::write(&path, format!("{content}\n"))
        .map_err(|e| format!("Failed to write platform catalog '{}': {}", path.display(), e))
}

fn write_default_icon(dir: &Path, file_name: &str) -> Result<(), String> {
    let dest = icons_dir(dir).join(file_name);
    if dest.exists() {
        return Ok(());
    }
    if let Some(bytes) = default_icon_bytes(file_name) {
        fs::create_dir_all(icons_dir(dir))
            .map_err(|e| format!("Failed to create platform icons directory: {}", e))?;
        fs::write(&dest, bytes)
            .map_err(|e| format!("Failed to write platform icon '{}': {}", dest.display(), e))?;
    }
    Ok(())
}

fn move_icon_into_icons_dir(dir: &Path, file_name: &str) -> Result<(), String> {
    let icons = icons_dir(dir);
    fs::create_dir_all(&icons)
        .map_err(|e| format!("Failed to create platform icons directory: {}", e))?;
    let src = dir.join(file_name);
    let dest = icons.join(file_name);
    if !src.exists() || src == dest {
        return Ok(());
    }
    if dest.exists() {
        let _ = fs::remove_file(&src);
        return Ok(());
    }
    fs::rename(&src, &dest).or_else(|_| {
        fs::copy(&src, &dest)
            .map(|_| ())
            .and_then(|_| fs::remove_file(&src))
    })
    .map_err(|e| {
        format!(
            "Failed to move platform icon '{}' into icons/: {}",
            file_name, e
        )
    })
}

fn migrate_legacy_per_file_layout(dir: &Path) -> Result<(), String> {
    if catalog_path(dir).exists() {
        return Ok(());
    }
    let legacy_files = json_files_in(dir)?;
    if legacy_files.is_empty() {
        return Ok(());
    }
    let mut platforms = Vec::new();
    let mut seen = HashSet::new();
    for path in &legacy_files {
        let definition = load_definition_file(path)?;
        if seen.insert(definition.id.clone()) {
            if let Some(icon) = definition.icon.as_deref() {
                move_icon_into_icons_dir(dir, icon)?;
            }
            platforms.push(definition);
        }
    }
    write_catalog(dir, &platforms)?;
    for path in legacy_files {
        let _ = fs::remove_file(path);
    }
    Ok(())
}

pub fn write_default_platform_files(dir: &Path) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("Failed to create platform directory: {}", e))?;
    let platforms = default_platform_definitions()?;
    write_catalog(dir, &platforms)?;
    for platform in &platforms {
        if let Some(icon) = platform.icon.as_deref() {
            write_default_icon(dir, icon)?;
        }
    }
    Ok(())
}

fn seed_platform_dir(dir: &Path) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("Failed to create platform directory: {}", e))?;
    migrate_legacy_per_file_layout(dir)?;
    if !load_from_dir(dir)?.is_empty() {
        return Ok(());
    }

    let platforms = apply_legacy_overrides(default_platform_definitions()?);
    write_catalog(dir, &platforms)?;
    for platform in &platforms {
        if let Some(icon) = platform.icon.as_deref() {
            write_default_icon(dir, icon)?;
        }
    }
    Ok(())
}

fn load_from_dir(dir: &Path) -> Result<Vec<PlatformDefinition>, String> {
    let path = catalog_path(dir);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read platform catalog '{}': {}", path.display(), e))?;
    let catalog: PlatformCatalogFile = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid platform catalog '{}': {}", path.display(), e))?;
    let mut platforms = Vec::new();
    let mut seen = HashSet::new();
    for mut definition in catalog.platforms {
        if definition.id.trim().is_empty() {
            continue;
        }
        if !seen.insert(definition.id.clone()) {
            continue;
        }
        if definition.display_name.trim().is_empty() {
            definition.display_name = definition.id.clone();
        }
        platforms.push(definition);
    }
    Ok(platforms)
}

pub fn load_platform_definitions() -> Result<Vec<PlatformDefinition>, String> {
    match platform_dir() {
        Some(dir) => {
            seed_platform_dir(&dir)?;
            load_from_dir(&dir)
        }
        None => default_platform_definitions(),
    }
}

fn portable_global_skills_dir(raw: &str) -> String {
    path_to_string(&expand_home_path(raw))
}

pub fn agents_from_definitions(definitions: &[PlatformDefinition]) -> Vec<Agent> {
    let builtin_ids = default_platform_ids();
    definitions
        .iter()
        .filter(|definition| !is_project_agent_id(&definition.id))
        .map(|definition| Agent {
            id: definition.id.clone(),
            display_name: definition.display_name.clone(),
            category: definition.category.clone(),
            global_skills_dir: portable_global_skills_dir(&definition.global_skills_dir),
            project_skills_dir: definition.project_skills_dir.clone(),
            icon_name: definition.icon.clone(),
            is_detected: false,
            is_builtin: builtin_ids.contains(&definition.id),
            is_enabled: definition.enabled,
        })
        .collect()
}

pub fn builtin_agents() -> Vec<Agent> {
    load_platform_definitions()
        .map(|definitions| agents_from_definitions(&definitions))
        .unwrap_or_else(|_| Vec::new())
}

pub fn universal_agents_skills_agent_ids() -> Vec<String> {
    load_platform_definitions()
        .unwrap_or_default()
        .into_iter()
        .filter(|platform| platform.supports_universal_agents_skills)
        .map(|platform| platform.id)
        .collect()
}

pub fn agent_supports_universal_agents_skills(agent_id: &str) -> bool {
    universal_agents_skills_agent_ids()
        .iter()
        .any(|id| id == agent_id)
}

fn upsert_definition(platforms: &mut Vec<PlatformDefinition>, agent: &Agent) {
    let icon = agent.icon_name.clone().or_else(|| {
        platforms
            .iter()
            .find(|platform| platform.id == agent.id)
            .and_then(|platform| platform.icon.clone())
    });
    let supports_universal = platforms
        .iter()
        .find(|platform| platform.id == agent.id)
        .map(|platform| platform.supports_universal_agents_skills)
        .unwrap_or_else(|| agent_supports_universal_agents_skills(&agent.id));
    if let Some(existing) = platforms.iter_mut().find(|platform| platform.id == agent.id) {
        existing.display_name = agent.display_name.clone();
        existing.category = agent.category.clone();
        existing.global_skills_dir = agent.global_skills_dir.clone();
        existing.project_skills_dir = agent.project_skills_dir.clone();
        if icon.is_some() {
            existing.icon = icon;
        }
        existing.enabled = agent.is_enabled;
        existing.supports_universal_agents_skills = supports_universal;
        return;
    }
    platforms.push(PlatformDefinition {
        id: agent.id.clone(),
        display_name: agent.display_name.clone(),
        category: agent.category.clone(),
        global_skills_dir: agent.global_skills_dir.clone(),
        project_skills_dir: agent.project_skills_dir.clone(),
        icon,
        enabled: agent.is_enabled,
        supports_universal_agents_skills: supports_universal,
    });
}

pub fn persist_platform_edit(agent: &Agent) -> Result<(), String> {
    if is_project_agent_id(&agent.id) {
        return Ok(());
    }
    let Some(dir) = platform_dir() else {
        return Ok(());
    };
    seed_platform_dir(&dir)?;
    let mut platforms = load_from_dir(&dir)?;
    upsert_definition(&mut platforms, agent);
    write_catalog(&dir, &platforms)
}

pub fn persist_platform_delete(agent_id: &str) -> Result<(), String> {
    if is_project_agent_id(agent_id) {
        return Ok(());
    }
    let Some(dir) = platform_dir() else {
        return Ok(());
    };
    if !catalog_path(&dir).exists() {
        return Ok(());
    }
    let mut platforms = load_from_dir(&dir)?;
    let removed = platforms
        .iter()
        .find(|platform| platform.id == agent_id)
        .cloned();
    platforms.retain(|platform| platform.id != agent_id);
    write_catalog(&dir, &platforms)?;
    if let Some(icon) = removed.and_then(|platform| platform.icon) {
        let path = icons_dir(&dir).join(icon);
        if path.exists() {
            let _ = fs::remove_file(path);
        }
    }
    Ok(())
}

fn icon_mime(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("svg") => "image/svg+xml",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    }
}

pub fn icon_src_for_agent(icon_name: Option<&str>) -> Option<String> {
    let file_name = icon_name.filter(|name| !name.trim().is_empty())?;
    let dir = platform_dir()?;
    let path = icons_dir(&dir).join(file_name);
    let bytes = fs::read(&path)
        .ok()
        .or_else(|| fs::read(dir.join(file_name)).ok())?;
    Some(format!(
        "data:{};base64,{}",
        icon_mime(&path),
        STANDARD.encode(bytes)
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn default_catalog_includes_claude_code_and_central() {
        let platforms = default_platform_definitions().unwrap();
        assert!(platforms
            .iter()
            .any(|platform| platform.id == "claude-code"));
        assert!(platforms.iter().any(|platform| platform.id == "central"));
        assert!(
            platforms
                .iter()
                .find(|platform| platform.id == "codex")
                .unwrap()
                .supports_universal_agents_skills
        );
    }

    #[test]
    fn seed_writes_catalog_and_icons_then_loads() {
        let dir = tempdir().unwrap();
        seed_platform_dir(dir.path()).unwrap();
        assert!(catalog_path(dir.path()).exists());
        assert!(icons_dir(dir.path()).join("claude-code.svg").exists());
        let loaded = load_from_dir(dir.path()).unwrap();
        assert_eq!(loaded.len(), default_platform_definitions().unwrap().len());
        assert!(loaded.iter().all(|platform| platform.enabled));
    }

    #[test]
    fn existing_catalog_is_not_overwritten_on_seed() {
        let dir = tempdir().unwrap();
        fs::create_dir_all(dir.path()).unwrap();
        let custom = PlatformDefinition {
            id: "only-custom".to_string(),
            display_name: "Only Custom".to_string(),
            category: "coding".to_string(),
            global_skills_dir: "~/.only-custom/skills".to_string(),
            project_skills_dir: None,
            icon: None,
            enabled: true,
            supports_universal_agents_skills: false,
        };
        write_catalog(dir.path(), &[custom]).unwrap();
        seed_platform_dir(dir.path()).unwrap();
        let loaded = load_from_dir(dir.path()).unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].id, "only-custom");
        assert!(!icons_dir(dir.path()).join("claude-code.svg").exists());
    }

    #[test]
    fn migrates_legacy_per_file_json_into_catalog() {
        let dir = tempdir().unwrap();
        fs::create_dir_all(dir.path()).unwrap();
        let custom = PlatformDefinition {
            id: "github-copilot".to_string(),
            display_name: "GitHub Copilot".to_string(),
            category: "coding".to_string(),
            global_skills_dir: "~/.copilot/skills".to_string(),
            project_skills_dir: None,
            icon: Some("github-copilot.svg".to_string()),
            enabled: false,
            supports_universal_agents_skills: false,
        };
        fs::write(
            dir.path().join("github-copilot.json"),
            serde_json::to_string_pretty(&custom).unwrap(),
        )
        .unwrap();
        fs::write(dir.path().join("github-copilot.svg"), b"<svg />").unwrap();
        seed_platform_dir(dir.path()).unwrap();
        assert!(catalog_path(dir.path()).exists());
        assert!(!dir.path().join("github-copilot.json").exists());
        assert!(icons_dir(dir.path()).join("github-copilot.svg").exists());
        let loaded = load_from_dir(dir.path()).unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].id, "github-copilot");
        assert!(!loaded[0].enabled);
    }
}
