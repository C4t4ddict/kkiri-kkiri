export const shortcutIds = ['notifications', 'favorites', 'applications', 'templates', 'friends', 'messages', 'curriculum', 'portfolio', 'archive', 'activity', 'matching', 'calendar'] as const;
export type ShortcutId = typeof shortcutIds[number];
export const defaultShortcuts: ShortcutId[] = ['notifications', 'favorites', 'applications', 'templates', 'friends', 'messages'];
export function normalizeShortcuts(value: unknown): ShortcutId[] {
  if (!Array.isArray(value)) return [...defaultShortcuts];
  const result = [...new Set(value.filter((id): id is ShortcutId => shortcutIds.includes(id)))];
  return result.length ? result : [...defaultShortcuts];
}
export function moveShortcut(items: ShortcutId[], index: number, delta: number) {
  const next = [...items];
  if (index < 0 || index >= next.length || index + delta < 0 || index + delta >= next.length) return next;
  [next[index], next[index + delta]] = [next[index + delta], next[index]];
  return next;
}
