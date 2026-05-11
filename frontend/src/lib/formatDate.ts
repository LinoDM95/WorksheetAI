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

/** Countdown bis Ablauf (Schüler-Link / QR): „noch 2 Std. 15 Min.“ / „abgelaufen“. */
export const formatTimeRemainingUntil = (
  iso: string | Date | null | undefined,
  nowMs: number = Date.now(),
): string => {
  if (!iso) return '—';
  try {
    const end = new Date(iso).getTime();
    if (Number.isNaN(end)) return '—';
    const diff = end - nowMs;
    if (diff <= 0) return 'abgelaufen';
    const totalMin = Math.floor(diff / 60000);
    if (totalMin < 1) return 'noch unter 1 Min.';
    const days = Math.floor(totalMin / (60 * 24));
    const hours = Math.floor((totalMin % (60 * 24)) / 60);
    const mins = totalMin % 60;
    const parts: string[] = [];
    if (days > 0) parts.push(`${days} Tag${days === 1 ? '' : 'e'}`);
    if (hours > 0) parts.push(`${hours} Std.`);
    if (mins > 0) parts.push(`${mins} Min.`);
    if (parts.length === 0) return 'noch unter 1 Min.';
    return `noch ${parts.join(' ')}`;
  } catch {
    return '—';
  }
};

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
