import type { Messages } from '../context/LanguageContext'

/**
 * Translate a delivery `status_code` for display. The API also sends a
 * human `status_name`, but that comes from the DB in one language — this
 * maps the stable code to the active UI language, falling back to whatever
 * the API gave us for any code we don't know.
 */
export function statusLabel(t: Messages, code: string, fallback: string): string {
  const table = t.status.byCode as Record<string, string>
  return table[code] ?? fallback
}
