/**
 * Parses the JSON status messages stored on queue items.
 * Each message object has an optional title and an array of messages.
 * Returns a flat array of non-empty strings.
 */
export function parseStatusMessages(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .flatMap((m: { title?: string; messages?: string[] }) => [
        m.title || "",
        ...(m.messages || []),
      ])
      .filter(Boolean);
  } catch {
    return [];
  }
}
