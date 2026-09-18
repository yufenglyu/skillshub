import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AddDirectoryDialog } from "@/components/settings/AddDirectoryDialog";
import { useSettingsStore } from "@/stores/settingsStore";
import { usePlatformStore } from "@/stores/platformStore";
import { projectAgentId } from "@/lib/projectTargets";

export function ProjectDirectoryMenu({ agentId, children, onAdded }: {agentId?: string; children: ReactNode; onAdded?: () => void}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const settings = useSettingsStore();
  const refreshCounts = usePlatformStore(s => s.refreshCounts);
  const directory = settings.scanDirectories.find(dir => projectAgentId(dir.id) === agentId);
  const [position, setPosition] = useState<{x:number;y:number} | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!position) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const dismiss = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setPosition(null); };
    const close = () => setPosition(null);
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('pointerdown', dismiss); window.removeEventListener('resize', close); };
  }, [position]);
  async function remove() {
    if (!directory || busy) return;
    setBusy(true);
    try {
      await settings.removeScanDirectory(directory.path);
      await refreshCounts();
      if(location.pathname === `/platform/${encodeURIComponent(agentId!)}`) navigate('/resources');
      setPosition(null);
    } catch(error) { toast.error(String(error)); }
    finally { setBusy(false); }
  }
  const buttonClass = "flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm hover:bg-muted disabled:opacity-50";
  return <>
    <div className="contents" onContextMenu={event => {
      event.preventDefault(); event.stopPropagation();
      if(agentId && (!directory || directory.is_builtin)) return;
      setConfirming(false);
      setPosition({x:Math.max(4,Math.min(event.clientX,window.innerWidth-220)),y:Math.max(4,Math.min(event.clientY,window.innerHeight-140))});
    }}>{children}</div>
    {position && createPortal(<div ref={menuRef} role="menu" aria-label={t('sidebar.projectDirectories')} style={{left:position.x,top:position.y}} className="fixed z-50 min-w-48 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg" onKeyDown={event=>{
      if(event.key==='Escape' || event.key==='Tab')setPosition(null);
      if(event.key==='ArrowDown'||event.key==='ArrowUp') {
        event.preventDefault(); const items=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const index=items.indexOf(document.activeElement as HTMLButtonElement);
        items[(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();
      }
    }}>
      <button role="menuitem" className={buttonClass} onClick={()=>{setEditing(true);setPosition(null);}}>{agentId?<Pencil className="size-4"/>:<Plus className="size-4"/>}{t(agentId?'common.edit':'settings.addDirectory')}</button>
      {agentId && <button role="menuitem" disabled={busy} className={`${buttonClass} text-destructive`} onClick={()=>{if(confirming)void remove();else setConfirming(true);}}><Trash2 className="size-4"/>{t(confirming?'common.confirmDelete':'common.delete')}</button>}
    </div>,document.body)}
    <AddDirectoryDialog open={editing} onOpenChange={setEditing} directory={agentId?directory:null} onAdd={async(path,label)=>{await settings.addScanDirectory(path,label);await refreshCounts();onAdded?.();}} onEdit={async(path,nextPath,label)=>{await settings.updateScanDirectory(path,nextPath,label);await refreshCounts();}}/>
  </>;
}
