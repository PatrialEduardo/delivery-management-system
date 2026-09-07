/**
 * `YYYY-MM-DD` for the given date in the *browser's* local timezone.
 *
 * `Date.prototype.toISOString()` converts to UTC first, so near midnight it
 * can report yesterday/tomorrow. The date pickers in this app work in the
 * user's local day, so we format from the local getters instead.
 */
export function toLocalISODate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** `dd/MM/yyyy` from a `YYYY-MM-DD` string — display only, no timezone math. */
export function isoToBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}
