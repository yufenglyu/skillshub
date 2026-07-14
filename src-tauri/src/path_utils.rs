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

pub fn app_data_dir() -> PathBuf {
    resolve_home_dir().join(".skillshub")
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
