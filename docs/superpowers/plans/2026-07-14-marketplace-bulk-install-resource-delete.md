# Marketplace Bulk Install And Resource Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repository-level Marketplace bulk import into the Skill Resource Library and allow Skill Resource Library skills to be deleted safely.

**Architecture:** Marketplace bulk import stays entirely in the React page layer and reuses the existing single-skill import commands. Resource Library deletion adds a dedicated Tauri command that validates paths against the configured resource library root, then the Zustand store and page expose it through the existing `UnifiedSkillCard` delete action pattern.

**Tech Stack:** React 18, TypeScript, Zustand, Vitest, React Testing Library, Tauri v2, Rust, SQLx, SQLite.

## Global Constraints

- Marketplace "Install all" imports only into the Skill Resource Library; it does not install skills to platform directories.
- Resource Library deletion must validate against the configured Skill Resource Library directory, not the Central Skills directory.
- Linked resource skills require explicit cascade uninstall before deletion.
- Read-only agent visibility is reported in confirmation copy but is not directly removed as a managed installation.
- User-visible text must go through `src/i18n/locales/en.json` and `src/i18n/locales/zh.json`.
- Do not revert unrelated user changes or include untracked handoff files in commits.

---

## File Structure

- `src-tauri/src/commands/skills.rs`: add resource skill delete option/result structs, path validation helpers, `delete_resource_skill_impl`, Tauri command, and Rust tests.
- `src-tauri/src/db.rs`: add a reusable record cleanup function for deleting all local rows owned by a skill without Central-only assumptions.
- `src-tauri/src/lib.rs`: register the new Tauri command.
- `src/types/index.ts`: add `DeleteResourceSkillOptions` and `DeleteResourceSkillResult` frontend types.
- `src/stores/resourceLibraryStore.ts`: add `deleteResourceSkill`, `deletingSkillId`, and desktop/browser behavior.
- `src/pages/ResourceLibraryView.tsx`: add delete action, linked-skill confirmation dialog, refresh behavior, and toasts.
- `src/pages/MarketplaceView.tsx`: add repo-level bulk install state, helper, and action bar button.
- `src/i18n/locales/en.json` and `src/i18n/locales/zh.json`: add labels and messages.
- `src/test/MarketplaceView.test.tsx`: add bulk install rendering and behavior coverage.
- `src/test/ResourceLibraryView.test.tsx`: create tests for Resource Library delete behavior.

---

### Task 1: Backend Resource Delete Command

**Files:**
- Modify: `src-tauri/src/db.rs`
- Modify: `src-tauri/src/commands/skills.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: existing `db::get_skill_by_id`, `db::get_skill_installations`, `db::get_skill_resource_library_dir`, and `commands::linker::uninstall_skill_from_agent_impl`.
- Produces: `delete_resource_skill(skill_id: String, options: Option<DeleteResourceSkillOptions>) -> Result<DeleteResourceSkillResult, String>`.

- [ ] **Step 1: Add failing backend tests**

Append tests in `src-tauri/src/commands/skills.rs` inside the existing `#[cfg(test)] mod tests` block:

```rust
#[tokio::test]
async fn test_delete_resource_skill_removes_files_and_related_rows() {
    let pool = setup_test_db().await;
    let tmp = tempfile::tempdir().unwrap();
    let resource_root = tmp.path().join("library");
    let skill_dir = resource_root.join("openai").join("skills").join("demo");
    std::fs::create_dir_all(&skill_dir).unwrap();
    std::fs::write(skill_dir.join("SKILL.md"), "---\nname: demo\n---\nDemo").unwrap();
    db::set_skill_resource_library_dir(&pool, resource_root.to_str().unwrap())
        .await
        .unwrap();
    let skill = make_skill_with_path(
        "demo",
        "Demo",
        skill_dir.join("SKILL.md").to_str().unwrap(),
        skill_dir.to_str().unwrap(),
        false,
    );
    db::upsert_skill(&pool, &skill).await.unwrap();
    db::upsert_skill_source(
        &pool,
        &db::SkillSource {
            skill_id: "demo".to_string(),
            source_type: "raw".to_string(),
            source_url: Some("https://example.com/demo/SKILL.md".to_string()),
            source_author: Some("openai".to_string()),
            source_repo: Some("openai/skills".to_string()),
            source_path: Some("skills/demo/SKILL.md".to_string()),
            updated_at: "2026-07-14T00:00:00Z".to_string(),
        },
    )
    .await
    .unwrap();

    let result = delete_resource_skill_impl(
        &pool,
        "demo",
        DeleteResourceSkillOptions {
            cascade_uninstall: false,
        },
    )
    .await
    .unwrap();

    assert_eq!(result.skill_id, "demo");
    assert!(!skill_dir.exists());
    assert!(db::get_skill_by_id(&pool, "demo").await.unwrap().is_none());
    assert!(db::get_skill_sources(&pool, "demo").await.unwrap().is_empty());
}

#[tokio::test]
async fn test_delete_resource_skill_refuses_linked_without_cascade() {
    let pool = setup_test_db().await;
    let tmp = tempfile::tempdir().unwrap();
    let resource_root = tmp.path().join("library");
    let skill_dir = resource_root.join("demo");
    std::fs::create_dir_all(&skill_dir).unwrap();
    std::fs::write(skill_dir.join("SKILL.md"), "---\nname: demo\n---\nDemo").unwrap();
    db::set_skill_resource_library_dir(&pool, resource_root.to_str().unwrap())
        .await
        .unwrap();
    let skill = make_skill_with_path(
        "demo",
        "Demo",
        skill_dir.join("SKILL.md").to_str().unwrap(),
        skill_dir.to_str().unwrap(),
        false,
    );
    db::upsert_skill(&pool, &skill).await.unwrap();
    db::upsert_skill_installation(
        &pool,
        &db::SkillInstallation {
            skill_id: "demo".to_string(),
            agent_id: "cursor".to_string(),
            installed_path: tmp.path().join("cursor").join("demo").to_string_lossy().into_owned(),
            link_type: "copy".to_string(),
            symlink_target: None,
            created_at: "2026-07-14T00:00:00Z".to_string(),
        },
    )
    .await
    .unwrap();

    let err = delete_resource_skill_impl(
        &pool,
        "demo",
        DeleteResourceSkillOptions {
            cascade_uninstall: false,
        },
    )
    .await
    .unwrap_err();

    assert!(err.contains("Skill is installed on agents"));
    assert!(skill_dir.exists());
}

#[tokio::test]
async fn test_delete_resource_skill_rejects_path_outside_resource_root() {
    let pool = setup_test_db().await;
    let tmp = tempfile::tempdir().unwrap();
    let resource_root = tmp.path().join("library");
    let outside_dir = tmp.path().join("outside").join("demo");
    std::fs::create_dir_all(&resource_root).unwrap();
    std::fs::create_dir_all(&outside_dir).unwrap();
    std::fs::write(outside_dir.join("SKILL.md"), "---\nname: demo\n---\nDemo").unwrap();
    db::set_skill_resource_library_dir(&pool, resource_root.to_str().unwrap())
        .await
        .unwrap();
    let skill = make_skill_with_path(
        "demo",
        "Demo",
        outside_dir.join("SKILL.md").to_str().unwrap(),
        outside_dir.to_str().unwrap(),
        false,
    );
    db::upsert_skill(&pool, &skill).await.unwrap();

    let err = delete_resource_skill_impl(
        &pool,
        "demo",
        DeleteResourceSkillOptions {
            cascade_uninstall: false,
        },
    )
    .await
    .unwrap_err();

    assert!(err.contains("outside Skill Resource Library"));
    assert!(outside_dir.exists());
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test commands::skills::tests::test_delete_resource_skill`

Expected: compile failure for missing `DeleteResourceSkillOptions`, `delete_resource_skill_impl`, and `make_skill_with_path` if the helper is not present.

- [ ] **Step 3: Add reusable DB cleanup**

In `src-tauri/src/db.rs`, add this function near `delete_central_skill_records`:

```rust
pub async fn delete_skill_owned_records(pool: &DbPool, skill_id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM skill_installations WHERE skill_id = ?")
        .bind(skill_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM skill_sources WHERE skill_id = ?")
        .bind(skill_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM skill_metadata WHERE skill_id = ?")
        .bind(skill_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM collection_skills WHERE skill_id = ?")
        .bind(skill_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM skills WHERE id = ?")
        .bind(skill_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
```

- [ ] **Step 4: Add resource delete structs and helpers**

In `src-tauri/src/commands/skills.rs`, add these structs beside the existing delete structs:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteResourceSkillOptions {
    pub cascade_uninstall: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteResourceSkillResult {
    pub skill_id: String,
    pub removed_canonical_path: String,
    pub uninstalled_agents: Vec<String>,
    pub skipped_read_only_agents: Vec<String>,
}
```

Add these helper functions near the central delete helpers:

```rust
fn resource_delete_dir(skill: &db::Skill) -> PathBuf {
    if let Some(canonical_path) = skill.canonical_path.as_deref() {
        return PathBuf::from(canonical_path);
    }
    PathBuf::from(&skill.file_path)
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from(&skill.file_path))
}

fn validate_resource_delete_target(target: &Path, resource_root: &Path) -> Result<PathBuf, String> {
    let canonical_target = target
        .canonicalize()
        .map_err(|e| format!("Failed to resolve resource skill path: {}", e))?;
    if !canonical_target.starts_with(resource_root) {
        return Err(format!(
            "Refusing to delete resource skill outside Skill Resource Library: {}",
            canonical_target.display()
        ));
    }
    Ok(canonical_target)
}

fn remove_resource_skill_dir(target: &Path) -> Result<(), String> {
    let metadata = std::fs::symlink_metadata(target)
        .map_err(|e| format!("Failed to inspect resource skill path: {}", e))?;
    if metadata.file_type().is_symlink() || metadata.is_file() {
        std::fs::remove_file(target)
            .map_err(|e| format!("Failed to remove resource skill symlink: {}", e))?;
    } else {
        std::fs::remove_dir_all(target)
            .map_err(|e| format!("Failed to remove resource skill directory: {}", e))?;
    }
    Ok(())
}
```

- [ ] **Step 5: Implement command**

Add this implementation beside `delete_central_skill_impl`:

```rust
pub async fn delete_resource_skill_impl(
    pool: &DbPool,
    skill_id: &str,
    options: DeleteResourceSkillOptions,
) -> Result<DeleteResourceSkillResult, String> {
    let skill = db::get_skill_by_id(pool, skill_id)
        .await?
        .ok_or_else(|| format!("Skill '{}' not found", skill_id))?;

    if skill.is_central {
        return Err(format!("Skill '{}' is central; use Central Skills deletion", skill_id));
    }

    let resource_root = db::get_skill_resource_library_dir(pool)
        .await?
        .canonicalize()
        .map_err(|e| format!("Failed to resolve Skill Resource Library root: {}", e))?;
    let delete_target = validate_resource_delete_target(&resource_delete_dir(&skill), &resource_root)?;

    let installations = db::get_skill_installations(pool, skill_id).await?;
    if !options.cascade_uninstall && !installations.is_empty() {
        let agents = installations
            .iter()
            .map(|installation| installation.agent_id.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        return Err(format!("Skill is installed on agents: {}", agents));
    }

    let skipped_read_only_agents = read_only_agent_ids_for_skill(pool, skill_id, false).await?;
    let mut uninstalled_agents = Vec::new();

    if options.cascade_uninstall {
        for installation in &installations {
            uninstall_skill_from_agent_impl(pool, skill_id, &installation.agent_id).await?;
            uninstalled_agents.push(installation.agent_id.clone());
        }
    }

    remove_resource_skill_dir(&delete_target)?;
    db::delete_skill_owned_records(pool, skill_id).await?;

    Ok(DeleteResourceSkillResult {
        skill_id: skill_id.to_string(),
        removed_canonical_path: delete_target.to_string_lossy().into_owned(),
        uninstalled_agents,
        skipped_read_only_agents,
    })
}

#[tauri::command]
pub async fn delete_resource_skill(
    state: State<'_, AppState>,
    skill_id: String,
    options: Option<DeleteResourceSkillOptions>,
) -> Result<DeleteResourceSkillResult, String> {
    delete_resource_skill_impl(
        &state.db,
        &skill_id,
        options.unwrap_or(DeleteResourceSkillOptions {
            cascade_uninstall: false,
        }),
    )
    .await
}
```

- [ ] **Step 6: Register command**

In `src-tauri/src/lib.rs`, add `commands::skills::delete_resource_skill` to the `tauri::generate_handler!` list near `delete_central_skill`.

- [ ] **Step 7: Add or adjust test helper**

If `make_skill_with_path` does not exist in `src-tauri/src/commands/skills.rs`, add this helper inside the test module:

```rust
fn make_skill_with_path(
    id: &str,
    name: &str,
    file_path: &str,
    canonical_path: &str,
    is_central: bool,
) -> db::Skill {
    db::Skill {
        id: id.to_string(),
        name: name.to_string(),
        description: Some(format!("{} description", name)),
        file_path: file_path.to_string(),
        canonical_path: Some(canonical_path.to_string()),
        is_central,
        source: None,
        content: None,
        scanned_at: "2026-07-14T00:00:00Z".to_string(),
    }
}
```

- [ ] **Step 8: Run backend tests**

Run: `cd src-tauri && cargo test commands::skills::tests::test_delete_resource_skill`

Expected: all resource delete tests pass.

- [ ] **Step 9: Commit backend resource delete**

Run:

```bash
git add src-tauri/src/db.rs src-tauri/src/commands/skills.rs src-tauri/src/lib.rs
git commit -m "feat: delete resource library skills safely"
```

---

### Task 2: Resource Library Store And UI Delete

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/stores/resourceLibraryStore.ts`
- Modify: `src/pages/ResourceLibraryView.tsx`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/zh.json`
- Create: `src/test/ResourceLibraryView.test.tsx`

**Interfaces:**
- Consumes: `delete_resource_skill(skillId, options)` from Task 1.
- Produces: `useResourceLibraryStore((s) => s.deleteResourceSkill)` and visible delete controls in Resource Library cards.

- [ ] **Step 1: Write failing Resource Library UI tests**

Create `src/test/ResourceLibraryView.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AgentWithStatus, SkillWithLinks } from "@/types";

const mockLoadResourceLibrary = vi.fn();
const mockInstallSkill = vi.fn();
const mockAddToCentral = vi.fn();
const mockTogglePlatformLink = vi.fn();
const mockUpdateSourceBackedSkills = vi.fn();
const mockUpdateSourceBackedSkill = vi.fn();
const mockDeleteResourceSkill = vi.fn();
const mockRefreshCounts = vi.fn();
const mockLoadCentralSkills = vi.fn();
const mockGetSkillsByAgent = vi.fn();

const agents: AgentWithStatus[] = [
  {
    id: "cursor",
    display_name: "Cursor",
    category: "coding",
    global_skills_dir: "~/.cursor/skills/",
    is_detected: true,
    is_builtin: true,
    is_enabled: true,
  },
];

const skills: SkillWithLinks[] = [
  {
    id: "resource-demo",
    name: "resource-demo",
    description: "Resource demo",
    file_path: "~/.skillshub/library/example/resource-demo/SKILL.md",
    canonical_path: "~/.skillshub/library/example/resource-demo",
    is_central: false,
    scanned_at: "2026-07-14T00:00:00Z",
    linked_agents: ["cursor"],
    read_only_agents: [],
  },
];

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/stores/resourceLibraryStore", () => ({
  useResourceLibraryStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      skills,
      agents,
      resourceLibraryDir: "~/.skillshub/library",
      isLoading: false,
      isUpdatingSources: false,
      togglingAgentId: null,
      deletingSkillId: null,
      loadResourceLibrary: mockLoadResourceLibrary,
      installSkill: mockInstallSkill,
      addToCentral: mockAddToCentral,
      togglePlatformLink: mockTogglePlatformLink,
      updateSourceBackedSkills: mockUpdateSourceBackedSkills,
      updateSourceBackedSkill: mockUpdateSourceBackedSkill,
      deleteResourceSkill: mockDeleteResourceSkill,
    }),
}));

vi.mock("@/stores/platformStore", () => ({
  usePlatformStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ refreshCounts: mockRefreshCounts }),
}));

vi.mock("@/stores/centralSkillsStore", () => ({
  useCentralSkillsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ loadCentralSkills: mockLoadCentralSkills }),
}));

vi.mock("@/stores/skillStore", () => ({
  useSkillStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ skillsByAgent: {}, getSkillsByAgent: mockGetSkillsByAgent }),
}));

vi.mock("@/stores/marketplaceStore", () => ({
  useMarketplaceStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      githubImport: {
        isPreviewLoading: false,
        isImporting: false,
        preview: null,
        importResult: null,
        previewedRepoUrl: null,
        error: null,
      },
      previewGitHubRepoImport: vi.fn(),
      importGitHubRepoSkills: vi.fn(),
      resetGitHubImport: vi.fn(),
    }),
}));

import { ResourceLibraryView } from "@/pages/ResourceLibraryView";

describe("ResourceLibraryView delete", () => {
  beforeEach(() => {
    mockLoadResourceLibrary.mockReset();
    mockInstallSkill.mockReset();
    mockAddToCentral.mockReset();
    mockTogglePlatformLink.mockReset();
    mockUpdateSourceBackedSkills.mockReset();
    mockUpdateSourceBackedSkill.mockReset();
    mockDeleteResourceSkill.mockReset().mockResolvedValue({
      skillId: "resource-demo",
      removedCanonicalPath: "~/.skillshub/library/example/resource-demo",
      uninstalledAgents: ["cursor"],
      skippedReadOnlyAgents: [],
    });
    mockRefreshCounts.mockReset();
    mockLoadCentralSkills.mockReset();
    mockGetSkillsByAgent.mockReset();
  });

  it("opens a cascade confirmation for installed resource skills", async () => {
    render(<ResourceLibraryView />);

    fireEvent.click(screen.getByRole("button", { name: /Delete resource-demo from Skill Resource Library|从技能资源库删除 resource-demo/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Cursor/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Uninstall and delete|卸载并删除/i }));

    await waitFor(() => {
      expect(mockDeleteResourceSkill).toHaveBeenCalledWith("resource-demo", {
        cascadeUninstall: true,
      });
    });
    expect(mockRefreshCounts).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/test/ResourceLibraryView.test.tsx`

Expected: failure because `deleteResourceSkill` and delete labels are not implemented.

- [ ] **Step 3: Add frontend types**

In `src/types/index.ts`, add after `DeleteCentralSkillResult`:

```ts
export interface DeleteResourceSkillOptions {
  cascadeUninstall: boolean;
}

export interface DeleteResourceSkillResult {
  skillId: string;
  removedCanonicalPath: string;
  uninstalledAgents: string[];
  skippedReadOnlyAgents: string[];
}
```

- [ ] **Step 4: Add store state and action**

In `src/stores/resourceLibraryStore.ts`, update imports and interface:

```ts
import {
  AgentWithStatus,
  BatchInstallResult,
  DeleteResourceSkillOptions,
  DeleteResourceSkillResult,
  SkillWithLinks,
} from "@/types";
```

Add to `ResourceLibraryState`:

```ts
  deletingSkillId: string | null;
  deleteResourceSkill: (
    skillId: string,
    options: DeleteResourceSkillOptions
  ) => Promise<DeleteResourceSkillResult>;
```

Add initial state:

```ts
  deletingSkillId: null,
```

Add action before `addToCentral`:

```ts
  deleteResourceSkill: async (skillId, options) => {
    set({ deletingSkillId: skillId, error: null });
    if (!isTauriRuntime()) {
      const result: DeleteResourceSkillResult = {
        skillId,
        removedCanonicalPath: `~/.skillshub/library/${skillId}`,
        uninstalledAgents: [],
        skippedReadOnlyAgents: [],
      };
      set((state) => ({
        skills: state.skills.filter((skill) => skill.id !== skillId),
        deletingSkillId: null,
      }));
      return result;
    }

    try {
      const result = await invoke<DeleteResourceSkillResult>("delete_resource_skill", {
        skillId,
        options,
      });
      const skills = await invoke<SkillWithLinks[]>("get_resource_library_skills");
      set({ skills: skills ?? [], deletingSkillId: null });
      return result;
    } catch (err) {
      set({ error: String(err), deletingSkillId: null });
      throw err;
    }
  },
```

- [ ] **Step 5: Add i18n keys**

In `src/i18n/locales/en.json`, under `"resource"`, add:

```json
"deleteLabel": "Delete {{name}} from Skill Resource Library",
"deleteConfirmTitle": "Delete {{name}}?",
"deleteLinkedWarning": "This skill is installed on: {{platforms}}. Deleting it from the Skill Resource Library will also uninstall those managed platform links or copies.",
"deleteCascadeLabel": "Uninstall and delete",
"deleteSuccess": "Deleted {{name}} from the Skill Resource Library.",
"deleteError": "Delete failed: {{error}}"
```

In `src/i18n/locales/zh.json`, under `"resource"`, add:

```json
"deleteLabel": "从技能资源库删除 {{name}}",
"deleteConfirmTitle": "删除 {{name}}？",
"deleteLinkedWarning": "这个技能仍安装在以下平台：{{platforms}}。从技能资源库删除会同时卸载这些可管理的平台链接或副本。",
"deleteCascadeLabel": "卸载并删除",
"deleteSuccess": "已从技能资源库删除 {{name}}。",
"deleteError": "删除失败: {{error}}"
```

- [ ] **Step 6: Wire ResourceLibraryView delete**

In `src/pages/ResourceLibraryView.tsx`, add imports:

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
```

Read store state:

```tsx
  const deletingSkillId = useResourceLibraryStore((state) => state.deletingSkillId);
  const deleteResourceSkill = useResourceLibraryStore((state) => state.deleteResourceSkill);
```

Add state:

```tsx
  const [deleteTargetSkill, setDeleteTargetSkill] = useState<SkillWithLinks | null>(null);
```

Add helpers near `handleAddToCentral`:

```tsx
  function linkedAgentNames(skill: SkillWithLinks) {
    const affectedIds = new Set([
      ...skill.linked_agents,
      ...(skill.read_only_agents ?? []),
    ]);
    return agents
      .filter((agent) => affectedIds.has(agent.id))
      .map((agent) => agent.display_name);
  }

  async function handleDeleteResourceSkill(skill: SkillWithLinks, cascadeUninstall: boolean) {
    try {
      await deleteResourceSkill(skill.id, { cascadeUninstall });
      await Promise.all([
        refreshCounts(),
        loadCentralSkills(),
        ...skill.linked_agents.map((agentId) => getSkillsByAgent(agentId)),
      ]);
      toast.success(t("resource.deleteSuccess", { name: skill.name }));
      setDeleteTargetSkill(null);
    } catch (err) {
      toast.error(t("resource.deleteError", { error: String(err) }));
    }
  }

  function handleDeleteClick(skill: SkillWithLinks) {
    if (skill.linked_agents.length > 0 || (skill.read_only_agents?.length ?? 0) > 0) {
      setDeleteTargetSkill(skill);
      return;
    }
    void handleDeleteResourceSkill(skill, false);
  }
```

Pass delete props to `UnifiedSkillCard`:

```tsx
                      onDeleteFromCentral={() => handleDeleteClick(skill)}
                      deleteFromCentralLabel={t("resource.deleteLabel", { name: skill.name })}
                      deleteFromCentralRequiresDialog={
                        skill.linked_agents.length > 0 || (skill.read_only_agents?.length ?? 0) > 0
                      }
                      isLoading={updatingSkillId === skill.id || deletingSkillId === skill.id}
```

Add dialog before `GitHubRepoImportWizard`:

```tsx
      <Dialog
        open={!!deleteTargetSkill}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetSkill(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("resource.deleteConfirmTitle", { name: deleteTargetSkill?.name ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {deleteTargetSkill
                ? t("resource.deleteLinkedWarning", {
                    platforms: linkedAgentNames(deleteTargetSkill).join(", "),
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTargetSkill(null)}
              disabled={!!deleteTargetSkill && deletingSkillId === deleteTargetSkill.id}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTargetSkill) {
                  void handleDeleteResourceSkill(deleteTargetSkill, true);
                }
              }}
              disabled={!!deleteTargetSkill && deletingSkillId === deleteTargetSkill.id}
            >
              {t("resource.deleteCascadeLabel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 7: Run Resource Library tests**

Run: `pnpm test -- src/test/ResourceLibraryView.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit Resource Library delete UI**

Run:

```bash
git add src/types/index.ts src/stores/resourceLibraryStore.ts src/pages/ResourceLibraryView.tsx src/i18n/locales/en.json src/i18n/locales/zh.json src/test/ResourceLibraryView.test.tsx
git commit -m "feat: add resource library delete action"
```

---

### Task 3: Marketplace Official Repository Bulk Install

**Files:**
- Modify: `src/pages/MarketplaceView.tsx`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/zh.json`
- Modify: `src/test/MarketplaceView.test.tsx`

**Interfaces:**
- Consumes: existing `installSkill(skillId)` and `install_remote_skill_from_url` single-skill paths.
- Produces: a repo preview action button that installs every loaded `PreviewSkill` into the Skill Resource Library.

- [ ] **Step 1: Add failing Marketplace tests**

In `src/test/MarketplaceView.test.tsx`, add:

```tsx
  it("installs every preview skill from the expanded official repository", async () => {
    mockLoadPreviewSkills.mockResolvedValue([
      {
        id: "openai::skill-a",
        registry_id: "openai",
        name: "Skill A",
        description: "First",
        download_url: "https://example.com/a/SKILL.md",
        is_installed: false,
        synced_at: "2026-04-16T00:00:00Z",
      },
      {
        id: "openai::skill-b",
        registry_id: "openai",
        name: "Skill B",
        description: "Second",
        download_url: "https://example.com/b/SKILL.md",
        is_installed: false,
        synced_at: "2026-04-16T00:00:00Z",
      },
    ]);
    mockInstallSkill.mockResolvedValue(undefined);

    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Official Directory|官方源目录/i }));
    fireEvent.click(screen.getByRole("button", { name: /OpenAI/i }));
    fireEvent.click(screen.getByRole("button", { name: /Browse Skills|浏览 Skills/i }));
    await screen.findByText("Skill A");

    fireEvent.click(screen.getByRole("button", { name: /Install all|全部安装/i }));

    await waitFor(() => {
      expect(mockInstallSkill).toHaveBeenCalledWith("openai::skill-a");
      expect(mockInstallSkill).toHaveBeenCalledWith("openai::skill-b");
    });
    expect(mockRescan).toHaveBeenCalled();
    expect(mockLoadResourceLibrary).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/test/MarketplaceView.test.tsx`

Expected: failure because the "Install all" button is missing.

- [ ] **Step 3: Add i18n keys**

In `src/i18n/locales/en.json`, under `"marketplace"`, add:

```json
"installAll": "Install all",
"installAllSuccess": "Installed {{success}} skill(s) into the Skill Resource Library.",
"installAllPartial": "Installed {{success}} skill(s); {{failed}} failed.",
"installAllError": "Install all failed: {{error}}"
```

In `src/i18n/locales/zh.json`, under `"marketplace"`, add:

```json
"installAll": "全部安装",
"installAllSuccess": "已安装 {{success}} 个技能到技能资源库。",
"installAllPartial": "已安装 {{success}} 个技能，{{failed}} 个失败。",
"installAllError": "全部安装失败: {{error}}"
```

- [ ] **Step 4: Add Marketplace bulk state and helper**

In `src/pages/MarketplaceView.tsx`, add state beside `previewInstallingIds`:

```tsx
  const [bulkInstallingRepo, setBulkInstallingRepo] = useState<string | null>(null);
```

Add helper after `handleInstallPreviewSkill`:

```tsx
  async function installPreviewSkillSilently(skill: PreviewSkill) {
    if (skill.id.includes("::")) {
      await installSkill(skill.id);
      return;
    }
    await invoke("install_remote_skill_from_url", {
      name: skill.name,
      description: skill.description ?? null,
      downloadUrl: skill.downloadUrl,
      sourceLabel: selectedPublisher?.name ?? null,
    });
  }

  async function handleInstallAllPreviewSkills(repoFullName: string) {
    if (previewSkills.length === 0 || bulkInstallingRepo) return;

    setBulkInstallingRepo(repoFullName);
    setPreviewInstallingIds((current) => {
      const next = new Set(current);
      for (const skill of previewSkills) {
        next.add(skill.name);
      }
      return next;
    });

    const results = await Promise.allSettled(
      previewSkills.map((skill) => installPreviewSkillSilently(skill))
    );
    const success = results.filter((result) => result.status === "fulfilled").length;
    const failed = results.length - success;

    try {
      await Promise.all([rescan(), loadResourceLibrary()]);
      if (failed > 0) {
        toast.error(t("marketplace.installAllPartial", { success, failed }));
      } else {
        toast.success(t("marketplace.installAllSuccess", { success }));
      }
    } catch (err) {
      toast.error(t("marketplace.installAllError", { error: String(err) }));
    } finally {
      setPreviewInstallingIds((current) => {
        const next = new Set(current);
        for (const skill of previewSkills) {
          next.delete(skill.name);
        }
        return next;
      });
      setBulkInstallingRepo(null);
    }
  }
```

- [ ] **Step 5: Reuse helper for single install**

Replace the duplicated install body in `handleInstallPreviewSkill` with:

```tsx
    try {
      await installPreviewSkillSilently(skill);

      await Promise.all([rescan(), loadResourceLibrary()]);
```

- [ ] **Step 6: Render bulk button**

In the expanded preview action bar in `src/pages/MarketplaceView.tsx`, add this button before the refresh button:

```tsx
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleInstallAllPreviewSkills(repo.fullName);
                            }}
                            disabled={
                              isPreviewLoading ||
                              previewSkills.length === 0 ||
                              bulkInstallingRepo === repo.fullName
                            }
                            className="h-6 text-xs px-2"
                          >
                            {bulkInstallingRepo === repo.fullName ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <Download className="size-3" />
                            )}
                            <span>{t("marketplace.installAll")}</span>
                          </Button>
```

- [ ] **Step 7: Run Marketplace tests**

Run: `pnpm test -- src/test/MarketplaceView.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit Marketplace bulk install**

Run:

```bash
git add src/pages/MarketplaceView.tsx src/i18n/locales/en.json src/i18n/locales/zh.json src/test/MarketplaceView.test.tsx
git commit -m "feat: install all marketplace preview skills"
```

---

### Task 4: Integration Verification And Cleanup

**Files:**
- Verify only unless prior tasks reveal a formatting or type issue.

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: verified implementation ready for user review.

- [ ] **Step 1: Run focused frontend tests**

Run:

```bash
pnpm test -- src/test/MarketplaceView.test.tsx src/test/ResourceLibraryView.test.tsx src/test/UnifiedSkillCard.test.tsx
```

Expected: all selected tests pass.

- [ ] **Step 2: Run focused backend tests**

Run:

```bash
cd src-tauri && cargo test commands::skills::tests::test_delete_resource_skill
```

Expected: all selected Rust tests pass.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: typecheck exits with code 0.

- [ ] **Step 4: Run diff whitespace check**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 5: Inspect final diff**

Run:

```bash
git diff --stat HEAD
git status --short
```

Expected: only intended files changed, plus the pre-existing untracked `PROJECT_HANDOFF_SUMMARY.md` if it is still present.

- [ ] **Step 6: Commit final cleanup if needed**

If Step 5 shows verification-only fixes, run:

```bash
git add src-tauri/src/db.rs src-tauri/src/commands/skills.rs src-tauri/src/lib.rs src/types/index.ts src/stores/resourceLibraryStore.ts src/pages/ResourceLibraryView.tsx src/pages/MarketplaceView.tsx src/i18n/locales/en.json src/i18n/locales/zh.json src/test/MarketplaceView.test.tsx src/test/ResourceLibraryView.test.tsx
git commit -m "fix: polish marketplace and resource delete flows"
```

If Step 5 shows no cleanup changes, do not create an empty commit.
