import { useCallback, useEffect, useState } from "react";

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
  "createdAt",
  "updatedAt",
  "notesSummary",
  "actions",
] as const;

const FIXED_COLUMNS = new Set<string>(FIXED_SKILL_COLUMNS);
const CHANGE_EVENT = "skills-manage:skill-table-columns";
const STORAGE_VERSION = "v2";

function storageKey(kind: SkillTableKind) {
  return `skills-manage.skillTableColumns.${kind}.${STORAGE_VERSION}`;
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
      window.dispatchEvent(
        new CustomEvent(CHANGE_EVENT, { detail: { kind, columns: [...next] } })
      );
    },
    [kind]
  );

  const toggleColumn = useCallback(
    (key: string) => {
      if (FIXED_COLUMNS.has(key)) return;
      setVisibleColumns((previous) => {
        const next = new Set(previous);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        for (const fixed of FIXED_COLUMNS) {
          next.add(fixed);
        }
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

  useEffect(() => {
    setVisibleColumns(readColumns(kind));
  }, [kind]);

  useEffect(() => {
    function handleChange(event: Event) {
      if (!(event instanceof CustomEvent)) return;
      if (event.detail?.kind !== kind) return;
      const columns = Array.isArray(event.detail.columns) ? event.detail.columns : [];
      setVisibleColumns(new Set<string>([...columns.map(String), ...FIXED_COLUMNS]));
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === storageKey(kind)) {
        setVisibleColumns(readColumns(kind));
      }
    }

    window.addEventListener(CHANGE_EVENT, handleChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handleChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [kind]);

  return { visibleColumns, toggleColumn, resetColumns };
}
