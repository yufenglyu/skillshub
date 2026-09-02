import type { ReactNode } from "react";
import { Archive, Minus, PackagePlus, Plus, Share2 } from "lucide-react";

function ActionIconFrame({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-flex size-4 shrink-0 items-center justify-center overflow-visible">
      {children}
    </span>
  );
}

export function SkillRepositoryIcon({ className = "size-4" }: { className?: string }) {
  return <Archive className={className} />;
}

export function SharedHubIcon({ className = "size-4" }: { className?: string }) {
  return <Share2 className={className} />;
}

export function SharedHubActionIcon({ installed }: { installed: boolean }) {
  const Badge = installed ? Minus : Plus;
  return (
    <ActionIconFrame>
      <SharedHubIcon className="size-4" />
      <Badge className="pointer-events-none absolute -bottom-1 -right-1 size-2.5 rounded-full bg-card stroke-[3]" />
    </ActionIconFrame>
  );
}

export function InstallTargetsActionIcon() {
  return (
    <ActionIconFrame>
      <PackagePlus className="size-4" />
    </ActionIconFrame>
  );
}
