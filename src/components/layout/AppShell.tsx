import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { GlobalSearchDialog } from "./GlobalSearchDialog";
import { usePlatformStore } from "@/stores/platformStore";
import { useCentralSkillsStore } from "@/stores/centralSkillsStore";
import { useDiscoverStore } from "@/stores/discoverStore";
import { useResourceLibraryStore } from "@/stores/resourceLibraryStore";

/**
 * Top-level app shell: sidebar + scrollable main content area.
 * Triggers the initial platform scan on mount.
 */
export function AppShell() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);
  const { pathname } = useLocation();

  const initialize = usePlatformStore((s) => s.initialize);
  const rescan = usePlatformStore((s) => s.rescan);
  const loadCentralSkills = useCentralSkillsStore((s) => s.loadCentralSkills);
  const loadResourceLibrary = useResourceLibraryStore((s) => s.loadResourceLibrary);
  const rescanDiscoverFromDisk = useDiscoverStore((s) => s.rescanFromDisk);

  useEffect(() => {
    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mainRef.current) return;
    mainRef.current.scrollTop = 0;
  }, [pathname]);

  async function handleGlobalRescan() {
    await rescan();
    await Promise.allSettled([
      loadCentralSkills(),
      loadResourceLibrary(),
      rescanDiscoverFromDisk(),
    ]);
  }

  function handleAction(action: string) {
    switch (action) {
      case "rescan":
        void handleGlobalRescan();
        break;
    }
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <main ref={mainRef} className="flex-1 min-h-0 min-w-0 overflow-hidden">
        <Outlet />
      </main>
      <GlobalSearchDialog
        open={isSearchOpen}
        onOpenChange={setIsSearchOpen}
        onAction={handleAction}
      />
    </div>
  );
}
