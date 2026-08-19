import { toErrorMessage } from "@/lib/errorMessage";

export function webDavErrorDetail(t: (key: string) => string, error: unknown): string {
  const message = toErrorMessage(error);
  if (/timed out/i.test(message)) {
    return t("settings.webdavErrorTimeout");
  }
  if (/connection failed|error sending request|connection reset|connection closed/i.test(message)) {
    return t("settings.webdavErrorConnection");
  }
  if (/status (401|403)\b/i.test(message)) {
    return t("settings.webdavErrorUnauthorized");
  }
  if (/status [45]\d\d\b/i.test(message)) {
    return t("settings.webdavErrorRemote");
  }
  if (/Invalid WebDAV XML|invalid percent encoding|unsafe filename/i.test(message)) {
    return t("settings.webdavErrorResponse");
  }
  if (
    /URL cannot be empty|URL is invalid|URL must use|URL must not include|remote path|path segments/i.test(
      message
    )
  ) {
    return t("settings.webdavErrorConfig");
  }
  if (/size limit/i.test(message)) {
    return t("settings.webdavErrorTooLarge");
  }
  if (/backup export failed/i.test(message)) {
    return t("settings.webdavErrorExport");
  }
  if (/^WebDAV (list|test|upload|download|delete) failed:/i.test(message)) {
    return t("settings.webdavErrorRemote");
  }
  return t("settings.webdavErrorUnknown");
}
