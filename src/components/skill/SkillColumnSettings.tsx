import { Columns3, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { FIXED_SKILL_COLUMNS, type SkillTableKind } from "@/hooks/useSkillTableColumns";
import { cn } from "@/lib/utils";

export interface SkillColumnOption {
  key: string;
  labelKey: string;
  fixed?: boolean;
}

const fixedColumnKeys = new Set<string>(FIXED_SKILL_COLUMNS);

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

function optionsFor(kind: SkillTableKind) {
  return kind === "skill" ? SKILL_COLUMN_OPTIONS : FOLDER_COLUMN_OPTIONS;
}

interface SkillColumnSettingsProps {
  kind: SkillTableKind;
  visibleColumns: Set<string>;
  onToggle: (key: string) => void;
  onReset: () => void;
  className?: string;
}

export function SkillColumnSettings({
  kind,
  visibleColumns,
  onToggle,
  onReset,
  className,
}: SkillColumnSettingsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("relative", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={t("skillBrowser.columnSettings")}
        title={t("skillBrowser.columnSettings")}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Columns3 className="size-3.5" />
      </Button>

      {open ? (
        <div
          role="menu"
          aria-label={t("skillBrowser.columnSettings")}
          className="absolute bottom-8 right-0 z-50 w-56 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg"
        >
          <div className="mb-1 px-2 text-xs font-medium text-muted-foreground">
            {t("skillBrowser.visibleColumns")}
          </div>
          <div className="space-y-1">
            {optionsFor(kind).map((option) => {
              const fixed = option.fixed || fixedColumnKeys.has(option.key);
              return (
                <label
                  key={option.key}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs",
                    fixed ? "text-muted-foreground" : "cursor-pointer hover:bg-muted"
                  )}
                >
                  <input
                    type="checkbox"
                    aria-label={t(option.labelKey)}
                    checked={visibleColumns.has(option.key)}
                    disabled={fixed}
                    onChange={() => onToggle(option.key)}
                    className="size-3.5 accent-primary"
                  />
                  <span>{t(option.labelKey)}</span>
                  {fixed ? (
                    <span className="ml-auto text-[0.68rem] text-muted-foreground">
                      {t("skillBrowser.fixedColumn")}
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
          <div className="mt-2 border-t border-border pt-2">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="w-full justify-start"
              onClick={onReset}
            >
              <RotateCcw className="size-3" />
              {t("skillBrowser.resetColumns")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
