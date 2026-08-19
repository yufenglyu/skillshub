export function toErrorMessage(error: unknown): string {
  if (error == null) {
    return "";
  }
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message.trim() || error.toString();
  }
  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    for (const key of ["message", "error", "msg"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }
    try {
      const json = JSON.stringify(error);
      if (json && json !== "{}" && json !== "[]") {
        return json;
      }
    } catch {
      // Ignore objects that cannot be serialized.
    }
  }
  const text = String(error);
  return text === "[object Object]" ? "" : text;
}
