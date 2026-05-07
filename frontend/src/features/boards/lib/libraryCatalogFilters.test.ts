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

  it('matchesLibraryPurpose maps board types', () => {
    expect(matchesLibraryPurpose('quiz_board', 'tasks')).toBe(true);
    expect(matchesLibraryPurpose('lesson_intro', 'presentations')).toBe(true);
    expect(matchesLibraryPurpose('interactive_board', 'tasks')).toBe(true);
    expect(matchesLibraryPurpose('interactive_board', 'presentations')).toBe(false);
    expect(matchesLibraryPurpose(undefined, 'tasks')).toBe(true);
    expect(matchesLibraryPurpose('', '')).toBe(true);
  });
});
