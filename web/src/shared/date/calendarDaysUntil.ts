/** Calendar-day deadlines are dates, not UTC-midnight instants. */
export function calendarDaysUntil(value?: string | null, now = new Date()): number | null {
  if (!value || Number.isNaN(now.getTime())) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  let target: Date;
  if (dateOnly) {
    const [, year, month, day] = dateOnly.map(Number);
    target = new Date(year, month - 1, day, 12);
    if (target.getFullYear() !== year || target.getMonth() !== month - 1 || target.getDate() !== day) return null;
  } else {
    target = new Date(value);
  }
  if (Number.isNaN(target.getTime())) return null;
  // Compare date ordinals, so 23/25-hour DST days still count as one day.
  const ordinal = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
  return ordinal(target) - ordinal(now);
}
