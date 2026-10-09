import { useGitHubImportStore } from "./githubImportStore";
import { useResourceLibraryStore } from "./resourceLibraryStore";
import {
  registerTaskExecutor,
  registerTaskInputRequirement,
  registerTaskResult,
  useTaskQueueStore,
} from "./taskQueueStore";
import type { GitHubRepoPreview, GitHubSkillImportSelection } from "@/types";
import i18n from "@/i18n";
import { toast } from "sonner";

import { invoke } from "@/lib/tauri";
export interface LocalImportPreviewItem {
  skillId: string;
  name: string;
  conflict: boolean;
}
export async function previewLocalImport(sourceDir: string) {
  return invoke<LocalImportPreviewItem[]>("preview_local_resource_skills", {
    sourceDir,
  });
}

export const PREPARE_GITHUB_IMPORT = "prepare_github_resource_import";
const pendingPreviews = new Map<string, Promise<GitHubRepoPreview>>();
useTaskQueueStore.subscribe((state) => {
  for (const requestId of pendingPreviews.keys()) {
    if (!state.tasks.some((task) => task.batchId === requestId &&
      (task.status === "queued" || task.status === "running"))) {
      pendingPreviews.delete(requestId);
    }
  }
});

export function enqueueGitHubImport(
  repoUrl: string,
  preview: GitHubRepoPreview,
  selections: GitHubSkillImportSelection[],
  batchId?: string,
) {
  const chosen = selections.filter((selection) => selection.resolution !== "skip");
  if (!chosen.length) return null;
  const repository = `${preview.repo.owner}/${preview.repo.repo}`.toLowerCase();
  return useTaskQueueStore.getState().enqueue({
    key: `import:${repository}:${JSON.stringify(chosen)}`,
    kind: "import",
    label: repository,
    ...(batchId ? { batchId, batchLabel: repository } : {}),
    locks: [
      `repo:${repository}`,
      ...chosen.map((selection) => `skill:${selection.renamedSkillId ??
        preview.skills.find((item) => item.sourcePath === selection.sourcePath)?.skillId ??
        selection.sourcePath}`),
    ],
    steps: chosen.map((selection) => ({
      command: "import_github_repo_skills",
      label: selection.sourcePath,
      args: { repoUrl, selections: [selection] },
    })),
  });
}

// Reuse the preview already requested by the dialog. A retry after restart previews again.
export function continueGitHubImportInBackground(
  repoUrl: string,
  preview: Promise<GitHubRepoPreview>,
) {
  const key = `prepare-import:${repoUrl.trim().toLowerCase()}`;
  const existing = useTaskQueueStore.getState().tasks.find((task) => task.key === key &&
    ["queued", "running", "awaiting_input"].includes(task.status) && !task.cancelRequested);
  if (existing) return existing.id;
  const requestId = crypto.randomUUID();
  pendingPreviews.set(requestId, preview);
  return useTaskQueueStore.getState().enqueue({
    key,
    kind: "import",
    label: i18n.t("workflow.githubImportTask"),
    batchId: requestId,
    batchLabel: i18n.t("workflow.githubImportTask"),
    steps: [{
      command: PREPARE_GITHUB_IMPORT,
      label: i18n.t("workflow.prepareImport"),
      args: { repoUrl, requestId },
    }],
  });
}

registerTaskExecutor(PREPARE_GITHUB_IMPORT, async (args) => {
  const requestId = String(args.requestId);
  const pending = pendingPreviews.get(requestId);
  try {
    return await (pending ?? useGitHubImportStore.getState().previewGitHubRepoImport(String(args.repoUrl)));
  } finally {
    pendingPreviews.delete(requestId);
  }
});
registerTaskInputRequirement(PREPARE_GITHUB_IMPORT, (result) =>
  (result as GitHubRepoPreview).skills.some((skill) => !!skill.conflict));
registerTaskResult(PREPARE_GITHUB_IMPORT, (step, result) => {
  const queue = useTaskQueueStore.getState();
  const task = queue.tasks.find((task) => task.batchId === step.args.requestId);
  if (!task || task.cancelRequested || task.clearRequested) return;
  const preview = result as GitHubRepoPreview;
  const repository = `${preview.repo.owner}/${preview.repo.repo}`;
  queue.patch(task.id, { label: repository, batchLabel: repository });
  if (step.status === "awaiting_input") {
    toast.info(i18n.t("workflow.importNeedsReview"));
    return;
  }
  if (!preview.skills.length) {
    toast.info(i18n.t("workflow.noImportableSkills"));
    return;
  }
  enqueueGitHubImport(String(step.args.repoUrl), preview, preview.skills.map((skill) => ({
    sourcePath: skill.sourcePath,
    resolution: "overwrite",
  })), task.batchId);
});
for (const command of ["import_github_repo_skills", "add_local_resource_skills"]) {
  registerTaskResult(command, async () => {
    await useResourceLibraryStore.getState().loadResourceLibrary();
  });
}
