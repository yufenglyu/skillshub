use crate::{db, AppState};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tauri::State;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderNote {
    pub id: String,
    pub notes: String,
    pub skill_ids: Vec<String>,
}
async fn ensure_schema(pool: &db::DbPool) -> Result<(), String> {
    sqlx::query("CREATE TABLE IF NOT EXISTS folder_notes (id TEXT PRIMARY KEY, notes TEXT NOT NULL, skill_ids TEXT NOT NULL)")
        .execute(pool).await.map_err(|e|e.to_string())?;
    Ok(())
}
pub async fn folder_notes(pool: &db::DbPool) -> Result<Vec<FolderNote>, String> {
    ensure_schema(pool).await?;
    sqlx::query("SELECT * FROM folder_notes")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|r| {
            Ok(FolderNote {
                id: r.get("id"),
                notes: r.get("notes"),
                skill_ids: serde_json::from_str(r.get("skill_ids")).map_err(|e| e.to_string())?,
            })
        })
        .collect()
}
pub async fn save_note(pool: &db::DbPool, note: &FolderNote) -> Result<(), String> {
    ensure_schema(pool).await?;
    sqlx::query("INSERT INTO folder_notes VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET notes=excluded.notes, skill_ids=excluded.skill_ids")
        .bind(&note.id).bind(&note.notes).bind(serde_json::to_string(&note.skill_ids).map_err(|e|e.to_string())?)
        .execute(pool).await.map_err(|e|e.to_string())?;
    Ok(())
}
#[tauri::command]
pub async fn get_folder_notes(state: State<'_, AppState>) -> Result<Vec<FolderNote>, String> {
    folder_notes(&state.db).await
}
#[tauri::command]
pub async fn save_folder_note(state: State<'_, AppState>, note: FolderNote) -> Result<(), String> {
    save_note(&state.db, &note).await
}

#[derive(Serialize)]
pub struct MetadataRow {
    id: String,
    notes: Option<String>,
    tags: Vec<String>,
}
#[tauri::command]
pub async fn count_skill_tag(state: State<'_, AppState>, tag: String) -> Result<usize, String> {
    let rows = sqlx::query("SELECT tags FROM skill_metadata")
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows
        .iter()
        .filter(|r| {
            serde_json::from_str::<Vec<String>>(r.get("tags"))
                .unwrap_or_default()
                .iter()
                .any(|t| t.to_lowercase() == tag.to_lowercase())
        })
        .count())
}
#[tauri::command]
pub async fn change_skill_tag(
    state: State<'_, AppState>,
    tag: String,
    skill_ids: Option<Vec<String>>,
    remove: bool,
) -> Result<Vec<MetadataRow>, String> {
    change_tag(&state.db, &tag, skill_ids, remove).await
}
async fn change_tag(
    pool: &db::DbPool,
    tag: &str,
    skill_ids: Option<Vec<String>>,
    remove: bool,
) -> Result<Vec<MetadataRow>, String> {
    let tag = tag.trim();
    if tag.is_empty() || tag.chars().count() > 100 {
        return Err("Invalid tag".into());
    }
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let rows = sqlx::query(
        "SELECT s.id, m.notes, m.tags FROM skills s LEFT JOIN skill_metadata m ON s.id=m.skill_id",
    )
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    let mut changed = Vec::new();
    for row in rows {
        let id: String = row.get("id");
        if skill_ids.as_ref().is_some_and(|ids| !ids.contains(&id)) {
            continue;
        }
        let mut tags: Vec<String> = row
            .get::<Option<String>, _>("tags")
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        let has = tags.iter().any(|t| t.to_lowercase() == tag.to_lowercase());
        if has != remove {
            continue;
        }
        if remove {
            tags.retain(|t| t.to_lowercase() != tag.to_lowercase());
        } else {
            tags.push(tag.into());
        }
        let notes: Option<String> = row.get("notes");
        sqlx::query("INSERT INTO skill_metadata (skill_id,notes,tags,updated_at) VALUES (?,?,?,?) ON CONFLICT(skill_id) DO UPDATE SET tags=excluded.tags,updated_at=excluded.updated_at")
            .bind(&id).bind(&notes).bind(serde_json::to_string(&tags).map_err(|e|e.to_string())?).bind(chrono::Utc::now().to_rfc3339())
            .execute(&mut *tx).await.map_err(|e|e.to_string())?;
        changed.push(MetadataRow { id, notes, tags });
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(changed)
}

#[tauri::command]
pub async fn rename_skill_tag(
    state: State<'_, AppState>,
    old_tag: String,
    new_tag: String,
    merge: bool,
) -> Result<Vec<MetadataRow>, String> {
    rename_tag(&state.db, &old_tag, &new_tag, merge).await
}
async fn rename_tag(
    pool: &db::DbPool,
    old: &str,
    new: &str,
    merge: bool,
) -> Result<Vec<MetadataRow>, String> {
    let new = new.trim();
    if new.is_empty() || new.chars().count() > 100 {
        return Err("Invalid tag".into());
    }
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let rows = sqlx::query("SELECT skill_id, notes, tags FROM skill_metadata")
        .fetch_all(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    let parsed = rows
        .into_iter()
        .map(|r| {
            Ok(MetadataRow {
                id: r.get("skill_id"),
                notes: r.get("notes"),
                tags: serde_json::from_str::<Vec<String>>(r.get("tags"))
                    .map_err(|e| e.to_string())?,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    if old.to_lowercase() != new.to_lowercase()
        && !merge
        && parsed.iter().any(|r| {
            r.tags
                .iter()
                .any(|t| t.to_lowercase() == new.to_lowercase())
        })
    {
        return Err("Tag already exists".into());
    }
    let mut changed = Vec::new();
    for mut row in parsed {
        if !row
            .tags
            .iter()
            .any(|t| t.to_lowercase() == old.to_lowercase())
        {
            continue;
        }
        let mut seen = std::collections::HashSet::new();
        row.tags = row
            .tags
            .into_iter()
            .map(|t| {
                if t.to_lowercase() == old.to_lowercase() || t.to_lowercase() == new.to_lowercase()
                {
                    new.to_string()
                } else {
                    t
                }
            })
            .filter(|t| seen.insert(t.to_lowercase()))
            .collect();
        sqlx::query(
            "UPDATE skill_metadata SET tags=?, updated_at=datetime('now') WHERE skill_id=?",
        )
        .bind(serde_json::to_string(&row.tags).map_err(|e| e.to_string())?)
        .bind(&row.id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        changed.push(row);
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(changed)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn rename_requires_merge_confirmation_and_preserves_notes() {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::query("CREATE TABLE skill_metadata (skill_id TEXT PRIMARY KEY, notes TEXT, tags TEXT, updated_at TEXT)").execute(&pool).await.unwrap();
        for (id, tags) in [
            ("one", vec!["Old", "Keep"]),
            ("two", vec!["Old", "New"]),
            ("three", vec!["Keep"]),
        ] {
            sqlx::query("INSERT INTO skill_metadata VALUES (?, 'memo', ?, '')")
                .bind(id)
                .bind(serde_json::to_string(&tags).unwrap())
                .execute(&pool)
                .await
                .unwrap();
        }
        assert!(rename_tag(&pool, "Old", "New", false).await.is_err());
        let rows = rename_tag(&pool, "old", " New ", true).await.unwrap();
        assert_eq!(rows.len(), 2);
        assert!(rows.iter().all(
            |row| row.notes.as_deref() == Some("memo") && !row.tags.iter().any(|t| t == "Old")
        ));
        assert_eq!(
            rows.iter().find(|row| row.id == "two").unwrap().tags,
            vec!["New"]
        );
        assert!(rename_tag(&pool, "New", " ", false).await.is_err());
        let untouched: String =
            sqlx::query_scalar("SELECT tags FROM skill_metadata WHERE skill_id='three'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(untouched, "[\"Keep\"]");
    }

    #[tokio::test]
    async fn tag_changes_preserve_notes_and_unselected_skills() {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::query("CREATE TABLE skills (id TEXT PRIMARY KEY)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("CREATE TABLE skill_metadata (skill_id TEXT PRIMARY KEY, notes TEXT, tags TEXT, updated_at TEXT)").execute(&pool).await.unwrap();
        for id in ["a", "b", "c"] {
            sqlx::query("INSERT INTO skills VALUES (?)")
                .bind(id)
                .execute(&pool)
                .await
                .unwrap();
        }
        for (id, tags) in [("a", vec!["A", "B"]), ("b", vec!["B"]), ("c", vec!["A"])] {
            sqlx::query("INSERT INTO skill_metadata VALUES (?, 'memo', ?, '')")
                .bind(id)
                .bind(serde_json::to_string(&tags).unwrap())
                .execute(&pool)
                .await
                .unwrap();
        }
        let ids = Some(vec!["a".into(), "b".into()]);
        let added = change_tag(&pool, "A", ids.clone(), false).await.unwrap();
        assert_eq!(added.len(), 1);
        assert_eq!(added[0].id, "b");
        assert_eq!(added[0].notes.as_deref(), Some("memo"));
        assert_eq!(change_tag(&pool, "A", ids, true).await.unwrap().len(), 2);
        let remaining = change_tag(&pool, "A", None, true).await.unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, "c");
    }
    #[tokio::test]
    async fn folder_notes_roundtrip_and_replace_without_absolute_paths() {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
        let mut note = FolderNote {
            id: "stable".into(),
            notes: "memo".into(),
            skill_ids: vec!["member".into()],
        };
        save_note(&pool, &note).await.unwrap();
        note.notes = "edited".into();
        save_note(&pool, &note).await.unwrap();
        let saved = folder_notes(&pool).await.unwrap();
        assert_eq!(saved.len(), 1);
        assert_eq!(saved[0].notes, "edited");
        assert_eq!(saved[0].skill_ids, vec!["member"]);
    }
}
