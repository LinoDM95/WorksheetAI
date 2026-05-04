import type { Pattern } from '../types';

const STORAGE_KEY = 'worksheetai_owned_pattern_ids';

const readIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map((x) => String(x)));
  } catch {
    return new Set();
  }
};

const writeIds = (ids: Set<string>) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
};

/** System-Vorlagen (Backend `is_system`) sind ohne Kauf nutzbar. */
export const isPatternUnlocked = (p: Pattern): boolean => {
  if (p.is_system) return true;
  return readIds().has(String(p.id));
};

/** Demo-Kauf: legt die ID lokal ab (kein echtes Payment). */
export const unlockPattern = (patternId: string): void => {
  const ids = readIds();
  ids.add(String(patternId));
  writeIds(ids);
  window.dispatchEvent(new CustomEvent('worksheetai:patterns-unlocked'));
};

function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Anzeige-Preis für kaufbare (nicht-system) Vorlagen, stabil pro ID. */
export const formatPatternPrice = (p: Pattern): string => {
  if (p.is_system) return 'Inklusive';
  const cents = 399 + (stableHash(String(p.id)) % 401);
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
};
