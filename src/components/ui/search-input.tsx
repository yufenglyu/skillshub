import { Search, X } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchInputProps
  extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> {
  value: string;
  onValueChange: (value: string) => void;
  clearLabel?: string;
  containerClassName?: string;
  iconClassName?: string;
  clearButtonClassName?: string;
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      value,
      onValueChange,
      clearLabel,
      containerClassName,
      className,
      iconClassName,
      clearButtonClassName,
      ...props
    },
    ref
  ) => {
    const { t } = useTranslation();
    const resolvedClearLabel = clearLabel ?? t("common.clearSearch");

    return (
      <div className={cn("relative", containerClassName)}>
        <Search
          className={cn(
            "pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground",
            iconClassName
          )}
        />
        <Input
          ref={ref}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          className={cn("bg-muted/40 pl-8", value ? "pr-9" : "pr-3", className)}
          {...props}
        />
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onValueChange("")}
            aria-label={resolvedClearLabel}
            title={resolvedClearLabel}
            className={cn(
              "absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              clearButtonClassName
            )}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    );
  }
);

SearchInput.displayName = "SearchInput";
