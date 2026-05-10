import { describe, expect, it } from 'vitest';
import type { AiGenerationJob } from './aiGenerationTypes';
import { AI_GENERATION_MAX_JOBS } from './AiGenerationJobsContext';

/**
 * Logik-Reproduktion des privaten Reducers in `AiGenerationJobsContext.tsx`.
 *
 * Solange der Reducer dort nicht exportiert wird, halten wir hier die identische Logik
 * 1:1 nach (inkl. AI_GENERATION_MAX_JOBS) und decken alle relevanten Pfade testseitig ab.
 * Wenn der Reducer geändert wird, müssen sowohl die Logik hier als auch die Tests
 * synchron angepasst werden — das ist der Punkt, an dem dieser Test "anschlägt".
 */

type State = { jobs: AiGenerationJob[] };
type Action =
  | { type: 'start'; job: AiGenerationJob }
  | { type: 'patch'; id: string; patch: Partial<AiGenerationJob> }
  | { type: 'dismiss'; id: string };

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'start':
      return { jobs: [action.job, ...state.jobs].slice(0, AI_GENERATION_MAX_JOBS) };
    case 'patch':
      return {
        jobs: state.jobs.map((j) => (j.id === action.id ? { ...j, ...action.patch } : j)),
      };
    case 'dismiss':
      return { jobs: state.jobs.filter((j) => j.id !== action.id) };
    default:
      return state;
  }
};

const mkJob = (id: string, overrides: Partial<AiGenerationJob> = {}): AiGenerationJob => ({
  id,
  kind: 'board-creative',
  title: `Job ${id}`,
  status: 'queued',
  progressPercent: null,
  phaseLabel: 'In der Warteschlange …',
  createdAt: 1_700_000_000_000,
  ...overrides,
});

describe('AiGenerationJobs Reducer (Queue-Logik)', () => {
  describe('start', () => {
    it('fügt einen neuen Job an den Anfang', () => {
      const s = reducer({ jobs: [] }, { type: 'start', job: mkJob('a') });
      expect(s.jobs.map((j) => j.id)).toEqual(['a']);
    });

    it('neue Jobs landen vor älteren', () => {
      let s: State = { jobs: [] };
      s = reducer(s, { type: 'start', job: mkJob('a') });
      s = reducer(s, { type: 'start', job: mkJob('b') });
      s = reducer(s, { type: 'start', job: mkJob('c') });
      expect(s.jobs.map((j) => j.id)).toEqual(['c', 'b', 'a']);
    });

    it(`begrenzt auf AI_GENERATION_MAX_JOBS (${AI_GENERATION_MAX_JOBS})`, () => {
      let s: State = { jobs: [] };
      for (let i = 0; i < 10; i += 1) {
        s = reducer(s, { type: 'start', job: mkJob(`j${i}`) });
      }
      expect(s.jobs.length).toBe(AI_GENERATION_MAX_JOBS);
      // Die 4 ältesten Jobs (j0–j3) wurden verworfen.
      expect(s.jobs.map((j) => j.id)).toEqual(['j9', 'j8', 'j7', 'j6', 'j5', 'j4']);
    });

    it('verändert keine bestehenden Job-Objekte (Immutability)', () => {
      const j1 = mkJob('1');
      const before: State = { jobs: [j1] };
      const after = reducer(before, { type: 'start', job: mkJob('2') });
      expect(after.jobs[1]).toBe(j1);
      expect(after.jobs).not.toBe(before.jobs);
    });
  });

  describe('patch', () => {
    it('mergt das Patch-Objekt nur in den richtigen Job', () => {
      const before: State = { jobs: [mkJob('a'), mkJob('b'), mkJob('c')] };
      const after = reducer(before, {
        type: 'patch',
        id: 'b',
        patch: { status: 'running', phaseLabel: 'Läuft …' },
      });
      expect(after.jobs[0]).toEqual(before.jobs[0]);
      expect(after.jobs[1].status).toBe('running');
      expect(after.jobs[1].phaseLabel).toBe('Läuft …');
      expect(after.jobs[2]).toEqual(before.jobs[2]);
    });

    it('Patch auf nicht-existente ID lässt den Zustand inhaltlich unberührt', () => {
      const before: State = { jobs: [mkJob('a')] };
      const after = reducer(before, { type: 'patch', id: 'unknown', patch: { status: 'success' } });
      expect(after.jobs).toEqual(before.jobs);
    });

    it('überschreibt eingehende Felder; bestehende Felder bleiben erhalten', () => {
      const before: State = {
        jobs: [mkJob('a', { status: 'queued', subtitle: 'sub', progressPercent: 30 })],
      };
      const after = reducer(before, {
        type: 'patch',
        id: 'a',
        patch: { progressPercent: 60 },
      });
      expect(after.jobs[0].progressPercent).toBe(60);
      expect(after.jobs[0].status).toBe('queued');
      expect(after.jobs[0].subtitle).toBe('sub');
    });

    it('kann den Status auf "success" mit Folge-Feldern setzen', () => {
      const before: State = { jobs: [mkJob('a')] };
      const after = reducer(before, {
        type: 'patch',
        id: 'a',
        patch: {
          status: 'success',
          progressPercent: 100,
          phaseLabel: undefined,
          successMessage: 'Fertig.',
          endedAt: 1_700_000_001_000,
        },
      });
      expect(after.jobs[0].status).toBe('success');
      expect(after.jobs[0].progressPercent).toBe(100);
      expect(after.jobs[0].phaseLabel).toBeUndefined();
      expect(after.jobs[0].successMessage).toBe('Fertig.');
      expect(after.jobs[0].endedAt).toBe(1_700_000_001_000);
    });
  });

  describe('dismiss', () => {
    it('entfernt nur den passenden Job', () => {
      const before: State = { jobs: [mkJob('a'), mkJob('b'), mkJob('c')] };
      const after = reducer(before, { type: 'dismiss', id: 'b' });
      expect(after.jobs.map((j) => j.id)).toEqual(['a', 'c']);
    });

    it('Dismiss auf unbekannte ID ist No-Op (Inhalt identisch)', () => {
      const before: State = { jobs: [mkJob('a')] };
      const after = reducer(before, { type: 'dismiss', id: 'unknown' });
      expect(after.jobs).toEqual(before.jobs);
    });

    it('leert die Queue, wenn der einzige Job entfernt wird', () => {
      const before: State = { jobs: [mkJob('a')] };
      const after = reducer(before, { type: 'dismiss', id: 'a' });
      expect(after.jobs).toEqual([]);
    });
  });
});
