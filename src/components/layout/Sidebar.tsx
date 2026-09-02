import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Loader2,
  Layers,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Monitor,
  Moon,
  Settings,
  Sun,
  FolderOpen,
  FolderTree,
  Cpu,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { PlatformIcon } from "@/components/platform/PlatformIcon";
import { usePlatformStore } from "@/stores/platformStore";
import { useCollectionStore } from "@/stores/collectionStore";
import { useResourceLibraryStore } from "@/stores/resourceLibraryStore";
import { useCentralSkillsStore } from "@/stores/centralSkillsStore";
import { useThemeStore } from "@/stores/themeStore";
import { cn } from "@/lib/utils";
import { isEnabledInstallTargetAgent } from "@/lib/agents";
import { isProjectAgentId } from "@/lib/projectTargets";
import { useSidebarWidth } from "@/hooks/useSidebarWidth";
import { SharedHubIcon, SkillRepositoryIcon } from "@/components/skill/SkillActionIcons";
import { useSidebarStore } from "@/stores/sidebarStore";

// ─── Nav Item ────────────────────────────────────────────────────────────────

function NavItem({
  label,
  ariaLabel,
  title,
  isActive,
  onClick,
  icon,
  expanded,
  count,
  status,
}: {
  label: string;
  ariaLabel?: string;
  title?: string;
  isActive: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  expanded: boolean;
  count?: number;
  status?: {
    label: string;
    hint: string;
    shared: boolean;
  };
}) {
  const accessibleLabel = [ariaLabel ?? label, status?.label].filter(Boolean).join(" — ");
  const tooltip = status ? `${title ?? label} — ${status.hint}` : title ?? label;
  return (
    <div className="relative">
      <button
        onClick={onClick}
        title={tooltip}
        aria-label={accessibleLabel}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "flex items-center w-full rounded-md font-medium transition-colors cursor-pointer",
          !isActive && "hover:bg-primary/15 hover:text-primary",
          isActive && "bg-hover-bg text-white",
          expanded ? "gap-2.5 px-2.5 py-1.5 text-sm" : "justify-center py-2 px-1.5 text-sm"
        )}
      >
        <span className="shrink-0">{icon}</span>
        {expanded && (
          <>
            <span className="truncate min-w-0 flex-1 text-left">{label}</span>
            {status && (
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  status.shared
                    ? "bg-chart-4"
                    : "bg-primary"
                )}
                title={status.hint}
                aria-hidden="true"
              />
            )}
            {count !== undefined && count > 0 && (
              <span className={cn(
                "text-xs font-medium tabular-nums px-1.5 py-0.5 rounded-full shrink-0",
                isActive
                  ? "bg-white/20 text-white"
                  : "bg-muted/60 text-muted-foreground"
              )}>
                {count}
              </span>
            )}
          </>
        )}
      </button>
      {isActive && (
        <span
          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-white"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

// ─── Sidebar ────────────────────────────────────────────────────────────────

export function Sidebar() {
  const SHOW_ALL_PLATFORMS_KEY = "skills-manage:show-all-platforms";
  const SHOW_EMPTY_PROJECTS_KEY = "skills-manage:show-empty-project-directories";
  const SOFTWARE_COLLAPSED_KEY = "skills-manage:sidebar-software-platforms-collapsed";
  const PROJECTS_COLLAPSED_KEY = "skills-manage:sidebar-project-directories-collapsed";
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const { agents, skillsByAgent, isLoading } = usePlatformStore();
  const sidebarWidth = useSidebarWidth();
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  const collections = useCollectionStore((s) => s.collections);
  const loadCollections = useCollectionStore((s) => s.loadCollections);

  const resourceSkillsCount = useResourceLibraryStore((s) => s.skills.length);
  const loadResourceLibrary = useResourceLibraryStore((s) => s.loadResourceLibrary);
  const centralSkillsCount = useCentralSkillsStore((s) => s.skills.length);
  const loadCentralSkills = useCentralSkillsStore((s) => s.loadCentralSkills);
  const themeMode = useThemeStore((s) => s.mode);
  const cycleThemeMode = useThemeStore((s) => s.cycleMode);

  const expanded = useSidebarStore((s) => s.expanded);
  const setExpanded = useSidebarStore((s) => s.setExpanded);
  const [showAllPlatforms, setShowAllPlatforms] = useState(() => {
    try {
      return window.localStorage.getItem(SHOW_ALL_PLATFORMS_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [showEmptyProjects, setShowEmptyProjects] = useState(() => {
    try {
      return window.localStorage.getItem(SHOW_EMPTY_PROJECTS_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [softwareCollapsed, setSoftwareCollapsed] = usePersistentBoolean(
    SOFTWARE_COLLAPSED_KEY,
    false
  );
  const [projectsCollapsed, setProjectsCollapsed] = usePersistentBoolean(
    PROJECTS_COLLAPSED_KEY,
    false
  );

  useEffect(() => {
    loadCollections();
    loadResourceLibrary();
    loadCentralSkills();
  }, [loadCentralSkills, loadCollections, loadResourceLibrary]);

  useEffect(() => {
    const width = expanded ? sidebarWidth.width : 56;
    document.documentElement.style.setProperty("--app-sidebar-width", `${width}px`);
    return () => {
      document.documentElement.style.removeProperty("--app-sidebar-width");
    };
  }, [expanded, sidebarWidth.width]);

  function toggleShowAllPlatforms() {
    setShowAllPlatforms((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(SHOW_ALL_PLATFORMS_KEY, String(next));
      } catch {
        // Ignore storage failures and keep the in-memory preference.
      }
      return next;
    });
  }

  function toggleShowEmptyProjects() {
    setShowEmptyProjects((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(SHOW_EMPTY_PROJECTS_KEY, String(next));
      } catch {
        // Ignore storage failures and keep the in-memory preference.
      }
      return next;
    });
  }

  function handleResizePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    dragState.current = {
      startX: event.clientX,
      startWidth: sidebarWidth.width,
    };

    function handleMove(moveEvent: PointerEvent) {
      const state = dragState.current;
      if (!state) return;
      sidebarWidth.setWidth(state.startWidth + moveEvent.clientX - state.startX);
    }

    function handleUp() {
      dragState.current = null;
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
    }

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
  }

  const platformAgents = agents.filter(
    (a) =>
      isEnabledInstallTargetAgent(a) &&
      !isProjectAgentId(a.id) &&
      a.is_detected &&
      (showAllPlatforms || (skillsByAgent[a.id] ?? 0) > 0)
  );
  const projectAgents = agents.filter(
    (a) =>
      isEnabledInstallTargetAgent(a) &&
      isProjectAgentId(a.id) &&
      (showEmptyProjects || (skillsByAgent[a.id] ?? 0) > 0)
  );

  const isCollectionActive = pathname === "/collections";
  const themeLabel = t("topBar.cycleTheme", {
    mode: t(`topBar.themeMode.${themeMode}`),
  });
  const ThemeIcon = themeMode === "system" ? Monitor : themeMode === "light" ? Sun : Moon;

  function handleCollectionClick() {
    navigate("/collections");
  }

  return (
    <nav
      className={cn(
        "relative flex flex-col shrink-0 h-full border-r border-border bg-sidebar text-sidebar-foreground transition-[width] duration-200"
      )}
      style={{
        width: expanded ? sidebarWidth.width : 56,
      }}
      aria-label={t("sidebar.mainNav")}
    >
      {/* Toggle button */}
      <div
        className={cn(
          "flex items-center border-b border-border",
          expanded ? "justify-between px-3 py-2" : "justify-center py-2"
        )}
      >
        {expanded && (
          <span className="text-sm font-semibold text-sidebar-primary">
            {t("app.name")}
          </span>
        )}
        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "p-1 rounded-md transition-colors cursor-pointer",
            "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          )}
          aria-label={expanded ? t("sidebar.collapseSidebar") : t("sidebar.expandSidebar")}
          title={expanded ? t("sidebar.collapseSidebar") : t("sidebar.expandSidebar")}
        >
          {expanded ? (
            <ChevronLeft className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </button>
      </div>

      {/* Scrollable nav items */}
      <div className="flex-1 overflow-y-auto py-2 px-1.5 space-y-0.5">
        {/* Skill Repository */}
        <NavItem
          label={t("sidebar.resourceLibrary")}
          isActive={pathname === "/resources" || pathname === "/"}
          onClick={() => navigate("/resources")}
          icon={<SkillRepositoryIcon className="size-4" />}
          expanded={expanded}
          count={resourceSkillsCount}
        />

        {/* Skill Bundles */}
        <NavItem
          label={t("sidebar.collections")}
          isActive={isCollectionActive}
          onClick={handleCollectionClick}
          icon={<Layers className="size-4" />}
          expanded={expanded}
          count={collections.length}
        />

        {/* Divider */}
        <div className="border-t border-sidebar-border/70 my-2" />

        {/* Shared Hub — same section shell as platforms / projects */}
        {expanded ? (
          <div
            data-testid="central-skills-heading"
            className="flex items-center justify-between gap-1 rounded-lg border border-sidebar-border/60 bg-background/35 px-1 py-1"
          >
            <button
              type="button"
              onClick={() => navigate("/central")}
              aria-current={pathname === "/central" ? "page" : undefined}
              aria-label={t("sidebar.centralSkills")}
              title={t("sidebar.centralSkills")}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-sm font-medium transition-colors",
                pathname === "/central"
                  ? "bg-hover-bg text-white"
                  : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
              )}
            >
              <SharedHubIcon className="size-4 shrink-0" />
              <span className="truncate min-w-0 flex-1 text-left">{t("sidebar.centralSkills")}</span>
              {centralSkillsCount > 0 && (
                <span
                  className={cn(
                    "text-xs font-medium tabular-nums px-1.5 py-0.5 rounded-full shrink-0",
                    pathname === "/central"
                      ? "bg-white/20 text-white"
                      : "bg-muted/60 text-muted-foreground"
                  )}
                >
                  {centralSkillsCount}
                </span>
              )}
            </button>
          </div>
        ) : (
          <NavItem
            label={t("sidebar.centralSkills")}
            isActive={pathname === "/central"}
            onClick={() => navigate("/central")}
            icon={<SharedHubIcon className="size-4" />}
            expanded={false}
            count={centralSkillsCount}
          />
        )}

        {/* Software platforms */}
        {expanded ? (
          <div
            data-testid="software-platform-heading"
            className="flex items-center justify-between gap-1 rounded-lg border border-sidebar-border/60 bg-background/35 px-1 py-1"
          >
            <button
              type="button"
              onClick={() => setSoftwareCollapsed(!softwareCollapsed)}
              aria-expanded={!softwareCollapsed}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            >
              <Cpu className="size-4 shrink-0" />
              <span className="truncate text-left text-sm font-medium">
                {t("sidebar.softwarePlatforms")}
              </span>
            </button>
            {!isLoading && (
              <button
                onClick={toggleShowAllPlatforms}
                title={showAllPlatforms ? t("sidebar.hideEmptyPlatforms") : t("sidebar.showAllPlatforms")}
                aria-label={showAllPlatforms ? t("sidebar.hideEmptyPlatforms") : t("sidebar.showAllPlatforms")}
                className="cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              >
                {showAllPlatforms ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            )}
          </div>
        ) : (
          <div className="border-t border-sidebar-border/40 my-1.5" />
        )}

        {isLoading ? (
          <div className={cn(
            "flex items-center py-2 text-muted-foreground text-sm",
            expanded ? "gap-2 px-2.5" : "justify-center"
          )}>
            <Loader2 className="size-4 animate-spin shrink-0" />
            {expanded && <span>{t("sidebar.scanning")}</span>}
          </div>
        ) : (
          <>
            {!softwareCollapsed && platformAgents.length > 0 && (
              <div className={expanded ? "ml-3 border-l border-sidebar-border/70 pl-2" : ""}>
                {platformAgents.map((agent) => (
                  <NavItem
                    key={agent.id}
                    label={agent.display_name}
                    isActive={pathname === `/platform/${encodeURIComponent(agent.id)}`}
                    onClick={() => navigate(`/platform/${encodeURIComponent(agent.id)}`)}
                    icon={<PlatformIcon agentId={agent.id} className="size-4" />}
                    expanded={expanded}
                    count={skillsByAgent[agent.id]}
                    status={{
                      label: agent.shares_central_skills
                        ? t("sidebar.sharedDir")
                        : t("sidebar.independentDir"),
                      hint: agent.shares_central_skills
                        ? t("sidebar.sharedDirHint")
                        : t("sidebar.independentDirHint"),
                      shared: !!agent.shares_central_skills,
                    }}
                  />
                ))}
              </div>
            )}

            {expanded ? (
              <div
                data-testid="project-directories-heading"
                className="flex items-center justify-between gap-1 rounded-lg border border-sidebar-border/60 bg-background/35 px-1 py-1"
              >
                <button
                  type="button"
                  onClick={() => setProjectsCollapsed(!projectsCollapsed)}
                  aria-expanded={!projectsCollapsed}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  <FolderTree className="size-4 shrink-0" />
                  <span className="truncate text-left text-sm font-medium">
                    {t("sidebar.projectDirectories")}
                  </span>
                </button>
                {!isLoading && (
                  <button
                    onClick={toggleShowEmptyProjects}
                    title={
                      showEmptyProjects
                        ? t("sidebar.hideEmptyProjectDirectories")
                        : t("sidebar.showEmptyProjectDirectories")
                    }
                    aria-label={
                      showEmptyProjects
                        ? t("sidebar.hideEmptyProjectDirectories")
                        : t("sidebar.showEmptyProjectDirectories")
                    }
                    className="cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  >
                    {showEmptyProjects ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                )}
              </div>
            ) : (
              <div className="border-t border-sidebar-border/40 my-1.5" />
            )}
            {!projectsCollapsed && projectAgents.length > 0 && (
              <div className={expanded ? "ml-3 border-l border-sidebar-border/70 pl-2" : ""}>
                {projectAgents.map((agent) => (
                  <NavItem
                    key={agent.id}
                    label={agent.display_name}
                    isActive={pathname === `/platform/${encodeURIComponent(agent.id)}`}
                    onClick={() => navigate(`/platform/${encodeURIComponent(agent.id)}`)}
                    icon={<FolderOpen className="size-4" />}
                    expanded={expanded}
                    count={skillsByAgent[agent.id]}
                  />
                ))}
              </div>
            )}
          </>
        )}

      </div>

      <div className="border-t border-sidebar-border/70 px-1.5 py-2 space-y-0.5">
        <button
          type="button"
          onClick={cycleThemeMode}
          title={themeLabel}
          aria-label={themeLabel}
          className={cn(
            "flex w-full items-center rounded-md font-medium text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary",
            expanded ? "gap-2.5 px-2.5 py-1.5 text-sm" : "justify-center px-1.5 py-2 text-sm"
          )}
        >
          <ThemeIcon className="size-4 shrink-0" />
          {expanded && (
            <span className="truncate text-left">
              {t(`topBar.themeMode.${themeMode}`)}
            </span>
          )}
        </button>
        <NavItem
          label={t("sidebar.settings")}
          isActive={pathname === "/settings"}
          onClick={() => navigate("/settings")}
          icon={<Settings className="size-4" />}
          expanded={expanded}
        />
      </div>

      {expanded && (
        <button
          type="button"
          aria-label={t("sidebar.resizeSidebar", { defaultValue: "调整侧栏宽度" })}
          title={t("sidebar.resizeSidebar", { defaultValue: "调整侧栏宽度" })}
          onPointerDown={handleResizePointerDown}
          onDoubleClick={sidebarWidth.resetWidth}
          className={cn(
            "absolute right-[-3px] top-0 bottom-0 z-10 w-1.5 cursor-col-resize bg-transparent",
            "transition-colors hover:bg-primary/30 focus-visible:bg-primary/30 focus-visible:outline-none"
          )}
        />
      )}
    </nav>
  );
}

function usePersistentBoolean(key: string, defaultValue: boolean) {
  const [value, setValue] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === null ? defaultValue : stored === "true";
    } catch {
      return defaultValue;
    }
  });

  function update(next: boolean) {
    setValue(next);
    try {
      window.localStorage.setItem(key, String(next));
    } catch {
      // Ignore storage failures and keep the in-memory preference.
    }
  }

  return [value, update] as const;
}
