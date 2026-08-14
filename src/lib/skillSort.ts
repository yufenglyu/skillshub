import type { SkillFolderGroup } from "@/lib/skillFolders";

export type SkillSortField = "name" | "createdAt" | "updatedAt";
export type SkillSortDirection = "asc" | "desc";

export interface SortableSkill {
  name: string;
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

  if (field === "name") {
    return nameComparison * multiplier;
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
