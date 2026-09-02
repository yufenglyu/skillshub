import { Archive, Minus, PackagePlus, Plus, Share2 } from "lucide-react";

export function SkillRepositoryIcon({ className = "size-4" }: { className?: string }) {
  return <Archive className={className} />;
}

export function SharedHubIcon({ className = "size-4" }: { className?: string }) {
  return <Share2 className={className} />;
}

export function SharedHubActionIcon({ installed }: { installed: boolean }) {
  const Badge = installed ? Minus : Plus;
  return (
    <span className="relative inline-flex size-4">
      <SharedHubIcon className="size-4" />
      <Badge className="absolute -bottom-1 -right-1 size-2.5 rounded-full bg-card stroke-[3]" />
    </span>
  );
}

export function InstallTargetsActionIcon() {
  return <PackagePlus className="size-4" />;
}
