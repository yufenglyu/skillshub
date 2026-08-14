import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowUpAZ,
  Calendar,
  ListFilter,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { SkillListModeToggle } from "@/components/skill/SkillListModeToggle";
import type { SkillListViewMode } from "@/lib/skillFolders";
import {
  nextSkillSortDirection,
  type SkillSortDirection,
  type SkillSortField,
} from "@/lib/skillSort";
import { cn } from "@/lib/utils";

interface SkillBrowserToolbarProps {
  sortField: SkillSortField;
  sortDirection: SkillSortDirection;
  onSortChange: (field: SkillSortField, direction: SkillSortDirection) => void;
  viewMode: SkillListViewMode;
  onViewModeChange: (value: SkillListViewMode) => void;
  className?: string;
}

export function SkillBrowserToolbar({
  sortField,
  sortDirection,
  onSortChange,
  viewMode,
  onViewModeChange,
  className,
}: SkillBrowserToolbarProps) {
  const { t } = useTranslation();
  const sortOptions: Array<{ value: SkillSortField; label: string; icon: LucideIcon }> = [
    { value: "name", label: t("central.sortByName"), icon: ArrowUpAZ },
    { value: "createdAt", label: t("central.sortByCreatedAt"), icon: Calendar },
    { value: "updatedAt", label: t("central.sortByUpdatedAt"), icon: Calendar },
  ];

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/25 px-2 py-1">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <ListFilter className="size-3.5" />
          {t("central.sortLabel")}
        </span>
        <div
          role="group"
          aria-label={t("central.sortFieldLabel")}
          className="flex rounded-xl bg-muted/40 p-1"
        >
          {sortOptions.map((option) => {
            const selected = sortField === option.value;
            const nextDirection = nextSkillSortDirection(sortField, sortDirection, option.value);
            const Icon =
              option.value === "name"
                ? selected && sortDirection === "desc"
                  ? ArrowDownAZ
                  : ArrowUpAZ
                : selected && sortDirection === "desc"
                  ? ArrowDownWideNarrow
                  : option.icon;

            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onSortChange(option.value, nextDirection)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors cursor-pointer",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  selected
                    ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                )}
              >
                <Icon className="size-3.5" />
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/25 px-2 py-1">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <ListFilter className="size-3.5" />
          {t("skillList.viewModeLabel")}
        </span>
        <SkillListModeToggle value={viewMode} onChange={onViewModeChange} showLabel={false} />
      </div>
    </div>
  );
}
