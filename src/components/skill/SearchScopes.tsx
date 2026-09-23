import { Filter } from "lucide-react";
import { useEffect, useRef } from "react";
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
  const container = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = () => { if (container.current) container.current.open = false; };
    const closeOutside = (event: Event) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !container.current?.open) return;
      event.preventDefault();
      event.stopPropagation();
      close();
      container.current.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("focusin", closeOutside);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("focusin", closeOutside);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("blur", close);
    };
  }, []);
  return (
    <details ref={container} className="relative shrink-0 text-xs" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
    }}>
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
