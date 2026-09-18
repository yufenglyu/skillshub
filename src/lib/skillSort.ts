import type { SkillFolderGroup } from "@/lib/skillFolders";

export type SkillSortField = "name" | "source" | "createdAt" | "updatedAt" | "skillCount" | "githubStars";
export type SkillSortDirection = "asc" | "desc";

export interface SortableSkill {
  name: string;
  github_stars?: number | null;
  source_author?: string | null;
  source_repo?: string | null;
  publisher?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  scanned_at?: string | null;
}

export function nextSkillSortDirection(
  currentField: SkillSortField,
  currentDirection: SkillSortDirection,
  nextField: SkillSortField
): SkillSortDirection {
  return currentField === nextField && currentDirection === "asc" ? "desc" : "asc";
}

export function parseSortableTimestamp(value?: string | null): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function getSkillSortTimestamp(
  skill: SortableSkill,
  field: Extract<SkillSortField, "createdAt" | "updatedAt">
): number {
  return parseSortableTimestamp(
    field === "createdAt"
      ? skill.created_at ?? skill.scanned_at
      : skill.updated_at ?? skill.scanned_at
  );
}

export function compareBySkillBrowserOrder<TSkill extends SortableSkill>(
  a: TSkill,
  b: TSkill,
  field: SkillSortField,
  direction: SkillSortDirection
) {
  const multiplier = direction === "asc" ? 1 : -1;
  const nameComparison = a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });

  if (field === "name") {
    return nameComparison * multiplier;
  }

  if (field === "source") {
    const sourceComparison = (a.source_repo ?? a.source_author ?? a.publisher ?? "").localeCompare(
      b.source_repo ?? b.source_author ?? b.publisher ?? "",
      undefined,
      {
        numeric: true,
        sensitivity: "base",
      }
    );
    return (sourceComparison === 0 ? nameComparison : sourceComparison) * multiplier;
  }

  if (field === "skillCount" || field === "githubStars") return nameComparison;

  const timeComparison = getSkillSortTimestamp(a, field) - getSkillSortTimestamp(b, field);
  return timeComparison === 0 ? nameComparison : timeComparison * multiplier;
}

export function sortBySkillBrowserOrder<TSkill extends SortableSkill>(
  skills: TSkill[],
  field: SkillSortField,
  direction: SkillSortDirection
) {
  return [...skills].sort((a, b) => compareBySkillBrowserOrder(a, b, field, direction));
}

export function getFolderSortTimestamp<TSkill extends SortableSkill>(
  group: SkillFolderGroup<TSkill>,
  field: Extract<SkillSortField, "createdAt" | "updatedAt">
): number {
  return group.skills.reduce(
    (latest, skill) => Math.max(latest, getSkillSortTimestamp(skill, field)),
    0
  );
}

export function compareFolderBySkillBrowserOrder<TSkill extends SortableSkill>(
  a: SkillFolderGroup<TSkill>,
  b: SkillFolderGroup<TSkill>,
  field: SkillSortField,
  direction: SkillSortDirection
) {
  const multiplier = direction === "asc" ? 1 : -1;
  const nameComparison = a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });

  if (field === "name" || field === "source") {
    return nameComparison * multiplier;
  }

  if (field === "skillCount" || field === "githubStars") {
    const first = field === "skillCount" ? a.skillCount : a.skills.find(skill => skill.github_stars != null)?.github_stars;
    const second = field === "skillCount" ? b.skillCount : b.skills.find(skill => skill.github_stars != null)?.github_stars;
    // Unknown star counts stay at the end in either direction; zero is a real count.
    if (first == null || second == null) {
      if (first == null && second == null) return nameComparison;
      return first == null ? 1 : -1;
    }
    return first === second ? nameComparison : (first - second) * multiplier;
  }

  const timeComparison = getFolderSortTimestamp(a, field) - getFolderSortTimestamp(b, field);
  return timeComparison === 0 ? nameComparison : timeComparison * multiplier;
}

export function sortFoldersBySkillBrowserOrder<TSkill extends SortableSkill>(
  groups: SkillFolderGroup<TSkill>[],
  field: SkillSortField,
  direction: SkillSortDirection
) {
  return [...groups].sort((a, b) => compareFolderBySkillBrowserOrder(a, b, field, direction));
}
