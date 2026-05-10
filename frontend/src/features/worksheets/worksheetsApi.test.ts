import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import {
  applyWorksheetRevision,
  deleteWorksheetRevision,
  fetchWorksheetRevisions,
} from './worksheetsApi';

const okResponse = <T>(data: T) => ({
  data,
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {},
});

describe('worksheetsApi', () => {
  let getSpy: ReturnType<typeof vi.spyOn>;
  let postSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getSpy = vi.spyOn(api, 'get').mockResolvedValue(okResponse([]) as never);
    postSpy = vi.spyOn(api, 'post').mockResolvedValue(okResponse({}) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchWorksheetRevisions: GET /worksheets/:id/revisions/', async () => {
    getSpy.mockResolvedValueOnce(okResponse([{ id: 'r1' }]) as never);
    const r = await fetchWorksheetRevisions('w1');
    expect(r).toEqual([{ id: 'r1' }]);
    expect(getSpy).toHaveBeenCalledWith('/worksheets/w1/revisions/');
  });

  it('applyWorksheetRevision: POST mit revision_id', async () => {
    postSpy.mockResolvedValueOnce(okResponse({ id: 'w1' }) as never);
    await applyWorksheetRevision('w1', 'r1');
    expect(postSpy).toHaveBeenCalledWith('/worksheets/w1/apply-revision/', {
      revision_id: 'r1',
    });
  });

  it('deleteWorksheetRevision: POST mit revision_id', async () => {
    postSpy.mockResolvedValueOnce(okResponse({ id: 'w1' }) as never);
    await deleteWorksheetRevision('w1', 'r1');
    expect(postSpy).toHaveBeenCalledWith('/worksheets/w1/delete-revision/', {
      revision_id: 'r1',
    });
  });
});
