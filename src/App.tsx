import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { PlatformView } from "@/pages/PlatformView";
import { CentralSkillsView } from "@/pages/CentralSkillsView";
import { ResourceLibraryView } from "@/pages/ResourceLibraryView";
import { SkillDetailPage } from "@/pages/SkillDetailPage";
import { CollectionsListView } from "@/pages/CollectionsListView";
import { SettingsView } from "@/pages/SettingsView";
import { DiscoverView } from "@/pages/DiscoverView";
import { ObsidianVaultView } from "@/pages/ObsidianVaultView";

function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell />}>
        {/* Default redirect to Skill Resource Library */}
        <Route index element={<Navigate to="/resources" replace />} />
        {/* Platform view: lists skills for a specific agent */}
        <Route path="platform/:agentId" element={<PlatformView />} />
        {/* Central Skills: canonical ~/.agents/skills/ view */}
        <Route path="central" element={<CentralSkillsView />} />
        {/* Resource Library: downloaded/imported skill source library */}
        <Route path="resources" element={<ResourceLibraryView />} />
        {/* Skill detail page */}
        <Route path="skill/:skillId" element={<SkillDetailPage />} />
        {/* Collections */}
        <Route path="collections" element={<CollectionsListView />} />
        {/* Discover project skills */}
        <Route path="discover" element={<DiscoverView />} />
        {/* Discover filtered by project */}
        <Route path="discover/:projectPath" element={<DiscoverView />} />
        {/* Obsidian vault source view */}
        <Route path="obsidian/:vaultId" element={<ObsidianVaultView />} />
        {/* Settings */}
        <Route path="settings" element={<SettingsView />} />
      </Route>
    </Routes>
  );
}

export default App;
