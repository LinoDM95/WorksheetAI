import { describe, expect, it } from 'vitest';

import {
  canonicalSubjectLabel,
  extractLibraryClassStep,
  matchesLibraryGradeFilter,
  matchesLibraryPurpose,
  matchesLibrarySubjectFilter,
  uniqueCanonicalSubjectLabelsFromRows,
  LIBRARY_SUBJECT_OTHER,
} from './libraryCatalogFilters';

describe('libraryCatalogFilters', () => {
  it('canonicalSubjectLabel maps common spellings', () => {
    expect(canonicalSubjectLabel('Mathe')).toBe('Mathematik');
    expect(canonicalSubjectLabel('mathematics')).toBe('Mathematik');
    expect(canonicalSubjectLabel('Deutsch')).toBe('Deutsch');
    expect(canonicalSubjectLabel('Geschichte Kl. 9')).toBe('Geschichte');
    expect(canonicalSubjectLabel('Philosophie LK')).toBe('Philosophie');
    expect(canonicalSubjectLabel('Ethik')).toBe('Ethik');
    expect(canonicalSubjectLabel('BWL Q2')).toBe('Betriebswirtschaftslehre');
    expect(canonicalSubjectLabel('VWL Oberstufe')).toBe('Volkswirtschaftslehre');
    expect(canonicalSubjectLabel('Altgriechisch')).toBe('Griechisch');
    expect(canonicalSubjectLabel('')).toBe(LIBRARY_SUBJECT_OTHER);
    expect(canonicalSubjectLabel('Unbekanntes Lehrplanthema')).toBe(LIBRARY_SUBJECT_OTHER);
  });

  it('matchesLibrarySubjectFilter respects Andere', () => {
    expect(matchesLibrarySubjectFilter('Mathe', 'Mathematik')).toBe(true);
    expect(matchesLibrarySubjectFilter('Mathe', LIBRARY_SUBJECT_OTHER)).toBe(false);
    expect(matchesLibrarySubjectFilter('Exotisches Fach', LIBRARY_SUBJECT_OTHER)).toBe(true);
  });

  it('extractLibraryClassStep reads German class strings', () => {
    expect(extractLibraryClassStep('Klasse 5a')).toBe('5');
    expect(extractLibraryClassStep('5')).toBe('5');
    expect(extractLibraryClassStep('10')).toBe('10');
    expect(extractLibraryClassStep('11')).toBe('11');
    expect(extractLibraryClassStep('Klasse 11')).toBe('11');
    expect(extractLibraryClassStep('Klasse 13b')).toBe('13');
    expect(extractLibraryClassStep('Q1')).toBe(null);
    expect(matchesLibraryGradeFilter('Kl. 7b', '7')).toBe(true);
    expect(matchesLibraryGradeFilter('12', '5')).toBe(false);
    expect(matchesLibraryGradeFilter('Jahrgangsstufe 12', '12')).toBe(true);
    expect(matchesLibraryGradeFilter('irrelevant', '6', 5, 8)).toBe(true);
    expect(matchesLibraryGradeFilter('irrelevant', '4', 5, 8)).toBe(false);
    expect(matchesLibraryGradeFilter('irrelevant', '8', 10, 5)).toBe(true);
  });

  it('canonicalSubjectLabel maps Oberstufe-Fächer', () => {
    expect(canonicalSubjectLabel('Seminarfach Q2')).toBe('Seminarfach');
    expect(canonicalSubjectLabel('Projektkurs')).toBe('Projektkurs');
    expect(canonicalSubjectLabel('Geologie Oberstufe')).toBe('Geologie');
  });

  it('uniqueCanonicalSubjectLabelsFromRows dedupes, sorts, maps unmapped to Andere', () => {
    expect(uniqueCanonicalSubjectLabelsFromRows([{ subject: 'Mathe' }, { subject: 'Mathematik Q1' }])).toEqual([
      'Mathematik',
    ]);
    expect(uniqueCanonicalSubjectLabelsFromRows([{ subject: '' }, { subject: 'Exotisch' }])).toEqual(['Andere']);
    expect(uniqueCanonicalSubjectLabelsFromRows([{ subject: 'Deutsch' }, { subject: 'Englisch' }])).toEqual([
      'Deutsch',
      'Englisch',
    ]);
  });

  it('matchesLibraryPurpose uses listing category when set', () => {
    expect(matchesLibraryPurpose('interactive_board', 'tasks', 'tasks')).toBe(true);
    expect(matchesLibraryPurpose('practice_board', 'games', 'games')).toBe(true);
    expect(matchesLibraryPurpose('lesson_intro', 'presentations', 'presentations')).toBe(true);
    expect(matchesLibraryPurpose('interactive_board', 'tasks', 'games')).toBe(false);
  });

  it('matchesLibraryPurpose falls back to board type when category missing', () => {
    expect(matchesLibraryPurpose('quiz_board', 'tasks')).toBe(true);
    expect(matchesLibraryPurpose('lesson_intro', 'presentations')).toBe(true);
    expect(matchesLibraryPurpose('interactive_board', 'games')).toBe(true);
    expect(matchesLibraryPurpose('interactive_board', 'tasks')).toBe(false);
    expect(matchesLibraryPurpose('interactive_board', 'presentations')).toBe(false);
    expect(matchesLibraryPurpose(undefined, 'presentations')).toBe(true);
    expect(matchesLibraryPurpose(undefined, 'tasks')).toBe(false);
    expect(matchesLibraryPurpose('', '')).toBe(true);
  });

  it('canonicalSubjectLabel: kein „Sport“-Treffer für „Transport“', () => {
    // Der Label „Sport“ darf nicht greifen, wenn es Teil eines anderen Wortes ist.
    expect(canonicalSubjectLabel('Transportwesen')).toBe(LIBRARY_SUBJECT_OTHER);
  });

  it('canonicalSubjectLabel: trifft Wirtschaft nur als ganzes Wort', () => {
    expect(canonicalSubjectLabel('Wirtschaft Kl. 11')).toBe('Wirtschaftslehre');
  });

  it('extractLibraryClassStep: römische Zahlen (I–V) werden erkannt', () => {
    expect(extractLibraryClassStep('Klasse III')).toBe('3');
    expect(extractLibraryClassStep('IV')).toBe('4');
    expect(extractLibraryClassStep('V')).toBe('5');
  });

  it('extractLibraryClassStep: leerer/unbekannter Input → null', () => {
    expect(extractLibraryClassStep('')).toBeNull();
    expect(extractLibraryClassStep('keine Klasse')).toBeNull();
    expect(extractLibraryClassStep('Q2')).toBeNull();
  });

  it('extractLibraryClassStep: 13.te Klasse-Schreibweise', () => {
    expect(extractLibraryClassStep('13.te Klasse')).toBe('13');
  });

  it('matchesLibraryGradeFilter: ungültiger Filter-Step → true (kein Filter)', () => {
    expect(matchesLibraryGradeFilter('Klasse 5', '0')).toBe(true);
    expect(matchesLibraryGradeFilter('Klasse 5', '99')).toBe(true);
    expect(matchesLibraryGradeFilter('Klasse 5', 'abc')).toBe(true);
  });

  it('matchesLibrarySubjectFilter: leerer Filter → akzeptiert alles', () => {
    expect(matchesLibrarySubjectFilter('beliebig', '')).toBe(true);
    expect(matchesLibrarySubjectFilter('', '')).toBe(true);
  });
});
