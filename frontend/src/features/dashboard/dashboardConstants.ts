import type { BoardLibraryItem } from '../boards/types';
import type { SubjectAccent } from './dashboardTypes';

export const greetingByHour = (h: number): string => {
  if (h < 5) return 'Schöne Nacht';
  if (h < 11) return 'Guten Morgen';
  if (h < 14) return 'Hallo';
  if (h < 18) return 'Schönen Nachmittag';
  return 'Guten Abend';
};

/** Saisonale Schlagwörter für den jeweiligen Monat. Greift in der öffentlichen Bibliothek. */
export const SEASONAL_KEYWORDS_BY_MONTH: Record<number, { label: string; keywords: string[] }> = {
  1: { label: 'Winter & Neujahr', keywords: ['winter', 'schnee', 'neujahr', 'januar', 'eis'] },
  2: { label: 'Karneval & Winter', keywords: ['karneval', 'fasching', 'fasnacht', 'winter', 'eis', 'februar'] },
  3: { label: 'Frühling beginnt', keywords: ['frühling', 'frühjahr', 'ostern', 'märz', 'küken', 'frühblüher'] },
  4: { label: 'Frühling & Ostern', keywords: ['frühling', 'ostern', 'aprilwetter', 'tier', 'küken', 'wiese'] },
  5: { label: 'Mai, Frühling & Pfingsten', keywords: ['frühling', 'mai', 'pfingsten', 'biene', 'blume', 'wiese', 'wetter'] },
  6: { label: 'Sommer beginnt', keywords: ['sommer', 'juni', 'sonne', 'wiese', 'wasser', 'em', 'wm', 'fußball'] },
  7: { label: 'Sommer & Ferien', keywords: ['sommer', 'ferien', 'juli', 'urlaub', 'meer', 'reise', 'lesen'] },
  8: { label: 'Spätsommer', keywords: ['sommer', 'august', 'urlaub', 'wasser', 'meer'] },
  9: { label: 'Schulanfang & Herbst', keywords: ['schulanfang', 'einschulung', 'herbst', 'september', 'apfel', 'erntedank'] },
  10: { label: 'Herbst & Halloween', keywords: ['herbst', 'halloween', 'oktober', 'kürbis', 'kastanie', 'blatt', 'wetter'] },
  11: { label: 'Herbst & St. Martin', keywords: ['herbst', 'sankt martin', 'st. martin', 'november', 'laterne', 'nebel'] },
  12: { label: 'Weihnachten & Winter', keywords: ['weihnachten', 'advent', 'nikolaus', 'winter', 'dezember', 'schnee'] },
};

/**
 * Beliebtheits-Score: Bewertung gewichtet mit log(1+Anzahl).
 * So gewinnen Boards mit echtem Konsens — nicht „1× 5,0“.
 */
export const popularityScore = (b: BoardLibraryItem): number => {
  const r = b.avg_rating ?? 0;
  const c = b.rating_count ?? 0;
  return r * Math.log(1 + c);
};

export const matchesAnyKeyword = (b: BoardLibraryItem, keys: string[]): boolean => {
  const hay = `${b.title} ${b.subject} ${b.grade} ${b.topic} ${b.description ?? ''}`.toLowerCase();
  return keys.some((k) => hay.includes(k.toLowerCase()));
};

/** Default-Schlagwortteppich, falls die Bibliothek noch leer ist. */
export const FALLBACK_SUBJECT_CHIPS = [
  'Mathematik',
  'Deutsch',
  'Englisch',
  'Sachunterricht',
  'Biologie',
  'Geschichte',
  'Erdkunde',
  'Physik',
  'Chemie',
  'Musik',
  'Kunst',
  'Sport',
];

/** Stabile Farbpalette pro kanonischem Fach — psychologisch gewählt (kühl/warm passend). */
export const SUBJECT_ACCENTS: Record<string, SubjectAccent> = {
  Mathematik: { bg: 'bg-indigo-100', fg: 'text-indigo-700', pill: 'bg-indigo-600/90 text-white' },
  Deutsch: { bg: 'bg-amber-100', fg: 'text-amber-800', pill: 'bg-amber-600/90 text-white' },
  Englisch: { bg: 'bg-rose-100', fg: 'text-rose-700', pill: 'bg-rose-600/90 text-white' },
  Sachunterricht: { bg: 'bg-emerald-100', fg: 'text-emerald-700', pill: 'bg-emerald-600/90 text-white' },
  Biologie: { bg: 'bg-emerald-100', fg: 'text-emerald-700', pill: 'bg-emerald-600/90 text-white' },
  Physik: { bg: 'bg-sky-100', fg: 'text-sky-700', pill: 'bg-sky-600/90 text-white' },
  Chemie: { bg: 'bg-teal-100', fg: 'text-teal-700', pill: 'bg-teal-600/90 text-white' },
  Geschichte: { bg: 'bg-stone-100', fg: 'text-stone-700', pill: 'bg-stone-600/90 text-white' },
  Erdkunde: { bg: 'bg-lime-100', fg: 'text-lime-800', pill: 'bg-lime-600/90 text-white' },
  Musik: { bg: 'bg-fuchsia-100', fg: 'text-fuchsia-700', pill: 'bg-fuchsia-600/90 text-white' },
  Kunst: { bg: 'bg-orange-100', fg: 'text-orange-700', pill: 'bg-orange-600/90 text-white' },
  Sport: { bg: 'bg-cyan-100', fg: 'text-cyan-700', pill: 'bg-cyan-600/90 text-white' },
  Informatik: { bg: 'bg-violet-100', fg: 'text-violet-700', pill: 'bg-violet-600/90 text-white' },
  Religion: { bg: 'bg-yellow-100', fg: 'text-yellow-800', pill: 'bg-yellow-600/90 text-white' },
  Ethik: { bg: 'bg-yellow-100', fg: 'text-yellow-800', pill: 'bg-yellow-600/90 text-white' },
};

export const FALLBACK_ACCENT: SubjectAccent = {
  bg: 'bg-slate-100',
  fg: 'text-slate-700',
  pill: 'bg-slate-600/90 text-white',
};

export const subjectAccent = (label: string): SubjectAccent => SUBJECT_ACCENTS[label] ?? FALLBACK_ACCENT;
