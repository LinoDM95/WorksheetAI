import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import {
  activateCurriculumContext,
  approveAutoRun,
  approveJob,
  archiveCurriculumContext,
  autoDiscoverSource,
  autoExtractSource,
  createCurriculumSource,
  createExtractionJob,
  extractCurriculumSourceText,
  fetchAutoRun,
  fetchCurriculumContext,
  fetchCurriculumContexts,
  fetchCurriculumSource,
  fetchCurriculumSources,
  fetchExtractionJob,
  fetchStateOptions,
  matchCurriculum,
  patchCurriculumContext,
  patchJobContext,
  rejectJob,
  runExtractionJob,
} from './curriculaApi';

const okResponse = <T>(data: T) => ({
  data,
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {},
});

type MockCallArgs = readonly unknown[];

describe('curriculaApi', () => {
  let getSpy: ReturnType<typeof vi.spyOn>;
  let postSpy: ReturnType<typeof vi.spyOn>;
  let patchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getSpy = vi.spyOn(api, 'get').mockResolvedValue(okResponse([]) as never);
    postSpy = vi.spyOn(api, 'post').mockResolvedValue(okResponse({}) as never);
    patchSpy = vi.spyOn(api, 'patch').mockResolvedValue(okResponse({}) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Sources', () => {
    it('fetchCurriculumSources: GET /curricula/sources/', async () => {
      getSpy.mockResolvedValueOnce(okResponse([{ id: 's1' }]) as never);
      expect(await fetchCurriculumSources()).toEqual([{ id: 's1' }]);
      expect(getSpy).toHaveBeenCalledWith('/curricula/sources/');
    });

    it('createCurriculumSource: POST mit FormData', async () => {
      const fd = new FormData();
      fd.append('title', 'X');
      postSpy.mockResolvedValueOnce(okResponse({ id: 's1', title: 'X' }) as never);
      await createCurriculumSource(fd);
      const call = postSpy.mock.calls.find((c: MockCallArgs) => c[0] === '/curricula/sources/');
      expect(call).toBeTruthy();
      expect(call![1]).toBeInstanceOf(FormData);
    });

    it('fetchCurriculumSource', async () => {
      await fetchCurriculumSource('s1');
      expect(getSpy).toHaveBeenCalledWith('/curricula/sources/s1/');
    });

    it('extractCurriculumSourceText', async () => {
      await extractCurriculumSourceText('s1');
      expect(postSpy).toHaveBeenCalledWith('/curricula/sources/s1/extract-text/');
    });

    it('autoDiscoverSource', async () => {
      await autoDiscoverSource('s1');
      expect(postSpy).toHaveBeenCalledWith('/curricula/sources/s1/auto-discover/');
    });

    it('autoExtractSource: ohne indices sendet leeres Array', async () => {
      await autoExtractSource('s1');
      expect(postSpy).toHaveBeenCalledWith('/curricula/sources/s1/auto-extract/', {
        selected_indices: [],
      });
    });

    it('autoExtractSource: mit indices', async () => {
      await autoExtractSource('s1', [1, 2, 3]);
      expect(postSpy).toHaveBeenCalledWith('/curricula/sources/s1/auto-extract/', {
        selected_indices: [1, 2, 3],
      });
    });

    it('fetchAutoRun', async () => {
      await fetchAutoRun('s1', 'r1');
      expect(getSpy).toHaveBeenCalledWith('/curricula/sources/s1/auto-run/r1/');
    });

    it('approveAutoRun', async () => {
      await approveAutoRun('s1', 'r1', { activate: true });
      expect(postSpy).toHaveBeenCalledWith('/curricula/sources/s1/auto-run/r1/approve/', {
        activate: true,
      });
    });
  });

  describe('Extraction Jobs', () => {
    it('createExtractionJob', async () => {
      await createExtractionJob({ subject: 'Math' });
      expect(postSpy).toHaveBeenCalledWith('/curricula/extraction-jobs/', { subject: 'Math' });
    });

    it('fetchExtractionJob', async () => {
      await fetchExtractionJob('j1');
      expect(getSpy).toHaveBeenCalledWith('/curricula/extraction-jobs/j1/');
    });

    it('runExtractionJob', async () => {
      await runExtractionJob('j1');
      expect(postSpy).toHaveBeenCalledWith('/curricula/extraction-jobs/j1/run/');
    });

    it('patchJobContext: PATCH mit extracted_context', async () => {
      await patchJobContext('j1', { foo: 'bar' });
      expect(patchSpy).toHaveBeenCalledWith(
        '/curricula/extraction-jobs/j1/edit-extracted-context/',
        { extracted_context: { foo: 'bar' } },
      );
    });

    it('approveJob', async () => {
      await approveJob('j1', { activate: true });
      expect(postSpy).toHaveBeenCalledWith('/curricula/extraction-jobs/j1/approve/', {
        activate: true,
      });
    });

    it('rejectJob', async () => {
      await rejectJob('j1', 'invalid');
      expect(postSpy).toHaveBeenCalledWith('/curricula/extraction-jobs/j1/reject/', {
        notes: 'invalid',
      });
    });
  });

  describe('Contexts', () => {
    it('fetchCurriculumContexts: ohne Params', async () => {
      await fetchCurriculumContexts();
      const call = getSpy.mock.calls.find((c: MockCallArgs) => c[0] === '/curricula/contexts/');
      const cfg = (call![1] ?? {}) as { params?: unknown };
      expect(cfg.params).toBeUndefined();
    });

    it('fetchCurriculumContexts: mit Params', async () => {
      await fetchCurriculumContexts({ subject: 'Math', state: 'bayern' });
      const call = getSpy.mock.calls.find((c: MockCallArgs) => c[0] === '/curricula/contexts/');
      const cfg = call![1] as { params?: Record<string, string> };
      expect(cfg.params).toEqual({ subject: 'Math', state: 'bayern' });
    });

    it('fetchCurriculumContext', async () => {
      await fetchCurriculumContext('c1');
      expect(getSpy).toHaveBeenCalledWith('/curricula/contexts/c1/');
    });

    it('patchCurriculumContext', async () => {
      await patchCurriculumContext('c1', { topic: 'X' });
      expect(patchSpy).toHaveBeenCalledWith('/curricula/contexts/c1/', { topic: 'X' });
    });

    it('activateCurriculumContext', async () => {
      await activateCurriculumContext('c1');
      expect(postSpy).toHaveBeenCalledWith('/curricula/contexts/c1/activate/');
    });

    it('archiveCurriculumContext', async () => {
      await archiveCurriculumContext('c1');
      expect(postSpy).toHaveBeenCalledWith('/curricula/contexts/c1/archive/');
    });
  });

  describe('Sonstiges', () => {
    it('matchCurriculum', async () => {
      await matchCurriculum({ state: 'bayern', subject: 'Math', grade: 5 });
      expect(postSpy).toHaveBeenCalledWith('/curricula/match/', {
        state: 'bayern',
        subject: 'Math',
        grade: 5,
      });
    });

    it('fetchStateOptions: extrahiert .options', async () => {
      getSpy.mockResolvedValueOnce(
        okResponse({ options: [{ slug: 'bayern', name: 'Bayern' }] }) as never,
      );
      const opts = await fetchStateOptions();
      expect(opts).toEqual([{ slug: 'bayern', name: 'Bayern' }]);
      expect(getSpy).toHaveBeenCalledWith('/curricula/state-options/');
    });
  });
});
