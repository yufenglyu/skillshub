import type { ReactNode } from "react";

/** Compact toolbar inside the list pane, aligned with the inspector tabs. */
export function SkillBrowserHeader({ title, search, actions }: { title: ReactNode; search: ReactNode; actions?: ReactNode }) {
  return <header className="flex h-11 min-w-0 shrink-0 items-center gap-2 border-b border-border pl-2">
    <div className="flex shrink-0 items-center gap-1 [&>div]:flex [&>div]:items-center [&>div]:gap-1 [&_h1]:sr-only">{title}{actions}</div>
    <div className="ml-auto min-w-0 max-w-sm flex-1 [&>div]:w-full [&>div]:min-w-0 [&>div]:max-w-none">{search}</div>
  </header>;
}
