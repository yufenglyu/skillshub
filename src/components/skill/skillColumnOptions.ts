import type { SkillTableKind } from "@/hooks/useSkillTableColumns";

export interface SkillColumnOption {
  key: string;
  labelKey: string;
  fixed?: boolean;
}

export const SKILL_COLUMN_OPTIONS: SkillColumnOption[] = [
  { key: "name", labelKey: "skillBrowser.columns.name", fixed: true },
  { key: "source", labelKey: "skillBrowser.columns.source" },
  { key: "createdAt", labelKey: "skillBrowser.columns.createdAt" },
  { key: "updatedAt", labelKey: "skillBrowser.columns.updatedAt" },
  { key: "installStatus", labelKey: "skillBrowser.columns.installStatus" },
  { key: "rating", labelKey: "skillBrowser.columns.rating" },
  { key: "tags", labelKey: "skillBrowser.columns.tags" },
  { key: "notes", labelKey: "skillBrowser.columns.notes" },
  { key: "actions", labelKey: "skillBrowser.columns.actions", fixed: true },
];

export const FOLDER_COLUMN_OPTIONS: SkillColumnOption[] = [
  { key: "name", labelKey: "skillBrowser.columns.name", fixed: true },
  { key: "path", labelKey: "skillBrowser.columns.path" },
  { key: "skillCount", labelKey: "skillBrowser.columns.skillCount" },
  { key: "installSummary", labelKey: "skillBrowser.columns.installSummary" },
  { key: "updatedAt", labelKey: "skillBrowser.columns.updatedAt" },
  { key: "notesSummary", labelKey: "skillBrowser.columns.notesSummary" },
  { key: "actions", labelKey: "skillBrowser.columns.actions", fixed: true },
];

export function optionsForSkillTable(kind: SkillTableKind) {
  return kind === "skill" ? SKILL_COLUMN_OPTIONS : FOLDER_COLUMN_OPTIONS;
}
