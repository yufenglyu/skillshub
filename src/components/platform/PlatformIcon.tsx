import { Cpu, FolderOpen } from "lucide-react";
import { isProjectAgentId } from "@/lib/projectTargets";
import { cn } from "@/lib/utils";

interface PlatformIconProps {
  agentId: string;
  className?: string;
  /** Icon size in pixels (default: 16). */
  size?: number;
}

export function PlatformIcon({ agentId, className, size = 16 }: PlatformIconProps) {
  const Icon = isProjectAgentId(agentId) ? FolderOpen : Cpu;

  return (
    <Icon
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      aria-hidden
    />
  );
}
