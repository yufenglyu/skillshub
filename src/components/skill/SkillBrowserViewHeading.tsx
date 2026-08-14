import { FolderOpen, LayoutList } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { SkillListViewMode } from "@/lib/skillFolders";
import { cn } from "@/lib/utils";

interface SkillBrowserViewHeadingProps {
  value: SkillListViewMode;
  onChange: (value: SkillListViewMode) => void;
  className?: string;
}

export function SkillBrowserViewHeading({
  value,
  onChange,
  className,
}: SkillBrowserViewHeadingProps) {
  const { t } = useTranslation();
  const options: Array<{
    value: SkillListViewMode;
    label: string;
    icon: typeof LayoutList;
  }> = [
    { value: "all", label: t("skillBrowser.organizationAll"), icon: LayoutList },
    { value: "folders", label: t("skillBrowser.organizationFolders"), icon: FolderOpen },
  ];

  return (
    <div
      role="group"
      aria-label={t("skillBrowser.organizationLabel")}
      className={cn("flex items-center gap-1.5", className)}
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
              "inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              selected
                ? "bg-primary/10 text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <Icon className={cn("size-4", selected ? "text-primary" : "text-muted-foreground")} />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
