/**
 * Feste Katalog-Filter für die Board-Bibliothek (DE, Klassen 1–13 in der Stufen-Heuristik).
 * Fächerliste inkl. typischer Oberstufen-Fächer (Sek II / EF–Q); Zuordnung per Heuristik aus subject / grade / board_type.
 */

export type LibraryPurposeFilter = '' | 'tasks' | 'games' | 'presentations';

export type LibraryListingCategory = Exclude<LibraryPurposeFilter, ''>;

/** Board-Typen: Übungs- und Quiz-Tafeln. */
const TASK_BOARD_TYPES = new Set(['practice_board', 'quiz_board']);

/** Board-Typen: eher Lehr-/Präsentationskontext (Einstieg, Erklärung, Karte, Simulation). */
const PRESENTATION_BOARD_TYPES = new Set([
  'lesson_intro',
  'explanation_board',
  'map_board',
  'simulation_board',
]);

type SubjectRow = { label: string; patterns: readonly string[] };

/**
 * Reihenfolge: spezifischere Muster zuerst (längere Teilstrings),
 * damit z. B. „Sport“ nicht „Transport“ trifft — hier bewusst Wortgrenzen über includes mit kurzen Tokens.
 */
const SUBJECT_MATCH_ROWS: SubjectRow[] = [
  { label: 'Darstellendes Spiel', patterns: ['darstellendes spiel', 'theater', 'schauspiel'] },
  {
    label: 'Gemeinschaftskunde',
    patterns: [
      'gemeinschaftskunde',
      'sozialkunde',
      'politikwissenschaft',
      'politische bildung',
      'sozialwissenschaften',
      'gemeinschaftskunde/politik',
      'politik',
    ],
  },
  { label: 'Erdkunde', patterns: ['erdkunde', 'geographie', 'geografie', 'länderkunde'] },
  {
    label: 'Betriebswirtschaftslehre',
    patterns: ['betriebswirtschaftslehre', 'betriebswirtschaft', 'bwl'],
  },
  {
    label: 'Volkswirtschaftslehre',
    patterns: ['volkswirtschaftslehre', 'volkswirtschaft', 'vwl'],
  },
  { label: 'Wirtschaftslehre', patterns: ['wirtschaftslehre', 'arbeit wirtschaft technik', 'wiwi', 'wirtschaft'] },
  {
    label: 'Religion',
    patterns: ['religionslehre', 'evangelische religion', 'katholische religion', 'islamische religionslehre', 'konfession', 'religion'],
  },
  { label: 'Naturwissenschaft und Technik', patterns: ['naturwissenschaft und technik', 'nwt ', 'nnt '] },
  { label: 'Sachunterricht', patterns: ['sachunterricht', 'sachkunde', 'heimatkunde'] },
  { label: 'Französisch', patterns: ['französisch', 'franz.'] },
  { label: 'Russisch', patterns: ['russisch'] },
  { label: 'Mathematik', patterns: ['mathematik', 'mathe', 'mathe(', 'mathematics'] },
  { label: 'Geschichte', patterns: ['geschichte', 'geschichtswissenschaft'] },
  { label: 'Informatik', patterns: ['informatik', 'computer', 'computing', 'medienbildung'] },
  { label: 'Deutsch', patterns: ['deutsch', ' deutsch', 'daf', 'daz'] },
  { label: 'Englisch', patterns: ['englisch', ' english', 'esl'] },
  { label: 'Spanisch', patterns: ['spanisch'] },
  { label: 'Italienisch', patterns: ['italienisch'] },
  { label: 'Portugiesisch', patterns: ['portugiesisch'] },
  { label: 'Latein', patterns: ['latein'] },
  { label: 'Griechisch', patterns: ['griechisch', 'altgriechisch', ' neugriechisch'] },
  { label: 'Japanisch', patterns: ['japanisch'] },
  { label: 'Niederländisch', patterns: ['niederländisch', ' niederlande', ' flämisch'] },
  { label: 'Polnisch', patterns: ['polnisch'] },
  { label: 'Türkisch', patterns: ['türkisch', ' tuerkisch'] },
  { label: 'Chinesisch', patterns: ['chinesisch', 'mandarin'] },
  { label: 'Biologie', patterns: ['biologie', 'bio'] },
  { label: 'Chemie', patterns: ['chemie', 'chem.'] },
  { label: 'Physik', patterns: ['physik', 'phys.'] },
  { label: 'Philosophie', patterns: ['philosophie'] },
  { label: 'Seminarfach', patterns: ['seminarfach', 'seminarkurs'] },
  { label: 'Projektkurs', patterns: ['projektkurs', 'projekt-kurs', ' pk ', 'pk-kurs'] },
  { label: 'Vertiefungskurs', patterns: ['vertiefungskurs', 'vertiefungsfach'] },
  { label: 'Geologie', patterns: ['geologie', 'geol.'] },
  { label: 'Ökologie', patterns: ['ökologie', 'oekologie', 'ökologisch'] },
  { label: 'Astronomie', patterns: ['astronomie'] },
  { label: 'Psychologie', patterns: ['psychologie', 'psych.'] },
  { label: 'Pädagogik', patterns: ['pädagogik', 'paedagogik', 'schulpädagogik', ' schulpaedagogik'] },
  {
    label: 'Rechtswissenschaften',
    patterns: ['rechtswissenschaften', ' rechtswissenschaft', 'schulrecht', ' jurastudium', ' jura '],
  },
  { label: 'Literatur', patterns: ['literatur', 'lektürekurs', 'lektuerekurs', ' literaturprojekt'] },
  { label: 'Ethik', patterns: ['ethik', 'werte und normen'] },
  { label: 'Kunst', patterns: ['kunst', ' bildende', ' bildner'] },
  { label: 'Musik', patterns: ['musik', 'musikschule'] },
  { label: 'Sport', patterns: ['sport', 'bewegung', 'turnen', 'sportwissenschaft'] },
  { label: 'Technik', patterns: ['werken', 'gestaltendes werken', 'textilgestaltung', 'metaltechnik', 'technik'] },
];

const LABEL_SET = new Set(SUBJECT_MATCH_ROWS.map((r) => r.label));

export const LIBRARY_SUBJECT_OTHER = 'Andere';

export const LIBRARY_SUBJECT_FILTER_LABELS: readonly string[] = (() => {
  const sorted = [...LABEL_SET].sort((a, b) => a.localeCompare(b, 'de'));
  return [...sorted, LIBRARY_SUBJECT_OTHER];
})();

export const LIBRARY_GRADE_STEPS: readonly string[] = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
];

function normSubj(s: string): string {
  return s.trim().toLowerCase();
}

function rowMatches(norm: string, row: SubjectRow): boolean {
  const nWrapped = ` ${norm.replace(/\s+/g, ' ')} `;
  if (norm === row.label.toLowerCase()) return true;
  for (const p of row.patterns) {
    const raw = p.toLowerCase();
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const useWordBoundary = trimmed.length <= 14 && !raw.startsWith(' ') && !raw.endsWith(' ');
    if (raw.startsWith(' ') || raw.endsWith(' ')) {
      if (nWrapped.includes(raw)) return true;
      continue;
    }
    if (useWordBoundary) {
      try {
        const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(^|[^a-zäöüß])${escaped}($|[^a-zäöüß])`, 'i');
        if (re.test(norm)) return true;
      } catch {
        if (norm.includes(trimmed)) return true;
      }
      continue;
    }
    if (norm === trimmed || norm.includes(trimmed)) return true;
  }
  return false;
}

export function canonicalSubjectLabel(subjectRaw: string): string {
  const norm = normSubj(subjectRaw);
  if (!norm) return LIBRARY_SUBJECT_OTHER;
  for (const row of SUBJECT_MATCH_ROWS) {
    if (rowMatches(norm, row)) return row.label;
  }
  return LIBRARY_SUBJECT_OTHER;
}

/** Kanonische Fach-Labels, die in der aktuellen Katalogliste vorkommen (z. B. Bibliothek-Filter nur mit Treffern). */
export function uniqueCanonicalSubjectLabelsFromRows(
  rows: readonly { subject?: string | null }[],
): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    set.add(canonicalSubjectLabel(row.subject ?? ''));
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'de'));
}

export function matchesLibrarySubjectFilter(subjectRaw: string, filterLabel: string): boolean {
  if (!filterLabel) return true;
  if (filterLabel === LIBRARY_SUBJECT_OTHER) return canonicalSubjectLabel(subjectRaw) === LIBRARY_SUBJECT_OTHER;
  return canonicalSubjectLabel(subjectRaw) === filterLabel;
}

/** Erkennt Klassenstufe 1–13 aus typischen deutschen Angaben (inkl. 10–13). */
export function extractLibraryClassStep(gradeRaw: string): string | null {
  const t = gradeRaw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return null;
  const stepRe = String.raw`(1[0-3]|[1-9])`;
  const bounded = (n: string): string | null => {
    const v = parseInt(n, 10);
    if (Number.isNaN(v) || v < 1 || v > 13) return null;
    return String(v);
  };

  const sequential = [
    new RegExp(String.raw`(?:klasse|kl\.|kl)\s*${stepRe}(?!\d)[a-zäöüß]*`, 'i'),
    new RegExp(String.raw`(?:klasse|kl\.|kl)\s*${stepRe}\b`, 'i'),
    new RegExp(String.raw`(?:jahrgangsstufe|jahrgang|jg\.|jg)\s*${stepRe}\b`, 'i'),
    new RegExp(String.raw`(?:schuljahr|sj)\s*${stepRe}\b`, 'i'),
    new RegExp(String.raw`\b${stepRe}\.\s*klasse\b`, 'i'),
    new RegExp(String.raw`\b${stepRe}te?\s*klasse\b`, 'i'),
    new RegExp(String.raw`^\s*${stepRe}\s*[a-z]{0,2}\s*$`, 'i'),
  ];
  for (const re of sequential) {
    const m = t.match(re);
    if (m) {
      const step = bounded(m[1]);
      if (step) return step;
    }
  }

  const fallback = t.match(new RegExp(String.raw`\b${stepRe}\b`));
  if (fallback) return bounded(fallback[1]);

  const romans: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4', v: '5' };
  const rm = t.match(/\b(i{1,3}|iv|v)\b/i);
  if (rm) {
    const step = romans[rm[1].toLowerCase()];
    if (step) return step;
  }
  return null;
}

export function matchesLibraryGradeFilter(
  gradeRaw: string,
  filterStep: string,
  gradeFrom?: number | null,
  gradeTo?: number | null,
): boolean {
  if (!filterStep) return true;
  const f = parseInt(filterStep, 10);
  if (Number.isNaN(f) || f < 1 || f > 13) return true;

  if (gradeFrom != null && gradeTo != null) {
    const lo = Math.min(gradeFrom, gradeTo);
    const hi = Math.max(gradeFrom, gradeTo);
    return f >= lo && f <= hi;
  }

  const step = extractLibraryClassStep(gradeRaw);
  return step === filterStep;
}

const LISTING_CATEGORY_SET = new Set<string>(['tasks', 'games', 'presentations']);

/** Heuristik wie Backend-Migration: ohne gespeicherte Kategorie aus `board_type` ableiten. */
export function defaultLibraryListingCategoryFromBoardType(boardType: string | undefined): LibraryListingCategory {
  const t = (boardType ?? '').trim();
  if (TASK_BOARD_TYPES.has(t)) return 'tasks';
  if (t === 'interactive_board') return 'games';
  if (PRESENTATION_BOARD_TYPES.has(t)) return 'presentations';
  return 'presentations';
}

export function matchesLibraryPurpose(
  boardType: string | undefined,
  purpose: LibraryPurposeFilter,
  libraryListingCategory?: string | null,
): boolean {
  if (!purpose) return true;
  const cat = (libraryListingCategory ?? '').trim();
  if (LISTING_CATEGORY_SET.has(cat)) {
    return cat === purpose;
  }
  return defaultLibraryListingCategoryFromBoardType(boardType) === purpose;
}
