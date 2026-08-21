import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { openInFileManager } from "@/lib/openPath";
import { formatPathForDisplay } from "@/lib/path";
import { cn } from "@/lib/utils";

const PLACEHOLDER_PATHS = new Set(["resource.path", "central.path"]);

type OpenableDirectoryPathProps = {
  path: string;
  displayPath?: string;
  className?: string;
};

function isOpenablePath(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed) return false;
  return !PLACEHOLDER_PATHS.has(trimmed);
}

export function OpenableDirectoryPath({
  path,
  displayPath,
  className,
}: OpenableDirectoryPathProps) {
  const { t } = useTranslation();
  const trimmedRawPath = path.trim();
  const displayed = formatPathForDisplay(displayPath ?? path);
  const openLabel = t("common.openInFileManager");

  if (!isOpenablePath(path)) {
    return (
      <p className={cn("mt-0.5 text-sm text-muted-foreground truncate", className)}>
        {displayed}
      </p>
    );
  }

  async function handleClick() {
    try {
      await openInFileManager(trimmedRawPath);
    } catch (err) {
      toast.error(t("common.openPathError", { error: String(err) }));
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      className={cn(
        "mt-0.5 text-sm text-muted-foreground truncate hover:text-primary hover:underline cursor-pointer text-left block max-w-full",
        className
      )}
      title={openLabel}
      aria-label={`${openLabel}: ${displayed}`}
    >
      {displayed}
    </button>
  );
}
