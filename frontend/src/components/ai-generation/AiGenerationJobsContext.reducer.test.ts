import { describe, expect, it } from 'vitest';
import type { AiGenerationJob } from './aiGenerationTypes';
import { AI_GENERATION_MAX_QUEUED } from './aiGenerationTypes';
import { AI_GENERATION_MAX_JOBS, jobsReducer } from './AiGenerationJobsContext';

type Action =
  | { type: 'start'; job: AiGenerationJob }
  | { type: 'patch'; id: string; patch: Partial<AiGenerationJob> }
  | { type: 'dismiss'; id: string };

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

const reduce = (jobs: AiGenerationJob[], action: Action): AiGenerationJob[] => jobsReducer(jobs, action);

describe('AiGenerationJobs jobsReducer', () => {
  describe('start', () => {
    it('fügt einen neuen Job an den Anfang', () => {
      const jobs = reduce([], { type: 'start', job: mkJob('a') });
      expect(jobs.map((j) => j.id)).toEqual(['a']);
    });

    it('neue Jobs landen vor älteren', () => {
      let jobs: AiGenerationJob[] = [];
      jobs = reduce(jobs, { type: 'start', job: mkJob('a') });
      jobs = reduce(jobs, { type: 'start', job: mkJob('b') });
      jobs = reduce(jobs, { type: 'start', job: mkJob('c') });
      expect(jobs.map((j) => j.id)).toEqual(['c', 'b', 'a']);
    });

    it(`erlaubt höchstens ${AI_GENERATION_MAX_QUEUED} wartende Jobs`, () => {
      let jobs: AiGenerationJob[] = [];
      for (let i = 0; i < AI_GENERATION_MAX_QUEUED; i += 1) {
        jobs = reduce(jobs, { type: 'start', job: mkJob(`q${i}`) });
      }
      const before = jobs;
      jobs = reduce(jobs, { type: 'start', job: mkJob('overflow') });
      expect(jobs).toEqual(before);
      expect(jobs.filter((j) => j.status === 'queued').length).toBe(AI_GENERATION_MAX_QUEUED);
    });

    it(`begrenzt sichtbare Jobs auf AI_GENERATION_MAX_JOBS (${AI_GENERATION_MAX_JOBS})`, () => {
      let jobs: AiGenerationJob[] = Array.from({ length: 6 }, (_, i) =>
        mkJob(`s${i}`, { status: 'success' }),
      );
      jobs = reduce(jobs, { type: 'start', job: mkJob('new') });
      expect(jobs.length).toBe(AI_GENERATION_MAX_JOBS);
      expect(jobs[0].id).toBe('new');
      expect(jobs.map((j) => j.id)).toEqual(['new', 's0', 's1', 's2', 's3', 's4']);
    });

    it('verändert keine bestehenden Job-Objekte (Immutability)', () => {
      const j1 = mkJob('1');
      const before: AiGenerationJob[] = [j1];
      const after = reduce(before, { type: 'start', job: mkJob('2') });
      expect(after[1]).toBe(j1);
      expect(after).not.toBe(before);
    });
  });

  describe('patch', () => {
    it('mergt das Patch-Objekt nur in den richtigen Job', () => {
      const before: AiGenerationJob[] = [mkJob('a'), mkJob('b'), mkJob('c')];
      const after = reduce(before, {
        type: 'patch',
        id: 'b',
        patch: { status: 'running', phaseLabel: 'Läuft …' },
      });
      expect(after[0]).toEqual(before[0]);
      expect(after[1].status).toBe('running');
      expect(after[1].phaseLabel).toBe('Läuft …');
      expect(after[2]).toEqual(before[2]);
    });

    it('Patch auf nicht-existente ID lässt den Zustand inhaltlich unberührt', () => {
      const before: AiGenerationJob[] = [mkJob('a')];
      const after = reduce(before, { type: 'patch', id: 'unknown', patch: { status: 'success' } });
      expect(after).toEqual(before);
    });

    it('überschreibt eingehende Felder; bestehende Felder bleiben erhalten', () => {
      const before: AiGenerationJob[] = [
        mkJob('a', { status: 'queued', subtitle: 'sub', progressPercent: 30 }),
      ];
      const after = reduce(before, {
        type: 'patch',
        id: 'a',
        patch: { progressPercent: 60 },
      });
      expect(after[0].progressPercent).toBe(60);
      expect(after[0].status).toBe('queued');
      expect(after[0].subtitle).toBe('sub');
    });

    it('kann den Status auf "success" mit Folge-Feldern setzen', () => {
      const before: AiGenerationJob[] = [mkJob('a')];
      const after = reduce(before, {
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
      expect(after[0].status).toBe('success');
      expect(after[0].progressPercent).toBe(100);
      expect(after[0].phaseLabel).toBeUndefined();
      expect(after[0].successMessage).toBe('Fertig.');
      expect(after[0].endedAt).toBe(1_700_000_001_000);
    });
  });

  describe('dismiss', () => {
    it('entfernt nur den passenden Job', () => {
      const before: AiGenerationJob[] = [mkJob('a'), mkJob('b'), mkJob('c')];
      const after = reduce(before, { type: 'dismiss', id: 'b' });
      expect(after.map((j) => j.id)).toEqual(['a', 'c']);
    });

    it('Dismiss auf unbekannte ID ist No-Op (Inhalt identisch)', () => {
      const before: AiGenerationJob[] = [mkJob('a')];
      const after = reduce(before, { type: 'dismiss', id: 'unknown' });
      expect(after).toEqual(before);
    });

    it('leert die Queue, wenn der einzige Job entfernt wird', () => {
      const before: AiGenerationJob[] = [mkJob('a')];
      const after = reduce(before, { type: 'dismiss', id: 'a' });
      expect(after).toEqual([]);
    });
  });
});
