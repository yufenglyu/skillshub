import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { Blocks, Database, RefreshCw, Search, Settings, Store } from "lucide-react";

import { usePlatformStore } from "@/stores/platformStore";
import { useDiscoverStore } from "@/stores/discoverStore";
import { useResourceLibraryStore } from "@/stores/resourceLibraryStore";
import { cn } from "@/lib/utils";

interface TopBarProps {
  onSearchClick: () => void;
  onRescan?: () => void;
}

export function TopBar({ onSearchClick, onRescan }: TopBarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const agents = usePlatformStore((s) => s.agents);
  const skillsByAgent = usePlatformStore((s) => s.skillsByAgent);
  const totalDiscovered = useDiscoverStore((s) => s.totalSkillsFound);
  const isScanning = useDiscoverStore((s) => s.isScanning);
  const resourceSkillsCount = useResourceLibraryStore((s) => s.skills.length);

  // Determine current view label and count
  const viewInfo = (() => {
    if (pathname === "/resources" || pathname === "/") {
      return { label: t("sidebar.resourceLibrary"), count: resourceSkillsCount };
    }
    if (pathname === "/central") {
      const count = skillsByAgent["central"] ?? 0;
      return { label: t("sidebar.centralSkills"), count };
    }
    if (pathname.startsWith("/platform/")) {
      const agentId = pathname.split("/platform/")[1];
      const agent = agents.find((a) => a.id === agentId);
      return {
        label: agent?.display_name ?? agentId,
        count: skillsByAgent[agentId] ?? 0,
      };
    }
    if (pathname.startsWith("/discover")) {
      return { label: t("sidebar.discovered"), count: totalDiscovered };
    }
    if (pathname === "/marketplace") {
      return { label: t("marketplace.title"), count: undefined };
    }
    if (pathname === "/collections") {
      return { label: t("sidebar.collections"), count: undefined };
    }
    if (pathname === "/settings") {
      return { label: t("sidebar.settings"), count: undefined };
    }
    if (pathname.startsWith("/skill/")) {
      return { label: t("globalSearch.skillDetail"), count: undefined };
    }
    return { label: "", count: undefined };
  })();

  const isMac =
    typeof navigator !== "undefined" &&
    navigator.platform.toUpperCase().includes("MAC");

  return (
    <header className="relative flex items-center h-12 px-4 border-b border-border bg-sidebar text-sidebar-foreground shrink-0">
      {/* App icon */}
      <button
        onClick={() => navigate("/resources")}
        className={cn(
          "z-10 p-1.5 rounded-md transition-colors cursor-pointer shrink-0",
          pathname === "/resources" || pathname === "/"
            ? "bg-muted/60 text-sidebar-primary"
            : "text-sidebar-primary hover:bg-muted/60"
        )}
        aria-label={t("sidebar.resourceLibrary")}
        title={t("sidebar.resourceLibrary")}
      >
        <Database className="size-4" />
      </button>

      <div className="z-10 ml-1 hidden items-center gap-1 sm:flex">
        <button
          onClick={() => navigate("/central")}
          className={cn(
            "p-1.5 rounded-md transition-colors cursor-pointer shrink-0",
            "text-muted-foreground hover:text-foreground hover:bg-muted/60",
            pathname === "/central" && "bg-muted/60 text-foreground"
          )}
          aria-label={t("sidebar.centralSkills")}
          title={t("sidebar.centralSkills")}
        >
          <Blocks className="size-4" />
        </button>
        <button
          onClick={() => navigate("/marketplace")}
          className={cn(
            "p-1.5 rounded-md transition-colors cursor-pointer shrink-0",
            "text-muted-foreground hover:text-foreground hover:bg-muted/60",
            pathname === "/marketplace" && "bg-muted/60 text-foreground"
          )}
          aria-label={t("marketplace.title")}
          title={t("marketplace.title")}
        >
          <Store className="size-4" />
        </button>
        {onRescan && (
          <button
            onClick={onRescan}
            className={cn(
              "p-1.5 rounded-md transition-colors cursor-pointer shrink-0",
              "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            )}
            aria-label={t("topBar.rescan")}
            title={t("topBar.rescan")}
          >
            <RefreshCw className="size-4" />
          </button>
        )}
      </div>

      <div className="flex-1" />

      <div className="pointer-events-none absolute inset-0 hidden items-center justify-center px-16 lg:flex">
        <div className="pointer-events-auto flex items-center gap-3 max-w-[min(56rem,calc(100vw-14rem))]">
          <button
            onClick={onSearchClick}
            className={cn(
              "flex items-center gap-2 h-8 w-[min(26rem,40vw)] min-w-[14rem] px-3 rounded-md text-sm",
              "bg-muted/40 text-muted-foreground border border-border/50",
              "hover:bg-muted/60 hover:border-border transition-colors cursor-pointer",
            )}
          >
            <Search className="size-3.5 shrink-0" />
            <span className="truncate flex-1 text-left">
              {t("globalSearch.trigger")}
            </span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground/60 border border-border/50 rounded px-1 py-0.5">
              {isMac ? "⌘" : "Ctrl"}K
            </kbd>
          </button>
        </div>
      </div>

      <div className="ml-3 flex min-w-0 flex-1 items-center gap-2 lg:hidden">
        <button
          onClick={onSearchClick}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 h-8 px-3 rounded-md text-sm",
            "bg-muted/40 text-muted-foreground border border-border/50",
            "hover:bg-muted/60 hover:border-border transition-colors cursor-pointer",
          )}
        >
          <Search className="size-3.5 shrink-0" />
          <span className="truncate flex-1 text-left">
            {t("globalSearch.trigger")}
          </span>
        </button>
        {viewInfo.label && (
          <span className="truncate text-sm text-muted-foreground">
            {viewInfo.label}
          </span>
        )}
      </div>

      {/* Scan indicator */}
      {isScanning && (
        <div className="mr-2 flex items-center gap-1.5 text-xs text-primary shrink-0">
          <span className="relative flex size-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full size-2 bg-primary" />
          </span>
          <span className="text-primary/70">{t("discover.scanning")}</span>
        </div>
      )}

      {/* Settings */}
      <button
        onClick={() => navigate("/settings")}
        className={cn(
          "z-10 p-1.5 rounded-md transition-colors cursor-pointer shrink-0",
          "text-muted-foreground hover:text-foreground hover:bg-muted/60",
          pathname === "/settings" && "bg-muted/60 text-foreground",
        )}
        aria-label={t("sidebar.settings")}
        title={t("sidebar.settings")}
      >
        <Settings className="size-4" />
      </button>
    </header>
  );
}
