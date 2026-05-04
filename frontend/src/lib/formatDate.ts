/**
 * Zentrale Datumsformatierung — DRY für Listen, Karten, Toolbar.
 * Sprache: Deutsch (de-DE).
 */

const DATE_OPTS_FULL: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
};

export const formatDate = (iso: string | Date | null | undefined): string => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('de-DE');
  } catch {
    return '—';
  }
};

export const formatDateTime = (iso: string | Date | null | undefined): string => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('de-DE');
  } catch {
    return '—';
  }
};

export const formatLongDate = (date: Date = new Date()): string =>
  date.toLocaleDateString('de-DE', DATE_OPTS_FULL);

export const formatRelative = (iso: string | Date | null | undefined): string => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'gerade eben';
    if (min < 60) return `vor ${min} Min.`;
    const h = Math.floor(min / 60);
    if (h < 24) return `vor ${h} Std.`;
    const days = Math.floor(h / 24);
    if (days === 1) return 'gestern';
    if (days < 7) return `vor ${days} Tagen`;
    return d.toLocaleDateString('de-DE');
  } catch {
    return '—';
  }
};
