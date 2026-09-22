import { previewLocalImport } from "@/stores/importPreparationStore";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { useGitHubImportStore } from "@/stores/githubImportStore";
import { registerTaskResult, taskErrorMessage, useTaskQueueStore } from "@/stores/taskQueueStore";
import { useResourceLibraryStore } from "@/stores/resourceLibraryStore";
import type { GitHubSkillImportSelection } from "@/types";
import { GitHubRepoImportWizard } from "@/components/github-import/GitHubRepoImportWizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

for (const command of [
  "import_github_repo_skills",
  "add_local_resource_skills",
]) {
  registerTaskResult(command, async () => {
    await useResourceLibraryStore.getState().loadResourceLibrary();
  });
}
export function AddSkillsDialog({
  open: visible,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [repo, setRepo] = useState("");
  const [path, setPath] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const request = useRef(0);
  const store = useGitHubImportStore();
  function close() {
    request.current++;
    setPreparing(false);
    setError(null);
    setWizard(false);
    onOpenChange(false);
  }
  function queueGitHub(selections: GitHubSkillImportSelection[]) {
    const chosen = selections.filter((s) => s.resolution !== "skip");
    if (!chosen.length) return;
    const preview = useGitHubImportStore.getState().githubImport.preview;
    const lock = preview
      ? `${preview.repo.owner}/${preview.repo.repo}`.toLowerCase()
      : repo.toLowerCase();
    useTaskQueueStore
      .getState()
      .enqueue({
        key: `import:${lock}:${JSON.stringify(chosen)}`,
        kind: "import",
        label: lock,
        locks: [
          `repo:${lock}`,
          ...chosen.map(
            (s) =>
              `skill:${s.renamedSkillId ?? preview?.skills.find((item) => item.sourcePath === s.sourcePath)?.skillId ?? s.sourcePath}`,
          ),
        ],
        steps: chosen.map((selection) => ({
          command: "import_github_repo_skills",
          label: selection.sourcePath,
          args: { repoUrl: repo.trim(), selections: [selection] },
        })),
      });
    close();
  }
  async function add(source: "github" | "local") {
    const token = ++request.current;
    setPreparing(true);
    setError(null);
    try {
      if (source === "github") {
        const preview = await store.previewGitHubRepoImport(repo.trim());
        if (token !== request.current) return;
        if (!preview.skills.length) {
          toast.info(t("workflow.noImportableSkills"));
          return;
        }
        if (preview.skills.some((skill) => skill.conflict)) {
          setWizard(true);
          return;
        }
        queueGitHub(
          preview.skills.map((skill) => ({
            sourcePath: skill.sourcePath,
            resolution: "overwrite",
          })),
        );
      } else {
        const items = await previewLocalImport(path.trim());
        if (token !== request.current) return;
        const selected = items.filter((item) => !item.conflict || overwrite);
        if (!selected.length) {
          toast.info(t("workflow.noImportableSkills"));
          return;
        }
        useTaskQueueStore
          .getState()
          .enqueue({
            key: `local:${path.trim().toLowerCase()}:${selected.map((s) => s.skillId).join(",")}`,
            kind: "import",
            label: t("resource.localAddTitle"),
            locks: [
              "local-import",
              ...selected.map((s) => `skill:${s.skillId}`),
            ],
            steps: selected.map((item) => ({
              command: "add_local_resource_skills",
              label: item.name,
              args: {
                input: {
                  sourceDir: path.trim(),
                  overwrite,
                  selectedSkillIds: [item.skillId],
                },
              },
            })),
          });
        close();
      }
    } catch (cause) {
      if (token === request.current) {
        const message = taskErrorMessage(cause, "import");
        setError(message);
        toast.error(message);
      }
    } finally {
      if (token === request.current) setPreparing(false);
    }
  }
  return (
    <>
      <Dialog
        open={visible && !wizard}
        onOpenChange={(value) => {
          if (!value) close();
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("resource.addSkills")}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-4 py-2">
            <label htmlFor="add-github">GitHub</label>
            <Input
              id="add-github"
              value={repo}
              disabled={preparing}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="owner/repo"
            />
            <Button
              disabled={preparing || !repo.trim()}
              onClick={() => void add("github")}
            >
              {t("common.import")}
            </Button>
            <label htmlFor="add-local">{t("workflow.local")}</label>
            <div className="relative min-w-0">
              <Input
                id="add-local"
                className="pr-10"
                value={path}
                disabled={preparing}
                onChange={(e) => setPath(e.target.value)}
                placeholder={t("workflow.localFolderPlaceholder")}
              />
              <Button
                className="absolute right-1 top-1/2 -translate-y-1/2"
                size="icon-sm"
                variant="ghost"
                title={t("common.browse")}
                aria-label={t("common.browse")}
                disabled={preparing}
                onClick={async () => {
                  try {
                    const result = await open({
                      directory: true,
                      multiple: false,
                    });
                    if (typeof result === "string") setPath(result);
                  } catch {
                    toast.error(t("workflow.operationFailed"));
                  }
                }}
              >
                <FolderOpen className="size-4" />
              </Button>
            </div>
            <Button
              disabled={preparing || !path.trim()}
              onClick={() => void add("local")}
            >
              {t("common.add")}
            </Button>
            <label className="col-start-2 col-span-2 flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={overwrite}
                disabled={preparing}
                onChange={(e) => setOverwrite(e.target.checked)}
              />
              {t("workflow.overwriteLocal")}
            </label>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <GitHubRepoImportWizard
        open={visible && wizard}
        onOpenChange={(value) => {
          if (!value) {
            setWizard(false);
            onOpenChange(false);
          }
        }}
        repoUrl={repo}
        onRepoUrlChange={setRepo}
        preview={store.githubImport.preview}
        previewError={store.githubImport.error}
        isPreviewLoading={store.githubImport.isPreviewLoading}
        isImporting={false}
        importResult={null}
        onPreview={() => store.previewGitHubRepoImport(repo)}
        onReset={store.resetGitHubImport}
        launcherLabel={t("resource.addSkills")}
        onImport={queueGitHub}
      />
    </>
  );
}
