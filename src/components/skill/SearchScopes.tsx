import { Filter } from "lucide-react";
import { useTranslation } from "react-i18next";
import { allSearchScopes, type SearchScope } from "@/lib/skillFilters";
export function SearchScopes({
  value,
  onChange,
}: {
  value: SearchScope[];
  onChange: (value: SearchScope[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <details className="relative shrink-0 text-xs">
      <summary
        aria-label={t("workflow.searchScope")}
        title={t("workflow.searchScope")}
        className="flex size-8 cursor-pointer list-none items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
      >
        <Filter aria-hidden="true" className="size-4" />
      </summary>
      <div className="absolute right-0 z-30 min-w-32 rounded border bg-popover p-2 shadow">
        {allSearchScopes.map((scope) => (
          <label key={scope} className="flex items-center gap-2 p-1">
            <input
              type="checkbox"
              checked={value.includes(scope)}
              disabled={value.length === 1 && value.includes(scope)}
              onChange={() =>
                onChange(
                  value.includes(scope)
                    ? value.filter((s) => s !== scope)
                    : [...value, scope],
                )
              }
            />
            {t(`workflow.scope.${scope}`)}
          </label>
        ))}
      </div>
    </details>
  );
}
