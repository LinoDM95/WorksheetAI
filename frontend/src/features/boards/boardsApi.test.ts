import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import {
  adoptBoardFromLibrary,
  applyBoardRevision,
  autoRepairBoard,
  backofficeDeleteBoard,
  backofficeDeleteBoardLibraryComment,
  backofficeDeleteWorksheet,
  backofficeUnpublishBoard,
  backofficeUnpublishWorksheet,
  createBoardFolder,
  deleteBoard,
  deleteBoardFolder,
  deleteBoardRevision,
  duplicateBoard,
  fetchBlockRegistry,
  fetchBoard,
  fetchBoardFolders,
  fetchBoardLibrary,
  fetchBoardLibraryComments,
  fetchBoardLibraryEntry,
  fetchBoardQualityReport,
  fetchBoardRevisions,
  fetchBoards,
  fetchPipelineStatus,
  generateBoard,
  generateBoardFromBlocks,
  postBoardLibraryComment,
  rateBoardInLibrary,
  revertLastBoardRevision,
  reviseBoard,
  runBoardQualityCheck,
  updateBoardCode,
  updateBoardFolder,
  validateBoardCode,
} from './boardsApi';

const okResponse = <T>(data: T) => ({
  data,
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {},
});

type MockCallArgs = readonly unknown[];

describe('boardsApi', () => {
  let getSpy: ReturnType<typeof vi.spyOn>;
  let postSpy: ReturnType<typeof vi.spyOn>;
  let patchSpy: ReturnType<typeof vi.spyOn>;
  let deleteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getSpy = vi.spyOn(api, 'get').mockResolvedValue(okResponse([]) as never);
    postSpy = vi.spyOn(api, 'post').mockResolvedValue(okResponse({}) as never);
    patchSpy = vi.spyOn(api, 'patch').mockResolvedValue(okResponse({}) as never);
    deleteSpy = vi.spyOn(api, 'delete').mockResolvedValue(okResponse({}) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Listen & Folder', () => {
    it('fetchBoards: GET /boards/, returns array', async () => {
      getSpy.mockResolvedValueOnce(okResponse([{ id: 'b1' }]) as never);
      const list = await fetchBoards();
      expect(list).toEqual([{ id: 'b1' }]);
      expect(getSpy).toHaveBeenCalledWith('/boards/');
    });

    it('fetchBoards: unwraps {results: []} pagination', async () => {
      getSpy.mockResolvedValueOnce(okResponse({ results: [{ id: 'b2' }] }) as never);
      expect(await fetchBoards()).toEqual([{ id: 'b2' }]);
    });

    it('fetchBoards: liefert leeres Array bei nicht-Array', async () => {
      getSpy.mockResolvedValueOnce(okResponse({ foo: 'bar' }) as never);
      expect(await fetchBoards()).toEqual([]);
    });

    it('fetchBoardFolders: GET /boards/folders/', async () => {
      getSpy.mockResolvedValueOnce(okResponse([{ id: 'f1' }]) as never);
      expect(await fetchBoardFolders()).toEqual([{ id: 'f1' }]);
    });

    it('createBoardFolder: POST /boards/folders/ mit name', async () => {
      postSpy.mockResolvedValueOnce(okResponse({ id: 'f1', name: 'X' }) as never);
      await createBoardFolder({ name: 'X' });
      expect(postSpy).toHaveBeenCalledWith('/boards/folders/', { name: 'X' });
    });

    it('deleteBoardFolder: DELETE', async () => {
      await deleteBoardFolder('f1');
      expect(deleteSpy).toHaveBeenCalledWith('/boards/folders/f1/');
    });

    it('updateBoardFolder: PATCH mit body', async () => {
      await updateBoardFolder('f1', { name: 'Neu' });
      expect(patchSpy).toHaveBeenCalledWith('/boards/folders/f1/', { name: 'Neu' });
    });
  });

  describe('Detail / Library', () => {
    it('fetchBoard: GET /boards/:id/', async () => {
      getSpy.mockResolvedValueOnce(okResponse({ id: 'b1', title: 'X' }) as never);
      const b = await fetchBoard('b1');
      expect(b).toEqual({ id: 'b1', title: 'X' });
      expect(getSpy).toHaveBeenCalledWith('/boards/b1/');
    });

    it('fetchBoardLibrary: scope-Parameter', async () => {
      await fetchBoardLibrary('mine');
      const call = getSpy.mock.calls.find((c: MockCallArgs) => c[0] === '/boards/library/');
      expect(call).toBeTruthy();
      const cfg = call![1] as { params?: { scope?: string } };
      expect(cfg.params?.scope).toBe('mine');
    });

    it('fetchBoardLibrary: defaults zu scope=all', async () => {
      await fetchBoardLibrary();
      const call = getSpy.mock.calls.find((c: MockCallArgs) => c[0] === '/boards/library/');
      const cfg = call![1] as { params?: { scope?: string } };
      expect(cfg.params?.scope).toBe('all');
    });

    it('fetchBoardLibrary: liefert [] wenn data kein Array', async () => {
      getSpy.mockResolvedValueOnce(okResponse({}) as never);
      expect(await fetchBoardLibrary()).toEqual([]);
    });

    it('fetchBoardLibraryEntry', async () => {
      await fetchBoardLibraryEntry('b1');
      expect(getSpy).toHaveBeenCalledWith('/boards/b1/library-entry/');
    });

    it('rateBoardInLibrary', async () => {
      postSpy.mockResolvedValueOnce(
        okResponse({ stars: 5, avg_rating: 4.8, rating_count: 10 }) as never,
      );
      await rateBoardInLibrary('b1', 5);
      expect(postSpy).toHaveBeenCalledWith('/boards/b1/rate/', { stars: 5 });
    });

    it('adoptBoardFromLibrary', async () => {
      await adoptBoardFromLibrary('b1');
      expect(postSpy).toHaveBeenCalledWith('/boards/b1/adopt-from-library/');
    });

    it('fetchBoardLibraryComments: liefert [] wenn nicht-Array', async () => {
      getSpy.mockResolvedValueOnce(okResponse({}) as never);
      expect(await fetchBoardLibraryComments('b1')).toEqual([]);
    });

    it('postBoardLibraryComment', async () => {
      postSpy.mockResolvedValueOnce(okResponse({ id: 'c1', text: 'Hi' }) as never);
      await postBoardLibraryComment('b1', 'Hi');
      expect(postSpy).toHaveBeenCalledWith('/boards/b1/library-comments/', { text: 'Hi' });
    });
  });

  describe('Generate / Revise / Quality', () => {
    it('generateBoard: POST /boards/generate/ mit longBoard timeout', async () => {
      postSpy.mockResolvedValueOnce(okResponse({ id: 'b1' }) as never);
      await generateBoard({ topic: 'X' } as never);
      const call = postSpy.mock.calls.find((c: MockCallArgs) => c[0] === '/boards/generate/');
      expect(call).toBeTruthy();
      expect(call![1]).toEqual({ topic: 'X' });
      expect((call![2] as { timeout?: number })?.timeout).toBeGreaterThan(60_000);
    });

    it('reviseBoard: ohne extras nur prompt', async () => {
      postSpy.mockResolvedValueOnce(
        okResponse({ board: { id: 'b' }, revision: { id: 'r' } }) as never,
      );
      await reviseBoard('b1', 'mach besser');
      const call = postSpy.mock.calls.find((c: MockCallArgs) => c[0] === '/boards/b1/revise/');
      expect(call![1]).toEqual({ prompt: 'mach besser' });
    });

    it('reviseBoard: mit ai_quality_tier=ultra fügt Feld hinzu', async () => {
      postSpy.mockResolvedValueOnce(
        okResponse({ board: { id: 'b' }, revision: { id: 'r' } }) as never,
      );
      await reviseBoard('b1', 'p', { ai_quality_tier: 'ultra' });
      const call = postSpy.mock.calls.find((c: MockCallArgs) => c[0] === '/boards/b1/revise/');
      expect(call![1]).toEqual({ prompt: 'p', ai_quality_tier: 'ultra' });
    });

    it('reviseBoard: revision_mode=general wird weggelassen', async () => {
      postSpy.mockResolvedValueOnce(
        okResponse({ board: { id: 'b' }, revision: { id: 'r' } }) as never,
      );
      await reviseBoard('b1', 'p', { revision_mode: 'general' });
      const call = postSpy.mock.calls.find((c: MockCallArgs) => c[0] === '/boards/b1/revise/');
      expect(call![1]).toEqual({ prompt: 'p' });
    });

    it('runBoardQualityCheck', async () => {
      await runBoardQualityCheck('b1');
      const call = postSpy.mock.calls.find((c: MockCallArgs) => c[0] === '/boards/b1/run-quality-check/');
      expect(call).toBeTruthy();
    });

    it('autoRepairBoard ohne payload sendet {}', async () => {
      postSpy.mockResolvedValueOnce(
        okResponse({ board: {}, revision: {}, ok: true }) as never,
      );
      await autoRepairBoard('b1');
      const call = postSpy.mock.calls.find((c: MockCallArgs) => c[0] === '/boards/b1/auto-repair/');
      expect(call![1]).toEqual({});
    });

    it('fetchBoardQualityReport', async () => {
      await fetchBoardQualityReport('b1');
      expect(getSpy).toHaveBeenCalledWith('/boards/b1/quality-report/');
    });

    it('fetchPipelineStatus', async () => {
      await fetchPipelineStatus();
      expect(getSpy).toHaveBeenCalledWith('/boards/pipeline-status/');
    });
  });

  describe('Code / Validation / Revisionen', () => {
    it('updateBoardCode: PATCH', async () => {
      await updateBoardCode('b1', { html: '<p/>' } as never);
      expect(patchSpy).toHaveBeenCalledWith('/boards/b1/', { html: '<p/>' });
    });

    it('validateBoardCode: ohne body sendet {}', async () => {
      await validateBoardCode('b1');
      expect(postSpy).toHaveBeenCalledWith('/boards/b1/validate/', {});
    });

    it('fetchBoardRevisions', async () => {
      await fetchBoardRevisions('b1');
      expect(getSpy).toHaveBeenCalledWith('/boards/b1/revisions/');
    });

    it('revertLastBoardRevision', async () => {
      await revertLastBoardRevision('b1', 'r1');
      expect(postSpy).toHaveBeenCalledWith('/boards/b1/revert-revision/', { revision_id: 'r1' });
    });

    it('applyBoardRevision', async () => {
      await applyBoardRevision('b1', 'r1');
      const call = postSpy.mock.calls.find((c: MockCallArgs) => c[0] === '/boards/b1/apply-revision/');
      expect(call).toBeTruthy();
      expect(call![1]).toEqual({ revision_id: 'r1' });
    });

    it('deleteBoardRevision', async () => {
      await deleteBoardRevision('b1', 'r1');
      expect(postSpy).toHaveBeenCalledWith('/boards/b1/delete-revision/', { revision_id: 'r1' });
    });

    it('duplicateBoard', async () => {
      await duplicateBoard('b1');
      expect(postSpy).toHaveBeenCalledWith('/boards/b1/duplicate/');
    });

    it('deleteBoard', async () => {
      await deleteBoard('b1');
      expect(deleteSpy).toHaveBeenCalledWith('/boards/b1/');
    });
  });

  describe('Backoffice', () => {
    it('backofficeUnpublishBoard', async () => {
      await backofficeUnpublishBoard('b1');
      expect(postSpy).toHaveBeenCalledWith('/auth/backoffice/boards/b1/unpublish/');
    });

    it('backofficeDeleteBoard', async () => {
      await backofficeDeleteBoard('b1');
      expect(deleteSpy).toHaveBeenCalledWith('/auth/backoffice/boards/b1/');
    });

    it('backofficeDeleteBoardLibraryComment', async () => {
      await backofficeDeleteBoardLibraryComment('b1', 'c1');
      expect(deleteSpy).toHaveBeenCalledWith('/auth/backoffice/boards/b1/comments/c1/');
    });

    it('backofficeUnpublishWorksheet', async () => {
      await backofficeUnpublishWorksheet('w1');
      expect(postSpy).toHaveBeenCalledWith('/auth/backoffice/worksheets/w1/unpublish/');
    });

    it('backofficeDeleteWorksheet', async () => {
      await backofficeDeleteWorksheet('w1');
      expect(deleteSpy).toHaveBeenCalledWith('/auth/backoffice/worksheets/w1/');
    });
  });

  describe('Bausteine', () => {
    it('fetchBlockRegistry', async () => {
      await fetchBlockRegistry();
      expect(getSpy).toHaveBeenCalledWith('/boards/blocks/');
    });

    it('generateBoardFromBlocks: POST mit Plan-Body und longBoard timeout', async () => {
      const plan = { foo: 'bar' };
      await generateBoardFromBlocks(plan as never);
      const call = postSpy.mock.calls.find((c: MockCallArgs) => c[0] === '/boards/generate-blocks/');
      expect(call).toBeTruthy();
      expect(call![1]).toEqual(plan);
      expect((call![2] as { timeout?: number })?.timeout).toBeGreaterThan(60_000);
    });
  });
});
