# UI Theme Toolbar Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up platform/sidebar controls, central/resource library toolbars, and replace the configurable Catppuccin theme UI with a simple VS Code-style system/light/dark cycle.

**Architecture:** Keep view behavior in existing React pages and Zustand stores. Sidebar and top bar remain the app shell controls; library pages own their own search/view/sort toolbar. Theme mode persists through the existing theme store and is applied as `data-theme` on `<html>`.

**Tech Stack:** React 18, TypeScript, Zustand, Tailwind CSS 4, Vitest, Vite.

## Global Constraints

- User-visible text goes through i18n.
- Theme switching cycles `system -> light -> dark -> system`.
- Only two concrete themes are rendered: VS Code-like light and VS Code-like dark.
- Settings/About no longer exposes theme flavor or accent controls.
- Central skills page keeps only view switching from the old sort/view toolbar.
- Resource library page gains sorting behavior migrated from central skills.

---

### Task 1: Sidebar Platform Header

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/i18n/locales/zh.json`
- Modify: `src/i18n/locales/en.json`
- Test: `src/test/Sidebar.test.tsx`

**Interfaces:**
- Consumes: existing `showAllPlatforms` state and toggle.
- Produces: platform section title plus icon-only toggle with accessible label.

- [x] Add tests expecting a `软件平台` heading and an icon-only show/hide toggle in the same section header.
- [x] Run `pnpm test -- src/test/Sidebar.test.tsx` and verify the new assertions fail.
- [x] Update Sidebar markup to move the toggle into the title row and hide text visually.
- [x] Run `pnpm test -- src/test/Sidebar.test.tsx`.

### Task 2: Library Toolbar Changes

**Files:**
- Modify: `src/pages/CentralSkillsView.tsx`
- Modify: `src/pages/ResourceLibraryView.tsx`
- Modify: `src/i18n/locales/zh.json`
- Modify: `src/i18n/locales/en.json`
- Test: `src/test/CentralSkillsView.test.tsx`
- Test: `src/test/ResourceLibraryView.test.tsx`

**Interfaces:**
- Consumes: existing `SkillListModeToggle`.
- Produces: central toolbar without source/GitHub buttons or sort controls; resource toolbar with GitHub icon, refresh icon, manual create, sort, and view controls.

- [x] Add tests that central skills no longer renders source update, GitHub import, or sort controls.
- [x] Add tests that resource library renders sorting controls and icon-bearing GitHub/update buttons.
- [x] Run targeted toolbar tests and verify failures.
- [x] Remove central actions and sort UI.
- [x] Add resource sorting state, sorted list derivation, and sort controls.
- [x] Run targeted toolbar tests.

### Task 3: Theme Cycle And VS Code Variables

**Files:**
- Modify: `src/stores/themeStore.ts`
- Modify: `src/components/layout/TopBar.tsx`
- Modify: `src/index.css`
- Modify: `src/i18n/locales/zh.json`
- Modify: `src/i18n/locales/en.json`
- Test: theme/topbar/settings tests.

**Interfaces:**
- Produces: `themeMode` or equivalent persisted mode and a `cycleThemeMode()` store action.
- Produces: a top-bar icon button next to settings.

- [x] Add tests for theme mode cycling and top-bar button behavior.
- [x] Run tests and verify failures.
- [x] Replace flavor/accent application with system/light/dark mode application.
- [x] Add top-bar icon button with accessible label and title.
- [x] Replace theme CSS variables with VS Code-like light/dark values.
- [x] Run theme/topbar tests.

### Task 4: Settings Theme UI Removal

**Files:**
- Modify: `src/pages/SettingsView.tsx`
- Modify: `src/test/SettingsView.test.tsx`

**Interfaces:**
- Consumes: no theme store values in settings.
- Produces: no theme flavor/accent controls in Settings/About.

- [x] Update settings tests to assert theme flavor/accent UI is absent.
- [x] Run settings tests and verify failures.
- [x] Remove theme flavor and accent UI and unused selectors/imports.
- [x] Run settings tests.

### Task 5: Verification

- [x] Run all changed frontend tests.
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm build`.
- [x] Review `git diff` for unintended unrelated churn.
