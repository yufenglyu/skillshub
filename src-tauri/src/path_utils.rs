use std::ffi::OsString;
use std::path::{Path, PathBuf};

fn resolve_home_dir_from_env_vars(
    home: Option<OsString>,
    userprofile: Option<OsString>,
    homedrive: Option<OsString>,
    homepath: Option<OsString>,
) -> PathBuf {
    if let Some(home) = home.filter(|value| !value.is_empty()) {
        return PathBuf::from(home);
    }

    if let Some(userprofile) = userprofile.filter(|value| !value.is_empty()) {
        return PathBuf::from(userprofile);
    }

    if let (Some(homedrive), Some(homepath)) = (homedrive, homepath) {
        if !homedrive.is_empty() && !homepath.is_empty() {
            let combined = format!(
                "{}{}",
                homedrive.to_string_lossy(),
                homepath.to_string_lossy()
            );
            return PathBuf::from(combined);
        }
    }

    std::env::temp_dir()
}

pub fn resolve_home_dir() -> PathBuf {
    resolve_home_dir_from_env_vars(
        std::env::var_os("HOME"),
        std::env::var_os("USERPROFILE"),
        std::env::var_os("HOMEDRIVE"),
        std::env::var_os("HOMEPATH"),
    )
}

pub fn default_app_data_dir() -> PathBuf {
    resolve_home_dir().join(".skillshub")
}

pub fn app_data_dir() -> PathBuf {
    let exe_path = std::env::current_exe().ok();
    let exe_dir = exe_path.as_deref().and_then(|path| path.parent());
    resolve_app_data_dir_from(exe_dir, &resolve_home_dir())
}

fn read_dir_pointer(file: &Path, home_dir: &Path) -> Option<PathBuf> {
    let contents = std::fs::read_to_string(file).ok()?;
    let trimmed = contents.trim();
    if trimmed.is_empty() {
        return None;
    }
    normalize_app_data_dir_with_home(trimmed, home_dir).ok()
}

pub fn resolve_app_data_dir_from(exe_dir: Option<&Path>, home_dir: &Path) -> PathBuf {
    if let Some(exe_dir) = exe_dir {
        if let Some(path) = read_dir_pointer(&exe_dir.join("skillshub-config-path"), home_dir) {
            return path;
        }
        let portable = exe_dir.join(".skillshub");
        if portable.is_dir() {
            return portable;
        }
    }
    if let Some(path) = read_dir_pointer(&home_dir.join(".skillshub-config-path"), home_dir) {
        return path;
    }
    home_dir.join(".skillshub")
}

pub fn normalize_app_data_dir_with_home(path: &str, home_dir: &Path) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Config directory cannot be empty".to_string());
    }
    let expanded = expand_home_path_with_home(trimmed, home_dir);
    if expanded.file_name().and_then(|name| name.to_str()) == Some(".skillshub") {
        Ok(expanded)
    } else {
        Ok(expanded.join(".skillshub"))
    }
}

pub fn normalize_app_data_dir(path: &str) -> Result<PathBuf, String> {
    normalize_app_data_dir_with_home(path, &resolve_home_dir())
}

pub fn default_database_path() -> PathBuf {
    app_data_dir().join("db.sqlite")
}

pub fn resolve_database_path() -> PathBuf {
    app_data_dir().join("db.sqlite")
}

fn auto_app_data_dir_without_pointer(exe_dir: Option<&Path>, home_dir: &Path) -> PathBuf {
    if let Some(exe_dir) = exe_dir {
        let portable = exe_dir.join(".skillshub");
        if portable.is_dir() {
            return portable;
        }
    }
    home_dir.join(".skillshub")
}

fn remove_pointer_file(file: &Path) -> Result<(), String> {
    if file.exists() {
        std::fs::remove_file(file).map_err(|e| {
            format!("Failed to clear config path override: {}", e)
        })?;
    }
    Ok(())
}

pub fn write_app_data_dir_override_with(
    path: &Path,
    exe_dir: Option<&Path>,
    home_dir: &Path,
) -> Result<(), String> {
    let auto_path = auto_app_data_dir_without_pointer(exe_dir, home_dir);
    let home_pointer = home_dir.join(".skillshub-config-path");
    let exe_pointer = exe_dir.map(|dir| dir.join("skillshub-config-path"));
    if path == auto_path {
        if let Some(pointer) = &exe_pointer {
            remove_pointer_file(pointer)?;
        }
        return remove_pointer_file(&home_pointer);
    }

    let serialized = path_to_string(path);
    std::fs::write(&home_pointer, &serialized).map_err(|e| {
        format!("Failed to save config path: {}", e)
    })?;
    if let Some(pointer) = exe_pointer {
        let _ = std::fs::write(pointer, &serialized);
    }
    Ok(())
}

pub fn write_app_data_dir_override(path: &Path) -> Result<(), String> {
    let exe_path = std::env::current_exe().ok();
    let exe_dir = exe_path.as_deref().and_then(|path| path.parent());
    write_app_data_dir_override_with(path, exe_dir, &resolve_home_dir())
}

pub fn sqlite_sidecar_paths(db_path: &Path) -> Vec<PathBuf> {
    let file_name = db_path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "db.sqlite".to_string());
    let parent = db_path.parent().unwrap_or(Path::new("."));
    vec![
        db_path.to_path_buf(),
        parent.join(format!("{file_name}-wal")),
        parent.join(format!("{file_name}-shm")),
    ]
}

pub fn copy_sqlite_database(from: &Path, to: &Path) -> Result<(), String> {
    if from == to {
        return Ok(());
    }
    if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            format!("Failed to create database directory: {}", e)
        })?;
    }
    for (source, dest) in sqlite_sidecar_paths(from)
        .into_iter()
        .zip(sqlite_sidecar_paths(to))
    {
        if !source.exists() {
            continue;
        }
        std::fs::copy(&source, &dest).map_err(|e| {
            format!(
                "Failed to copy database file '{}': {}",
                source.display(),
                e
            )
        })?;
    }
    Ok(())
}

pub fn copy_app_data_dir(from: &Path, to: &Path) -> Result<(), String> {
    if from == to {
        return Ok(());
    }
    if to.starts_with(from) {
        return Err(
            "Config directory cannot be inside the current config directory".to_string(),
        );
    }
    copy_app_data_dir_recursive(from, to)
}

fn copy_app_data_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|e| {
        format!("Failed to create config directory '{}': {}", dst.display(), e)
    })?;
    for entry in std::fs::read_dir(src).map_err(|e| {
        format!("Failed to read config directory '{}': {}", src.display(), e)
    })? {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let name = entry.file_name();
        if name == "database-path" {
            continue;
        }
        let src_path = entry.path();
        let dst_path = dst.join(&name);
        let file_type = entry
            .file_type()
            .map_err(|e| format!("Failed to determine file type: {}", e))?;
        if file_type.is_dir() {
            copy_app_data_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path).map_err(|e| {
                format!(
                    "Failed to copy '{}' -> '{}': {}",
                    src_path.display(),
                    dst_path.display(),
                    e
                )
            })?;
        }
    }
    Ok(())
}

pub fn legacy_app_data_dir() -> PathBuf {
    resolve_home_dir().join(".skillsmanage")
}

pub fn central_skills_dir() -> PathBuf {
    resolve_home_dir().join(".agents").join("skills")
}

fn expand_home_path_with_home(path: &str, home_dir: &Path) -> PathBuf {
    let trimmed = path.trim();
    if trimmed == "~" {
        return home_dir.to_path_buf();
    }

    if let Some(rest) = trimmed
        .strip_prefix("~/")
        .or_else(|| trimmed.strip_prefix("~\\"))
    {
        return home_dir.join(rest);
    }

    PathBuf::from(trimmed)
}

pub fn expand_home_path(path: &str) -> PathBuf {
    expand_home_path_with_home(path, &resolve_home_dir())
}

pub fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(windows)]
pub fn remove_symlink_path(path: &Path) -> Result<(), String> {
    match std::fs::remove_dir(path) {
        Ok(()) => Ok(()),
        Err(dir_error) => match std::fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(file_error) => Err(format!(
                "directory symlink removal failed: {}; file symlink removal failed: {}",
                dir_error, file_error
            )),
        },
    }
}

#[cfg(not(windows))]
pub fn remove_symlink_path(path: &Path) -> Result<(), String> {
    std::fs::remove_file(path).map_err(|e| e.to_string())
}

pub fn sanitize_path_segment(value: &str) -> String {
    let segment = value
        .trim()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches(['-', '.', ' '])
        .to_string();

    if segment.is_empty() {
        "unknown".to_string()
    } else {
        segment
    }
}

pub fn source_grouped_skill_dir(
    central_root: &Path,
    source_author: Option<&str>,
    source_repo: Option<&str>,
    fallback_group: Option<&str>,
    skill_id: &str,
) -> PathBuf {
    let (author, repo) = match source_repo.and_then(|repo| repo.split_once('/')) {
        Some((author, repo)) => (author, repo),
        None => (
            source_author.unwrap_or("remote-source"),
            source_repo.or(fallback_group).unwrap_or("imported-skills"),
        ),
    };

    central_root
        .join(sanitize_path_segment(author))
        .join(sanitize_path_segment(repo))
        .join(sanitize_path_segment(skill_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_home_dir_prefers_home() {
        let resolved = resolve_home_dir_from_env_vars(
            Some(OsString::from("/tmp/home")),
            Some(OsString::from("/tmp/profile")),
            Some(OsString::from("C:")),
            Some(OsString::from("\\Users\\fallback")),
        );
        assert_eq!(resolved, PathBuf::from("/tmp/home"));
    }

    #[test]
    fn resolve_home_dir_falls_back_to_userprofile() {
        let resolved = resolve_home_dir_from_env_vars(
            None,
            Some(OsString::from("C:\\Users\\alice")),
            None,
            None,
        );
        assert_eq!(resolved, PathBuf::from("C:\\Users\\alice"));
    }

    #[test]
    fn resolve_home_dir_falls_back_to_home_drive_and_path() {
        let resolved = resolve_home_dir_from_env_vars(
            None,
            None,
            Some(OsString::from("C:")),
            Some(OsString::from("\\Users\\bob")),
        );
        assert_eq!(resolved, PathBuf::from("C:\\Users\\bob"));
    }

    #[test]
    fn expand_home_path_expands_unix_style_tilde() {
        let expanded = expand_home_path_with_home("~/.claude/skills", Path::new("/tmp/home"));
        assert_eq!(expanded, PathBuf::from("/tmp/home/.claude/skills"));
    }

    #[test]
    fn expand_home_path_expands_windows_style_tilde() {
        let expanded =
            expand_home_path_with_home("~\\.claude\\skills", Path::new("C:\\Users\\alice"));
        assert_eq!(expanded, PathBuf::from("C:\\Users\\alice/.claude\\skills"));
    }

    #[test]
    fn expand_home_path_leaves_absolute_paths_unchanged() {
        let expanded =
            expand_home_path_with_home("/opt/skills/custom", Path::new("/tmp/ignored-home"));
        assert_eq!(expanded, PathBuf::from("/opt/skills/custom"));
    }

    #[test]
    fn source_grouped_skill_dir_uses_author_repo_and_skill_id() {
        let path = source_grouped_skill_dir(
            Path::new("/central"),
            Some("openai"),
            Some("openai/skills"),
            None,
            "brand-guidelines",
        );
        assert_eq!(
            path,
            PathBuf::from("/central")
                .join("openai")
                .join("skills")
                .join("brand-guidelines")
        );
    }

    #[test]
    fn normalize_app_data_dir_appends_skillshub_folder() {
        let path = normalize_app_data_dir_with_home("~/data", Path::new("/tmp/home"))
            .expect("path");
        assert_eq!(path, PathBuf::from("/tmp/home/data/.skillshub"));
    }

    #[test]
    fn normalize_app_data_dir_keeps_skillshub_folder() {
        let path = normalize_app_data_dir_with_home(
            "~/custom/.skillshub",
            Path::new("/tmp/home"),
        )
        .expect("path");
        assert_eq!(path, PathBuf::from("/tmp/home/custom/.skillshub"));
    }

    #[test]
    fn resolve_app_data_dir_uses_portable_folder_next_to_exe() {
        let dir = tempfile::tempdir().expect("tempdir");
        let exe_dir = dir.path().join("app");
        let portable = exe_dir.join(".skillshub");
        std::fs::create_dir_all(&portable).expect("portable");
        let resolved = resolve_app_data_dir_from(Some(&exe_dir), Path::new("/tmp/home"));
        assert_eq!(resolved, portable);
    }

    #[test]
    fn resolve_app_data_dir_uses_exe_pointer_before_portable_folder() {
        let dir = tempfile::tempdir().expect("tempdir");
        let exe_dir = dir.path().join("app");
        let portable = exe_dir.join(".skillshub");
        let custom = dir.path().join("custom").join(".skillshub");
        std::fs::create_dir_all(&portable).expect("portable");
        std::fs::write(exe_dir.join("skillshub-config-path"), custom.to_str().unwrap())
            .expect("pointer");
        let resolved = resolve_app_data_dir_from(Some(&exe_dir), Path::new("/tmp/home"));
        assert_eq!(resolved, custom);
    }

    #[test]
    fn resolve_app_data_dir_uses_home_pointer() {
        let dir = tempfile::tempdir().expect("tempdir");
        let home = dir.path().join("home");
        std::fs::create_dir_all(&home).expect("home");
        std::fs::write(home.join(".skillshub-config-path"), "D:/data/.skillshub")
            .expect("pointer");
        let resolved = resolve_app_data_dir_from(None, &home);
        assert_eq!(resolved, PathBuf::from("D:/data/.skillshub"));
    }

    #[test]
    fn copy_sqlite_database_copies_wal_sidecars() {
        let dir = tempfile::tempdir().expect("tempdir");
        let from = dir.path().join("from").join("db.sqlite");
        let to = dir.path().join("to").join("custom.sqlite");
        std::fs::create_dir_all(from.parent().unwrap()).expect("from dir");
        std::fs::write(&from, "main-db").expect("db");
        std::fs::write(dir.path().join("from").join("db.sqlite-wal"), "wal").expect("wal");
        copy_sqlite_database(&from, &to).expect("copy");
        assert_eq!(std::fs::read_to_string(&to).unwrap(), "main-db");
        assert_eq!(
            std::fs::read_to_string(dir.path().join("to").join("custom.sqlite-wal")).unwrap(),
            "wal"
        );
    }

    #[test]
    fn copy_app_data_dir_copies_config_files_and_skips_legacy_database_path() {
        let dir = tempfile::tempdir().expect("tempdir");
        let from = dir.path().join("from").join(".skillshub");
        let to = dir.path().join("to").join(".skillshub");
        std::fs::create_dir_all(from.join("library")).expect("from dir");
        std::fs::write(from.join("db.sqlite"), "main-db").expect("db");
        std::fs::write(from.join("database-path"), "stale").expect("legacy");
        std::fs::write(from.join("library").join("skill.md"), "skill").expect("library");
        copy_app_data_dir(&from, &to).expect("copy");
        assert_eq!(std::fs::read_to_string(to.join("db.sqlite")).unwrap(), "main-db");
        assert_eq!(
            std::fs::read_to_string(to.join("library").join("skill.md")).unwrap(),
            "skill"
        );
        assert!(!to.join("database-path").exists());
    }

    #[cfg(windows)]
    #[test]
    fn remove_symlink_path_removes_windows_directory_symlink_without_target() {
        let dir = tempfile::tempdir().expect("tempdir");
        let target = dir.path().join("target");
        let link = dir.path().join("link");
        std::fs::create_dir_all(&target).expect("target");
        std::fs::write(target.join("SKILL.md"), "---\nname: linked\n---\n").expect("skill");
        std::os::windows::fs::symlink_dir(&target, &link).expect("symlink");

        remove_symlink_path(&link).expect("remove symlink");

        assert!(std::fs::symlink_metadata(&link).is_err());
        assert!(target.join("SKILL.md").exists());
    }
}
