import { CircleHelp } from "lucide-react";

import { cn } from "@/lib/utils";

type HelpIconProps = {
  label: string;
  title: string;
  className?: string;
};

export function HelpIcon({ label, title, className }: HelpIconProps) {
  return (
    <span
      aria-label={label}
      title={title}
      className={cn("inline-flex items-center text-muted-foreground", className)}
    >
      <CircleHelp className="size-4" aria-hidden="true" />
    </span>
  );
}
