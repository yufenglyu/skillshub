import { ActionIcon } from "@/components/ui/action-icon";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { findFolderNote, useMetadataStore } from "@/stores/metadataStore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
export function FolderNotesEditor({ skillIds }: { skillIds: string[] }) {
  const { t } = useTranslation();
  const error = useMetadataStore((s) => s.folderError);
  const folders = useMetadataStore((s) => s.folders);
  const note = findFolderNote(folders, skillIds);
  const identity = note?.id ?? skillIds.join("|");
  const [value, setValue] = useState(note?.notes ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setValue(note?.notes ?? "");
  }, [identity, note?.notes]);
  async function save(notes: string) {
    setBusy(true);
    try {
      await useMetadataStore
        .getState()
        .saveFolder({ id: note?.id ?? crypto.randomUUID(), notes, skillIds });
      setValue(notes);
    } catch {
      toast.error(t("workflow.operationFailed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="flex flex-col gap-3">
      {error && (
        <p className="text-xs text-destructive">
          {t("workflow.operationFailed")}
        </p>
      )}
      <label className="block text-xs text-muted-foreground">
        {t("workflow.folderNotes")}
        <Textarea
          className="mt-2"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
        />
      </label>
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void save(value)}
        ><ActionIcon action="save"/>
          {t("common.save")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void save("")}
        ><ActionIcon action="delete"/>
          {t("workflow.clear")}
        </Button>
      </div>
    </section>
  );
}
