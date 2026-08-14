import { Grid2X2, List } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { SkillDisplayMode } from "@/hooks/useSkillDisplayMode";
import { cn } from "@/lib/utils";

interface SkillDisplayModeToggleProps {
  value: SkillDisplayMode;
  onChange: (value: SkillDisplayMode) => void;
  className?: string;
}

export function SkillDisplayModeToggle({
  value,
  onChange,
  className,
}: SkillDisplayModeToggleProps) {
  const { t } = useTranslation();
  const options: Array<{
    value: SkillDisplayMode;
    label: string;
    icon: typeof List;
  }> = [
    { value: "list", label: t("skillBrowser.displayList"), icon: List },
    { value: "card", label: t("skillBrowser.displayCard"), icon: Grid2X2 },
  ];

  return (
    <div
      role="group"
      aria-label={t("skillBrowser.displayModeLabel")}
      className={cn("flex rounded-lg bg-muted/40 p-0.5", className)}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-label={option.label}
            aria-pressed={selected}
            title={option.label}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex size-6 items-center justify-center rounded-md transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              selected
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
            )}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
