import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { PlatformView } from "@/pages/PlatformView";
import { CentralSkillsView } from "@/pages/CentralSkillsView";
import { ResourceLibraryView } from "@/pages/ResourceLibraryView";
import { SkillDetailPage } from "@/pages/SkillDetailPage";
import { CollectionsListView } from "@/pages/CollectionsListView";
import { SettingsView } from "@/pages/SettingsView";

function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell />}>
        {/* Default redirect to Skill Repository */}
        <Route index element={<Navigate to="/resources" replace />} />
        {/* Platform view: lists skills for a specific agent */}
        <Route path="platform/:agentId" element={<PlatformView />} />
        {/* Shared Hub: canonical ~/.agents/skills/ view */}
        <Route path="central" element={<CentralSkillsView />} />
        {/* Skill Repository: downloaded/imported skill source library */}
        <Route path="resources" element={<ResourceLibraryView />} />
        {/* Skill detail page */}
        <Route path="skill/:skillId" element={<SkillDetailPage />} />
        {/* Skill Bundles */}
        <Route path="collections" element={<CollectionsListView />} />
        {/* Settings */}
        <Route path="settings" element={<SettingsView />} />
      </Route>
    </Routes>
  );
}

export default App;
