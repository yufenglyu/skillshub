# Main Browser Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a resizable sidebar and shared List/Card browser display modes with configurable columns across Skill Resource Library, Central Skills, Software Platforms, and Project Directories.

**Architecture:** Keep page-specific data loading in the existing page components, but move browser presentation into shared skill components. Organization mode remains the current All/Folders state; display mode is a new persisted List/Card preference rendered from the bottom status bar.

**Tech Stack:** React 18, TypeScript, Tailwind CSS 4, lucide-react, Zustand stores, React Testing Library, Vitest, Tauri IPC through existing stores only.

## Global Constraints

- Apply to Skill Resource Library, Central Skills, Software Platforms, and Project Directories.
- Collections and settings are out of scope.
- Sidebar default expanded width is about 280 px.
- Sidebar collapsed width remains about 56 px.
- Sidebar expanded width clamps to about 240-420 px.
- Store sidebar width, display mode, organization mode, and list column selection in localStorage, not SQLite.
- Display modes are List and Card.
- Organization modes are All and By folder.
- Name and Actions list columns are always visible and cannot be hidden.
- Do not add a rating data model in the first implementation.
- Existing card rendering continues through `UnifiedSkillCard`.
- All user-visible text must use i18n.
- Do not call Tauri `invoke()` directly from components when an existing store is responsible for that domain.

---

## File Structure

- Modify `src/components/layout/Sidebar.tsx`: replace fixed `w-56` expanded width with persisted resizable width.
- Create `src/hooks/useSidebarWidth.ts`: localStorage-backed width state with clamp and reset helpers.
- Create `src/hooks/useSkillDisplayMode.ts`: persisted List/Card preference.
- Create `src/hooks/useSkillTableColumns.ts`: persisted skill and folder table column preferences.
- Modify `src/hooks/useSkillListViewMode.ts`: keep organization mode storage but rename internally only if it does not churn public behavior.
- Modify `src/components/skill/SkillBrowserToolbar.tsx`: make the top toolbar show sorting and organization only.
- Modify `src/components/skill/SkillListModeToggle.tsx`: copy changes from "View" to "Organize" semantics, or replace usage with a renamed component while preserving behavior.
- Create `src/components/skill/SkillDisplayModeToggle.tsx`: bottom-right List/Card icon pair.
- Create `src/components/skill/SkillColumnSettings.tsx`: checkbox popover for configurable columns.
- Create `src/components/skill/SkillTableView.tsx`: compact skill table.
- Create `src/components/skill/SkillFolderTableView.tsx`: compact folder table.
- Modify `src/components/layout/AppStatusBar.tsx`: add an optional right-side slot for display controls using a lightweight global UI store or local portal event.
- Create `src/stores/browserUiStore.ts`: current browser display controls for the status bar, if AppStatusBar cannot receive props through the route outlet.
- Modify `src/pages/ResourceLibraryView.tsx`: render card/list/folder-card/folder-list combinations.
- Modify `src/pages/CentralSkillsView.tsx`: render card/list/folder-card/folder-list combinations.
- Modify `src/pages/PlatformView.tsx`: render card/list/folder-card/folder-list combinations for software platforms and project directories.
- Modify `src/i18n/locales/zh.json` and `src/i18n/locales/en.json`: add display mode, organization, table, and column settings labels.
- Add or modify tests under `src/test/`: focused tests for hooks/components and integration tests for each browser page.

---

### Task 1: Resizable Sidebar

**Files:**
- Create: `src/hooks/useSidebarWidth.ts`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/test/Sidebar.test.tsx`

**Interfaces:**
- Produces: `useSidebarWidth(): { width: number; minWidth: number; maxWidth: number; defaultWidth: number; setWidth(next: number): void; resetWidth(): void }`
- Consumes: existing `Sidebar` expanded/collapsed state.

- [ ] **Step 1: Write hook tests for clamp, persistence, and reset**

Add tests in `src/test/Sidebar.test.tsx` or a new `src/test/useSidebarWidth.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { useSidebarWidth } from "@/hooks/useSidebarWidth";

describe("useSidebarWidth", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts at the default expanded width", () => {
    const { result } = renderHook(() => useSidebarWidth());
    expect(result.current.width).toBe(280);
  });

  it("clamps saved width to the supported range", () => {
    const { result } = renderHook(() => useSidebarWidth());
    act(() => result.current.setWidth(999));
    expect(result.current.width).toBe(420);
    act(() => result.current.setWidth(100));
    expect(result.current.width).toBe(240);
  });

  it("resets to the default width", () => {
    const { result } = renderHook(() => useSidebarWidth());
    act(() => result.current.setWidth(360));
    act(() => result.current.resetWidth());
    expect(result.current.width).toBe(280);
  });
});
```

- [ ] **Step 2: Run the focused failing test**

Run: `pnpm test -- src/test/useSidebarWidth.test.tsx`

Expected before implementation: fail with missing `useSidebarWidth`.

- [ ] **Step 3: Implement `useSidebarWidth`**

Create `src/hooks/useSidebarWidth.ts`:

```ts
import { useCallback, useState } from "react";

const STORAGE_KEY = "skills-manage.sidebar.expandedWidth";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 240;
const MAX_WIDTH = 420;

function clampWidth(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_WIDTH;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)));
}

function readStoredWidth() {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_WIDTH;
  return clampWidth(Number(raw));
}

export function useSidebarWidth() {
  const [width, setWidthState] = useState(readStoredWidth);

  const setWidth = useCallback((next: number) => {
    const clamped = clampWidth(next);
    setWidthState(clamped);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {
      // Keep the in-memory width if localStorage is unavailable.
    }
  }, []);

  const resetWidth = useCallback(() => {
    setWidth(DEFAULT_WIDTH);
  }, [setWidth]);

  return {
    width,
    minWidth: MIN_WIDTH,
    maxWidth: MAX_WIDTH,
    defaultWidth: DEFAULT_WIDTH,
    setWidth,
    resetWidth,
  };
}
```

- [ ] **Step 4: Integrate sidebar dragging**

In `Sidebar.tsx`:

- import `useRef` from React.
- import `useSidebarWidth`.
- apply `style={{ width: expanded ? sidebarWidth.width : 56 }}` instead of `expanded ? "w-56" : "w-14"`.
- add a right-edge drag handle only when expanded.
- on pointer down, capture start x and start width.
- on pointer move, call `setWidth(startWidth + event.clientX - startX)`.
- on pointer up, remove document listeners.
- on double click, call `resetWidth()`.

Implementation shape:

```tsx
const sidebarWidth = useSidebarWidth();
const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

function handleResizePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
  event.preventDefault();
  dragState.current = { startX: event.clientX, startWidth: sidebarWidth.width };

  function handleMove(moveEvent: PointerEvent) {
    const state = dragState.current;
    if (!state) return;
    sidebarWidth.setWidth(state.startWidth + moveEvent.clientX - state.startX);
  }

  function handleUp() {
    dragState.current = null;
    document.removeEventListener("pointermove", handleMove);
    document.removeEventListener("pointerup", handleUp);
  }

  document.addEventListener("pointermove", handleMove);
  document.addEventListener("pointerup", handleUp);
}
```

- [ ] **Step 5: Run sidebar tests**

Run: `pnpm test -- src/test/useSidebarWidth.test.tsx src/test/Sidebar.test.tsx`

Expected: new width tests pass. Existing Sidebar assertions may need updates from fixed width class to inline width style.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useSidebarWidth.ts src/components/layout/Sidebar.tsx src/test/useSidebarWidth.test.tsx src/test/Sidebar.test.tsx
git commit -m "feat: add resizable sidebar"
```

---

### Task 2: Display Mode and Column Preference Hooks

**Files:**
- Create: `src/hooks/useSkillDisplayMode.ts`
- Create: `src/hooks/useSkillTableColumns.ts`
- Test: `src/test/skillBrowserPreferences.test.tsx`

**Interfaces:**
- Produces: `type SkillDisplayMode = "list" | "card"`
- Produces: `useSkillDisplayMode(scope?: string): [SkillDisplayMode, (mode: SkillDisplayMode) => void]`
- Produces: `type SkillTableColumnKey = "source" | "createdAt" | "updatedAt" | "installStatus" | "tags" | "notes" | "rating"`
- Produces: `type SkillFolderTableColumnKey = "path" | "skillCount" | "installSummary" | "updatedAt" | "notesSummary"`
- Produces: `useSkillTableColumns(kind: "skill" | "folder"): { visibleColumns: Set<string>; toggleColumn(key: string): void; resetColumns(): void }`

- [ ] **Step 1: Write failing preference tests**

Create `src/test/skillBrowserPreferences.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSkillDisplayMode } from "@/hooks/useSkillDisplayMode";
import { useSkillTableColumns } from "@/hooks/useSkillTableColumns";

describe("skill browser preferences", () => {
  beforeEach(() => window.localStorage.clear());

  it("persists display mode globally", () => {
    const { result, rerender } = renderHook(() => useSkillDisplayMode());
    expect(result.current[0]).toBe("card");
    act(() => result.current[1]("list"));
    rerender();
    expect(result.current[0]).toBe("list");
  });

  it("persists skill table columns", () => {
    const { result, rerender } = renderHook(() => useSkillTableColumns("skill"));
    expect(result.current.visibleColumns.has("source")).toBe(true);
    act(() => result.current.toggleColumn("source"));
    rerender();
    expect(result.current.visibleColumns.has("source")).toBe(false);
  });

  it("does not toggle fixed skill columns", () => {
    const { result } = renderHook(() => useSkillTableColumns("skill"));
    act(() => result.current.toggleColumn("name"));
    act(() => result.current.toggleColumn("actions"));
    expect(result.current.visibleColumns.has("name")).toBe(true);
    expect(result.current.visibleColumns.has("actions")).toBe(true);
  });
});
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm test -- src/test/skillBrowserPreferences.test.tsx`

Expected before implementation: fail with missing hooks.

- [ ] **Step 3: Implement `useSkillDisplayMode`**

Create `src/hooks/useSkillDisplayMode.ts`:

```ts
import { useCallback, useState } from "react";

export type SkillDisplayMode = "list" | "card";

const STORAGE_KEY = "skills-manage.skillDisplayMode";
const DEFAULT_MODE: SkillDisplayMode = "card";

function isSkillDisplayMode(value: string | null): value is SkillDisplayMode {
  return value === "list" || value === "card";
}

function readMode(): SkillDisplayMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return isSkillDisplayMode(raw) ? raw : DEFAULT_MODE;
}

export function useSkillDisplayMode(): [SkillDisplayMode, (mode: SkillDisplayMode) => void] {
  const [mode, setModeState] = useState(readMode);

  const setMode = useCallback((next: SkillDisplayMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Keep in-memory preference if localStorage is unavailable.
    }
  }, []);

  return [mode, setMode];
}
```

- [ ] **Step 4: Implement `useSkillTableColumns`**

Create `src/hooks/useSkillTableColumns.ts`:

```ts
import { useCallback, useState } from "react";

export type SkillTableKind = "skill" | "folder";

export const FIXED_SKILL_COLUMNS = ["name", "actions"] as const;
export const DEFAULT_SKILL_COLUMNS = [
  "name",
  "source",
  "createdAt",
  "updatedAt",
  "installStatus",
  "notes",
  "actions",
] as const;
export const DEFAULT_FOLDER_COLUMNS = [
  "name",
  "path",
  "skillCount",
  "installSummary",
  "updatedAt",
  "notesSummary",
  "actions",
] as const;

const FIXED_COLUMNS = new Set(["name", "actions"]);

function storageKey(kind: SkillTableKind) {
  return `skills-manage.skillTableColumns.${kind}`;
}

function defaultsFor(kind: SkillTableKind) {
  return kind === "skill" ? DEFAULT_SKILL_COLUMNS : DEFAULT_FOLDER_COLUMNS;
}

function readColumns(kind: SkillTableKind) {
  if (typeof window === "undefined") return new Set<string>(defaultsFor(kind));
  const raw = window.localStorage.getItem(storageKey(kind));
  if (!raw) return new Set<string>(defaultsFor(kind));
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set<string>(defaultsFor(kind));
    return new Set<string>([...parsed.map(String), ...FIXED_COLUMNS]);
  } catch {
    return new Set<string>(defaultsFor(kind));
  }
}

export function useSkillTableColumns(kind: SkillTableKind) {
  const [visibleColumns, setVisibleColumns] = useState(() => readColumns(kind));

  const persist = useCallback(
    (next: Set<string>) => {
      try {
        window.localStorage.setItem(storageKey(kind), JSON.stringify([...next]));
      } catch {
        // Keep in-memory columns if localStorage is unavailable.
      }
    },
    [kind]
  );

  const toggleColumn = useCallback(
    (key: string) => {
      if (FIXED_COLUMNS.has(key)) return;
      setVisibleColumns((previous) => {
        const next = new Set(previous);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        for (const fixed of FIXED_COLUMNS) next.add(fixed);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const resetColumns = useCallback(() => {
    const next = new Set<string>(defaultsFor(kind));
    setVisibleColumns(next);
    persist(next);
  }, [kind, persist]);

  return { visibleColumns, toggleColumn, resetColumns };
}
```

- [ ] **Step 5: Run preference tests**

Run: `pnpm test -- src/test/skillBrowserPreferences.test.tsx`

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useSkillDisplayMode.ts src/hooks/useSkillTableColumns.ts src/test/skillBrowserPreferences.test.tsx
git commit -m "feat: add skill browser preferences"
```

---

### Task 3: Toolbar, Status Bar Controls, and Column Settings UI

**Files:**
- Modify: `src/components/skill/SkillBrowserToolbar.tsx`
- Modify: `src/components/skill/SkillListModeToggle.tsx`
- Create: `src/components/skill/SkillDisplayModeToggle.tsx`
- Create: `src/components/skill/SkillColumnSettings.tsx`
- Modify: `src/components/layout/AppStatusBar.tsx`
- Create: `src/stores/browserUiStore.ts`
- Test: `src/test/SkillBrowserToolbar.test.tsx`
- Test: `src/test/SkillDisplayModeToggle.test.tsx`
- Test: `src/test/SkillColumnSettings.test.tsx`

**Interfaces:**
- Consumes: `SkillDisplayMode`, `useSkillTableColumns`.
- Produces: `useBrowserUiStore` with `setStatusControls(node: ReactNode | null)` only if direct layout props are impossible.
- Produces: `SkillDisplayModeToggle({ value, onChange })`.
- Produces: `SkillColumnSettings({ kind, visibleColumns, onToggle })`.

- [ ] **Step 1: Add component tests for display mode toggle**

Create `src/test/SkillDisplayModeToggle.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SkillDisplayModeToggle } from "@/components/skill/SkillDisplayModeToggle";

describe("SkillDisplayModeToggle", () => {
  it("switches between list and card modes", () => {
    const onChange = vi.fn();
    render(<SkillDisplayModeToggle value="card" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /list|列表/i }));
    expect(onChange).toHaveBeenCalledWith("list");
  });
});
```

- [ ] **Step 2: Add component tests for column settings**

Create `src/test/SkillColumnSettings.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SkillColumnSettings } from "@/components/skill/SkillColumnSettings";

describe("SkillColumnSettings", () => {
  it("renders configurable skill columns and keeps fixed columns disabled", () => {
    const onToggle = vi.fn();
    render(
      <SkillColumnSettings
        kind="skill"
        visibleColumns={new Set(["name", "source", "actions"])}
        onToggle={onToggle}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /columns|列/i }));
    expect(screen.getByLabelText(/name|名称/i)).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/repository|仓库|source|来源/i));
    expect(onToggle).toHaveBeenCalledWith("source");
  });
});
```

- [ ] **Step 3: Implement `SkillDisplayModeToggle`**

Use lucide `List` and `LayoutGrid`. Buttons are icon-only with accessible labels.

```tsx
import { LayoutGrid, List } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SkillDisplayMode } from "@/hooks/useSkillDisplayMode";
import { cn } from "@/lib/utils";

export function SkillDisplayModeToggle({
  value,
  onChange,
}: {
  value: SkillDisplayMode;
  onChange: (value: SkillDisplayMode) => void;
}) {
  const { t } = useTranslation();
  const options = [
    { value: "list" as const, label: t("skillBrowser.displayList"), icon: List },
    { value: "card" as const, label: t("skillBrowser.displayCard"), icon: LayoutGrid },
  ];

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5">
      {options.map((option) => {
        const Icon = option.icon;
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-label={option.label}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-7 w-8 items-center justify-center rounded-md transition-colors",
              selected
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Implement `SkillColumnSettings`**

Use the existing button and popover/dropdown pattern already present in the repo. If there is no reusable popover, use a small controlled absolutely-positioned panel near the button.

The labels must come from i18n keys under `skillBrowser.columns.*`.

- [ ] **Step 5: Update `SkillBrowserToolbar` copy**

Change the second group label from `skillList.viewModeLabel` to `skillBrowser.organizationLabel`.

Change option copy:

- `skillBrowser.organizationAll`
- `skillBrowser.organizationFolders`

Keep the data type as `SkillListViewMode = "all" | "folders"` to avoid unnecessary churn.

- [ ] **Step 6: Add status-bar control mount point**

Preferred approach:

- Create `src/stores/browserUiStore.ts`.
- Store a serializable state, not a React node:

```ts
import { create } from "zustand";
import type { SkillDisplayMode } from "@/hooks/useSkillDisplayMode";

interface BrowserUiState {
  displayMode: SkillDisplayMode;
  showColumnSettings: boolean;
  setDisplayMode: (mode: SkillDisplayMode) => void;
  setShowColumnSettings: (visible: boolean) => void;
}
```

Then `AppStatusBar` can render `SkillDisplayModeToggle` and a column settings placeholder based on store state.

If page-specific column settings need page callbacks, render the bottom controls inside each page using absolute or sticky positioning above the status bar instead of sending callbacks through Zustand.

- [ ] **Step 7: Run focused UI tests**

Run:

```bash
pnpm test -- src/test/SkillDisplayModeToggle.test.tsx src/test/SkillColumnSettings.test.tsx src/test/SkillBrowserToolbar.test.tsx
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/skill/SkillBrowserToolbar.tsx src/components/skill/SkillListModeToggle.tsx src/components/skill/SkillDisplayModeToggle.tsx src/components/skill/SkillColumnSettings.tsx src/components/layout/AppStatusBar.tsx src/stores/browserUiStore.ts src/test/SkillDisplayModeToggle.test.tsx src/test/SkillColumnSettings.test.tsx src/test/SkillBrowserToolbar.test.tsx
git commit -m "feat: add browser display controls"
```

---

### Task 4: Shared Skill and Folder Table Views

**Files:**
- Create: `src/components/skill/SkillTableView.tsx`
- Create: `src/components/skill/SkillFolderTableView.tsx`
- Modify: `src/lib/skillSort.ts`
- Test: `src/test/SkillTableView.test.tsx`
- Test: `src/test/SkillFolderTableView.test.tsx`
- Test: `src/test/skillSort.test.ts`

**Interfaces:**
- Produces: `SkillTableView({ skills, agents, visibleColumns, sortField, sortDirection, onSortChange, actions })`.
- Produces: `SkillFolderTableView({ groups, visibleColumns, sortField, sortDirection, onSortChange, actions })`.
- Produces optional `SkillSortField` extension: `"source"` and `"rating"` only if table header sorting needs them.

- [ ] **Step 1: Add sort tests for repository/source**

Create `src/test/skillSort.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sortBySkillBrowserOrder } from "@/lib/skillSort";

describe("skillSort", () => {
  it("sorts skills by repository/source when requested", () => {
    const sorted = sortBySkillBrowserOrder(
      [
        { name: "b", source_repo: "z/repo" },
        { name: "a", source_repo: "a/repo" },
      ],
      "source",
      "asc"
    );
    expect(sorted.map((skill) => skill.name)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Extend sort types minimally**

Modify `src/lib/skillSort.ts`:

- `SkillSortField = "name" | "source" | "createdAt" | "updatedAt"`
- `SortableSkill` includes `source_repo?: string | null; source_author?: string | null; source?: string | null;`
- source comparison uses `source_repo ?? source_author ?? source ?? ""`, then falls back to name.

Do not add `rating` sorting until a rating field exists.

- [ ] **Step 3: Add skill table component test**

Create `src/test/SkillTableView.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SkillTableView } from "@/components/skill/SkillTableView";

describe("SkillTableView", () => {
  it("renders compact skill rows and opens details from the name", () => {
    const onDetail = vi.fn();
    render(
      <SkillTableView
        skills={[
          {
            id: "ask-matt",
            name: "ask-matt",
            description: "Router skill",
            file_path: "D:/Skills/mattpocock/skills/ask-matt/SKILL.md",
            is_central: false,
            source_repo: "mattpocock/skills",
            linked_agents: ["claude-code"],
            scanned_at: "2026-08-14T00:00:00Z",
          },
        ]}
        agents={[{ id: "claude-code", display_name: "Claude Code", category: "coding", global_skills_dir: "", is_builtin: true, is_detected: true, is_enabled: true }]}
        visibleColumns={new Set(["name", "source", "createdAt", "updatedAt", "installStatus", "notes", "actions"])}
        sortField="name"
        sortDirection="asc"
        onSortChange={vi.fn()}
        onDetail={onDetail}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /ask-matt/i }));
    expect(onDetail).toHaveBeenCalledWith("ask-matt");
    expect(screen.getByText("mattpocock/skills")).toBeInTheDocument();
    expect(screen.getByText(/Claude Code|1/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Implement `SkillTableView`**

Use semantic `<table>` inside an overflow wrapper.

Implementation requirements:

- Name column is a button opening detail.
- Source column displays `source_repo ?? source_author ?? source ?? ""`.
- Date columns use the existing short date style from `UnifiedSkillCard`.
- Installation status summarizes linked/read-only agents and central state.
- Notes shows a muted "Yes/No" label or a note icon with tooltip.
- Actions render a slot object so Resource/Central/Platform pages can pass their existing callbacks.

- [ ] **Step 5: Add folder table component test**

Create `src/test/SkillFolderTableView.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SkillFolderTableView } from "@/components/skill/SkillFolderTableView";

describe("SkillFolderTableView", () => {
  it("renders folder rows and opens folders", () => {
    const onOpen = vi.fn();
    render(
      <SkillFolderTableView
        groups={[
          {
            name: "anthropics/skills",
            relativePath: "anthropics/skills",
            path: "D:/Skills/anthropics/skills",
            skillCount: 18,
            linkedAgentCount: 10,
            readOnlyAgentCount: 0,
            skills: [{ name: "algorithmic-art", scanned_at: "2026-08-14T00:00:00Z" }],
          },
        ]}
        visibleColumns={new Set(["name", "path", "skillCount", "installSummary", "updatedAt", "notesSummary", "actions"])}
        sortField="name"
        sortDirection="asc"
        onSortChange={vi.fn()}
        onOpen={onOpen}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /anthropics\/skills/i }));
    expect(onOpen).toHaveBeenCalledWith("anthropics/skills");
    expect(screen.getByText("18")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Implement `SkillFolderTableView`**

Render folder rows with:

- Folder name button.
- Path.
- Skill count.
- Installation summary: linked + read-only counts.
- Updated time from latest skill timestamp.
- Notes summary from skills with non-empty `notes`.
- Action buttons passed as callbacks.

- [ ] **Step 7: Run table tests**

Run:

```bash
pnpm test -- src/test/skillSort.test.ts src/test/SkillTableView.test.tsx src/test/SkillFolderTableView.test.tsx
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/skill/SkillTableView.tsx src/components/skill/SkillFolderTableView.tsx src/lib/skillSort.ts src/test/skillSort.test.ts src/test/SkillTableView.test.tsx src/test/SkillFolderTableView.test.tsx
git commit -m "feat: add compact skill tables"
```

---

### Task 5: Integrate List/Card and Folder Tables Into Browser Pages

**Files:**
- Modify: `src/pages/ResourceLibraryView.tsx`
- Modify: `src/pages/CentralSkillsView.tsx`
- Modify: `src/pages/PlatformView.tsx`
- Modify: `src/test/ResourceLibraryView.test.tsx`
- Modify: `src/test/CentralSkillsView.test.tsx`
- Modify: `src/test/PlatformView.test.tsx`

**Interfaces:**
- Consumes: `useSkillDisplayMode`, `useSkillTableColumns`, `SkillTableView`, `SkillFolderTableView`, `SkillDisplayModeToggle`, `SkillColumnSettings`.
- Preserves: existing card actions and folder actions.

- [ ] **Step 1: Add Resource Library integration test**

Extend `src/test/ResourceLibraryView.test.tsx`:

```tsx
it("switches resource library between card and list display", async () => {
  window.localStorage.setItem("skills-manage.skillDisplayMode", "list");
  render(<ResourceLibraryView />);
  expect(await screen.findByRole("table")).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: /name|名称/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Add Central Skills integration test**

Extend `src/test/CentralSkillsView.test.tsx`:

```tsx
it("renders central folders as rows in list display and folder organization", async () => {
  window.localStorage.setItem("skills-manage.skillDisplayMode", "list");
  window.localStorage.setItem("skills-manage.skillListViewMode.central", "folders");
  render(<CentralSkillsView />);
  expect(await screen.findByRole("table")).toBeInTheDocument();
});
```

- [ ] **Step 3: Add Platform View integration test**

Extend `src/test/PlatformView.test.tsx`:

```tsx
it("renders platform skills as a compact table in list display", async () => {
  window.localStorage.setItem("skills-manage.skillDisplayMode", "list");
  render(<PlatformView />);
  expect(await screen.findByRole("table")).toBeInTheDocument();
});
```

- [ ] **Step 4: Integrate Resource Library**

In `ResourceLibraryView.tsx`:

- add `const [displayMode, setDisplayMode] = useSkillDisplayMode();`
- add skill and folder column hooks.
- keep `SkillBrowserToolbar` in the top filter bar for sorting and organization.
- render bottom-right controls near the status bar or through the status bar integration.
- when `viewMode === "folders" && !activeFolder && displayMode === "list"`, render `SkillFolderTableView`.
- when rendering skills and `displayMode === "list"`, render `SkillTableView`.
- preserve existing `UnifiedSkillCard` path when `displayMode === "card"`.

- [ ] **Step 5: Integrate Central Skills**

Apply the same rendering matrix:

- All + Card: existing central skill cards.
- All + List: `SkillTableView`.
- By folder + Card: existing folder cards.
- By folder + List: `SkillFolderTableView`.

Central-specific folder actions must remain available.

- [ ] **Step 6: Integrate Platform View**

Apply the same rendering matrix for both software platforms and project directories because both route through `PlatformView`.

Platform folder list actions must include uninstall where available.

- [ ] **Step 7: Run browser page tests**

Run:

```bash
pnpm test -- src/test/ResourceLibraryView.test.tsx src/test/CentralSkillsView.test.tsx src/test/PlatformView.test.tsx
```

Expected: pass, aside from any documented unrelated legacy failures. If an existing assertion assumes card-only rendering, update it to set display mode to `card`.

- [ ] **Step 8: Commit**

```bash
git add src/pages/ResourceLibraryView.tsx src/pages/CentralSkillsView.tsx src/pages/PlatformView.tsx src/test/ResourceLibraryView.test.tsx src/test/CentralSkillsView.test.tsx src/test/PlatformView.test.tsx
git commit -m "feat: integrate skill browser list view"
```

---

### Task 6: i18n, Polish, and Verification

**Files:**
- Modify: `src/i18n/locales/zh.json`
- Modify: `src/i18n/locales/en.json`
- Modify: any tests that validate translated labels.

**Interfaces:**
- Consumes all components from previous tasks.
- Produces final user-facing copy.

- [ ] **Step 1: Add i18n keys**

Add Chinese and English keys:

```json
{
  "skillBrowser": {
    "sortLabel": "排序",
    "organizationLabel": "组织",
    "organizationAll": "全部",
    "organizationFolders": "按目录",
    "displayList": "列表",
    "displayCard": "卡片",
    "columns": {
      "button": "列设置",
      "title": "列设置",
      "name": "名称",
      "source": "仓库/来源",
      "createdAt": "创建时间",
      "updatedAt": "更新时间",
      "installStatus": "安装状态",
      "tags": "标签",
      "notes": "备注",
      "rating": "评级",
      "actions": "操作",
      "path": "路径",
      "skillCount": "技能数",
      "installSummary": "安装摘要",
      "notesSummary": "备注摘要"
    }
  }
}
```

English equivalent:

```json
{
  "skillBrowser": {
    "sortLabel": "Sort",
    "organizationLabel": "Organize",
    "organizationAll": "All",
    "organizationFolders": "By folder",
    "displayList": "List",
    "displayCard": "Card",
    "columns": {
      "button": "Columns",
      "title": "Columns",
      "name": "Name",
      "source": "Repository/source",
      "createdAt": "Created",
      "updatedAt": "Updated",
      "installStatus": "Install status",
      "tags": "Tags",
      "notes": "Notes",
      "rating": "Rating",
      "actions": "Actions",
      "path": "Path",
      "skillCount": "Skills",
      "installSummary": "Install summary",
      "notesSummary": "Notes summary"
    }
  }
}
```

If the existing locale files use flat keys, preserve the existing structure and add equivalent flat keys.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`

Expected: pass.

- [ ] **Step 3: Run focused tests**

Run:

```bash
pnpm test -- src/test/useSidebarWidth.test.tsx src/test/skillBrowserPreferences.test.tsx src/test/SkillDisplayModeToggle.test.tsx src/test/SkillColumnSettings.test.tsx src/test/SkillTableView.test.tsx src/test/SkillFolderTableView.test.tsx src/test/ResourceLibraryView.test.tsx src/test/CentralSkillsView.test.tsx src/test/PlatformView.test.tsx src/test/Sidebar.test.tsx
```

Expected: pass.

- [ ] **Step 4: Run lint**

Run: `pnpm lint`

Expected: pass or only pre-existing unrelated warnings if the repo already has them documented.

- [ ] **Step 5: Manual UI verification**

Run: `pnpm tauri dev`

Check:

- English sidebar labels fit at default expanded width.
- Dragging sidebar width persists after app reload.
- Double-click resize handle resets width.
- Skill Resource Library supports All/Card, All/List, By folder/Card, By folder/List.
- Central Skills supports All/Card, All/List, By folder/Card, By folder/List.
- Software Platform page supports All/Card, All/List, By folder/Card, By folder/List.
- Project Directory page supports All/Card, All/List, By folder/Card, By folder/List.
- Column settings hide and restore configurable columns.
- Light and dark themes keep selected List/Card control blue and readable.

- [ ] **Step 6: Commit final polish**

```bash
git add src/i18n/locales/zh.json src/i18n/locales/en.json src/components src/hooks src/pages src/stores src/test
git commit -m "chore: polish skill browser layout"
```

---

## Plan Self-Review

Spec coverage:

- Resizable sidebar: Task 1.
- Top sorting and organization controls: Task 3.
- Bottom-right List/Card display mode: Task 3 and Task 5.
- Compact skill list view: Task 4 and Task 5.
- Folder list view: Task 4 and Task 5.
- Column settings: Task 2, Task 3, and Task 5.
- Shared components across Resource Library, Central Skills, Software Platforms, and Project Directories: Task 4 and Task 5.
- i18n and verification: Task 6.

Placeholder scan:

- No unresolved placeholder steps remain.

Type consistency:

- `SkillDisplayMode` is consistently `"list" | "card"`.
- Organization mode keeps existing `SkillListViewMode = "all" | "folders"`.
- Column hooks consistently use `kind: "skill" | "folder"`.
- Sort extension uses `"source"` only; rating is intentionally not added until a rating model exists.
