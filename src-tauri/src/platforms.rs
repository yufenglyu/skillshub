use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

use crate::db::Agent;
#[cfg(not(test))]
use crate::path_utils::app_data_dir;
use crate::path_utils::{expand_home_path, path_to_string};

const DEFAULTS_JSON: &str = include_str!("../resources/default-platforms/defaults.json");
const LEGACY_OVERRIDES_FILE: &str = "builtin-agent-overrides.json";
const CATALOG_FILE_NAME: &str = "platform.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformDefinition {
    pub id: String,
    pub display_name: String,
    pub global_skills_dir: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_skills_dir: Option<String>,
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
    let path = catalog_path(dir);
    let content = serde_json::to_string_pretty(&PlatformCatalogFile {
        platforms: platforms.to_vec(),
    })
    .map_err(|e| format!("Failed to serialize platform catalog: {}", e))?;
    fs::write(&path, format!("{content}\n")).map_err(|e| {
        format!(
            "Failed to write platform catalog '{}': {}",
            path.display(),
            e
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
    write_catalog(dir, &platforms)
}

fn seed_platform_dir(dir: &Path) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("Failed to create platform directory: {}", e))?;
    migrate_legacy_per_file_layout(dir)?;
    if !load_from_dir(dir)?.is_empty() {
        return Ok(());
    }

    let platforms = apply_legacy_overrides(default_platform_definitions()?);
    write_catalog(dir, &platforms)
}

fn load_from_dir(dir: &Path) -> Result<Vec<PlatformDefinition>, String> {
    let path = catalog_path(dir);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path).map_err(|e| {
        format!(
            "Failed to read platform catalog '{}': {}",
            path.display(),
            e
        )
    })?;
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
            category: if definition.id == "central" {
                "central".to_string()
            } else {
                "platform".to_string()
            },
            global_skills_dir: portable_global_skills_dir(&definition.global_skills_dir),
            project_skills_dir: definition.project_skills_dir.clone(),
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
    let supports_universal = platforms
        .iter()
        .find(|platform| platform.id == agent.id)
        .map(|platform| platform.supports_universal_agents_skills)
        .unwrap_or_else(|| agent_supports_universal_agents_skills(&agent.id));
    if let Some(existing) = platforms
        .iter_mut()
        .find(|platform| platform.id == agent.id)
    {
        existing.display_name = agent.display_name.clone();
        existing.global_skills_dir = agent.global_skills_dir.clone();
        existing.project_skills_dir = agent.project_skills_dir.clone();
        existing.enabled = agent.is_enabled;
        existing.supports_universal_agents_skills = supports_universal;
        return;
    }
    platforms.push(PlatformDefinition {
        id: agent.id.clone(),
        display_name: agent.display_name.clone(),
        global_skills_dir: agent.global_skills_dir.clone(),
        project_skills_dir: agent.project_skills_dir.clone(),
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
    platforms.retain(|platform| platform.id != agent_id);
    write_catalog(&dir, &platforms)
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
    fn seed_writes_catalog_then_loads() {
        let dir = tempdir().unwrap();
        seed_platform_dir(dir.path()).unwrap();
        assert!(catalog_path(dir.path()).exists());
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
            global_skills_dir: "~/.only-custom/skills".to_string(),
            project_skills_dir: None,
            enabled: true,
            supports_universal_agents_skills: false,
        };
        write_catalog(dir.path(), &[custom]).unwrap();
        seed_platform_dir(dir.path()).unwrap();
        let loaded = load_from_dir(dir.path()).unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].id, "only-custom");
    }

    #[test]
    fn migrates_legacy_per_file_json_into_catalog() {
        let dir = tempdir().unwrap();
        fs::create_dir_all(dir.path()).unwrap();
        let custom = PlatformDefinition {
            id: "github-copilot".to_string(),
            display_name: "GitHub Copilot".to_string(),
            global_skills_dir: "~/.copilot/skills".to_string(),
            project_skills_dir: None,
            enabled: false,
            supports_universal_agents_skills: false,
        };
        fs::write(
            dir.path().join("github-copilot.json"),
            serde_json::to_string_pretty(&custom).unwrap(),
        )
        .unwrap();
        seed_platform_dir(dir.path()).unwrap();
        assert!(catalog_path(dir.path()).exists());
        assert!(!dir.path().join("github-copilot.json").exists());
        let loaded = load_from_dir(dir.path()).unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].id, "github-copilot");
        assert!(!loaded[0].enabled);
    }
}
