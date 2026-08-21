import { cn } from "@/lib/utils";
import { usePlatformStore } from "@/stores/platformStore";

interface PlatformIconProps {
  agentId: string;
  iconSrc?: string;
  className?: string;
  /** Icon size in pixels (default: 16). */
  size?: number;
}

function GenericPlatformIcon({
  className,
  size,
}: {
  className?: string;
  size: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      className={cn("shrink-0", className)}
      aria-hidden
      role="img"
    >
      <rect x="2" y="3" width="12" height="10" rx="1.5" fill="currentColor" opacity="0.15" />
      <path d="M2 3h12a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 14 13H2a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 2 3zm1 2v6h10V5H3zm1 1.5 2 1.5L4 10v-1.5l.8-.5L4 8V6.5zm3.5 3.5h3v1h-3z" />
    </svg>
  );
}

export function PlatformIcon({ agentId, iconSrc, className, size = 16 }: PlatformIconProps) {
  const catalogSrc = usePlatformStore(
    (state) => state.agents.find((agent) => agent.id === agentId)?.icon_src
  );
  const src = iconSrc || catalogSrc;

  if (src) {
    return (
      <img
        src={src}
        width={size}
        height={size}
        alt=""
        className={cn("shrink-0 rounded-sm", className)}
        aria-hidden
      />
    );
  }

  return <GenericPlatformIcon className={className} size={size} />;
}
