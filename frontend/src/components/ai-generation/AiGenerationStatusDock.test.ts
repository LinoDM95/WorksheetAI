import { describe, expect, it } from 'vitest';
import { sortJobsForDisplay } from './AiGenerationStatusDock';
import type { AiGenerationJob } from './aiGenerationTypes';

const base = (id: string, status: AiGenerationJob['status']): AiGenerationJob => ({
  id,
  kind: 'board-creative',
  title: id,
  status,
  progressPercent: null,
  createdAt: 0,
});

describe('sortJobsForDisplay', () => {
  it('lists running before queued before terminal', () => {
    const jobs = [
      base('q2', 'queued'),
      base('ok', 'success'),
      base('run', 'running'),
      base('q1', 'queued'),
    ];
    const sorted = sortJobsForDisplay(jobs).map((j) => j.id);
    expect(sorted).toEqual(['run', 'q2', 'q1', 'ok']);
  });
});
