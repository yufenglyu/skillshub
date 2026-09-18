import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { toast, Toaster } from "sonner";
import App from "./App";
import "./index.css";
// Initialize i18n before rendering the app
import i18n from "./i18n";
// Load file-backed preferences before rendering.
import { useThemeStore } from "./stores/themeStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useShortcutStore } from "./stores/shortcutStore";

async function start() {
  try {
    await Promise.all([useThemeStore.getState().init(), useSettingsStore.getState().loadLanguage(), useShortcutStore.getState().init()]);
  } catch {
    toast.error(i18n.t("settings.configLoadFailed"));
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
        <Toaster position="bottom-right" richColors />
      </BrowserRouter>
    </React.StrictMode>
  );
}

void start();
