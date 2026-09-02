import { RefObject, ReactNode, useEffect, useId, useRef } from "react";
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPortal,
} from "@/components/ui/dialog";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { SkillDetailView } from "@/components/skill/SkillDetailView";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SkillDetailDrawerProps {
  open: boolean;
  skillId: string | null;
  agentId?: string | null;
  rowId?: string | null;
  onOpenChange: (open: boolean) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  children?: ReactNode;
}

export function SkillDetailDrawer({
  open,
  skillId,
  agentId,
  rowId,
  onOpenChange,
  returnFocusRef,
  children,
}: SkillDetailDrawerProps) {
  const titleId = useId();
  const showContent = open && (skillId !== null || children != null);
  const lastReturnFocusRef = useRef<RefObject<HTMLElement | null> | null>(null);

  useEffect(() => {
    if (returnFocusRef) {
      lastReturnFocusRef.current = returnFocusRef;
    }
  }, [returnFocusRef]);

  useEffect(() => {
    if (open) {
      return;
    }
    const target =
      returnFocusRef?.current ??
      lastReturnFocusRef.current?.current ??
      document.body;
    target?.focus?.();
  }, [open, returnFocusRef]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogPortal keepMounted={false}>
        <DialogOverlay
          data-testid="skill-detail-drawer-overlay"
          className="bg-black/30 md:left-[var(--app-sidebar-width,56px)]"
        />
        <DialogPrimitive.Popup
          role="dialog"
          aria-modal="true"
          aria-labelledby={showContent ? titleId : undefined}
          data-testid="skill-detail-drawer"
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex h-full w-screen flex-col bg-background shadow-2xl ring-1 ring-border outline-none md:w-[calc(100vw-var(--app-sidebar-width,56px))]"
          )}
        >
          <div className="flex h-10 shrink-0 items-center justify-end border-b border-border px-2">
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close"
                />
              }
            >
              <XIcon />
            </DialogClose>
          </div>
          <div className="min-h-0 flex-1">
            {showContent
              ? (children ?? (
                  <SkillDetailView
                    skillId={skillId ?? undefined}
                    agentId={agentId ?? undefined}
                    rowId={rowId ?? undefined}
                    variant="drawer"
                    leading={null}
                    onRequestClose={() => onOpenChange(false)}
                    titleId={titleId}
                  />
                ))
              : null}
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
