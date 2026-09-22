import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Pencil, Plus, Power, PowerOff, Trash2 } from "lucide-react";
import { PlatformDialog } from "@/components/settings/PlatformDialog";
import { useSettingsStore } from "@/stores/settingsStore";
import { usePlatformStore } from "@/stores/platformStore";
import type { AgentWithStatus } from "@/types";

export function PlatformMenu({
  platform,
  children,
  onAdded,
}: {
  platform?: AgentWithStatus;
  children: ReactNode;
  onAdded?: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const settings = useSettingsStore();
  const rescan = usePlatformStore((s) => s.rescan);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setPosition(null);
    };
    const close = () => setPosition(null);
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("resize", close);
    };
  }, [position]);
  async function perform(action: "toggle" | "delete") {
    if (!platform || busy) return;
    setBusy(true);
    try {
      if (action === "toggle")
        await settings.toggleAgentEnabled(platform.id, !platform.is_enabled);
      else await settings.removeCustomAgent(platform.id);
      await rescan();
      if (
        location.pathname === `/platform/${encodeURIComponent(platform.id)}` &&
        (action === "delete" || platform.is_enabled)
      )
        navigate("/resources");
      setPosition(null);
    } catch {
      toast.error(t("workflow.operationFailed"));
    } finally {
      setBusy(false);
    }
  }
  const itemClass =
    "flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0";
  return (
    <>
      <div
        className="contents"
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setConfirming(false);
          setPosition({
            x: Math.max(4, Math.min(event.clientX, window.innerWidth - 210)),
            y: Math.max(4, Math.min(event.clientY, window.innerHeight - 150)),
          });
        }}
      >
        {children}
      </div>
      {position &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label={t("sidebar.softwarePlatforms")}
            className="fixed z-50 min-w-48 rounded-lg border bg-popover p-1 shadow-lg"
            style={{ left: position.x, top: position.y }}
            onKeyDown={(event) => {
              if (event.key === "Escape" || event.key === "Tab")
                setPosition(null);
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const items = [
                  ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                    "button:not(:disabled)",
                  ),
                ];
                const index = items.indexOf(
                  document.activeElement as HTMLButtonElement,
                );
                items[
                  (index +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    items.length) %
                    items.length
                ]?.focus();
              }
            }}
          >
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              disabled={busy}
              onClick={() => {
                setEditing(true);
                setPosition(null);
              }}
            >
              {platform ? <Pencil aria-hidden="true" /> : <Plus aria-hidden="true" />}
              {t(platform ? "common.edit" : "settings.addPlatform")}
            </button>
            {platform && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className={itemClass}
                  disabled={busy}
                  onClick={() => void perform("toggle")}
                >
                  {platform.is_enabled ? <PowerOff aria-hidden="true" /> : <Power aria-hidden="true" />}
                  {t(
                    platform.is_enabled
                      ? "workflow.platformDisable"
                      : "workflow.platformEnable",
                  )}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`${itemClass} text-destructive`}
                  disabled={busy}
                  onClick={() => {
                    if (confirming) void perform("delete");
                    else setConfirming(true);
                  }}
                >
                  <Trash2 aria-hidden="true" />
                  {t(confirming ? "common.confirmDelete" : "common.delete")}
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
      {editing && (
        <PlatformDialog
          open={editing}
          onOpenChange={setEditing}
          platform={platform ?? null}
          onAdd={async (id, displayName, globalSkillsDir) => {
            const added = await settings.addCustomAgent({
              id,
              display_name: displayName,
              global_skills_dir: globalSkillsDir,
            });
            await rescan();
            onAdded?.();
            return added.id;
          }}
          onEdit={async (id, displayName, globalSkillsDir) => {
            if (!platform) return;
            const updated = await settings.updateCustomAgent(platform.id, {
              id,
              display_name: displayName,
              global_skills_dir: globalSkillsDir,
            });
            await rescan();
            if (
              location.pathname ===
              `/platform/${encodeURIComponent(platform.id)}`
            )
              navigate(`/platform/${encodeURIComponent(updated.id)}`);
            return updated.id;
          }}
        />
      )}
    </>
  );
}
