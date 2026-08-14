import { FolderOpen, LayoutList } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { SkillListViewMode } from "@/lib/skillFolders";
import { cn } from "@/lib/utils";

interface SkillListModeToggleProps {
  value: SkillListViewMode;
  onChange: (value: SkillListViewMode) => void;
  showLabel?: boolean;
}

export function SkillListModeToggle({ value, onChange, showLabel = true }: SkillListModeToggleProps) {
  const { t } = useTranslation();
  const options: Array<{
    value: SkillListViewMode;
    label: string;
    icon: typeof LayoutList;
  }> = [
    { value: "all", label: t("skillList.viewModeAll"), icon: LayoutList },
    { value: "folders", label: t("skillList.viewModeFolders"), icon: FolderOpen },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showLabel && (
        <span className="text-xs text-muted-foreground">{t("skillList.viewModeLabel")}</span>
      )}
      <div
        role="group"
        aria-label={t("skillList.viewModeLabel")}
        className="flex rounded-xl bg-muted/40 p-1"
      >
        {options.map((option) => {
          const Icon = option.icon;
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
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
  );
}
