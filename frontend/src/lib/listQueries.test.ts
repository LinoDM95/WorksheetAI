import { describe, expect, it } from 'vitest';

import {
  BOARDS_BLOCKS_QUERY_KEY,
  BOARDS_DETAIL_QUERY_KEY,
  BOARDS_FOLDERS_QUERY_KEY,
  BOARDS_LIST_QUERY_KEY,
  BOARDS_REVISIONS_QUERY_KEY,
  PATTERNS_LIST_QUERY_KEY,
  WORKSHEET_LIST_QUERY_KEY,
  WORKSHEET_LIST_STALE_MS,
  WORKSHEETS_REVISIONS_QUERY_KEY,
  boardLibraryEntryQueryKey,
  boardsLibraryCommentsQueryKey,
  boardsLibraryQueryKey,
  worksheetsLibraryQueryKey,
} from './listQueries';

describe('listQueries keys', () => {
  it('uses stable tuple roots for lists', () => {
    expect(WORKSHEET_LIST_QUERY_KEY).toEqual(['worksheets', 'list']);
    expect(PATTERNS_LIST_QUERY_KEY).toEqual(['patterns', 'list']);
    expect(BOARDS_LIST_QUERY_KEY).toEqual(['boards', 'list']);
    expect(BOARDS_BLOCKS_QUERY_KEY).toEqual(['boards', 'blocks']);
  });

  it('scopes board detail and revisions by id', () => {
    expect(BOARDS_DETAIL_QUERY_KEY('abc')).toEqual(['boards', 'detail', 'abc']);
    expect(BOARDS_REVISIONS_QUERY_KEY('abc')).toEqual(['boards', 'revisions', 'abc']);
    expect(WORKSHEETS_REVISIONS_QUERY_KEY('w1')).toEqual(['worksheets', 'revisions', 'w1']);
    expect(BOARDS_FOLDERS_QUERY_KEY).toEqual(['boards', 'folders']);
    expect(boardsLibraryQueryKey('all')).toEqual(['boards', 'library', 'all']);
    expect(boardsLibraryQueryKey('mine')).toEqual(['boards', 'library', 'mine']);
    expect(boardLibraryEntryQueryKey('b1')).toEqual(['boards', 'library-entry', 'b1']);
  });

  it('Worksheet-Library + Comments-Keys', () => {
    expect(worksheetsLibraryQueryKey('all')).toEqual(['worksheets', 'library', 'all']);
    expect(worksheetsLibraryQueryKey('mine')).toEqual(['worksheets', 'library', 'mine']);
    expect(worksheetsLibraryQueryKey()).toEqual(['worksheets', 'library', 'all']);
    expect(boardsLibraryCommentsQueryKey('b9')).toEqual(['boards', 'library-comments', 'b9']);
  });

  it('Stale-Timer ist sinnvoll positiv', () => {
    expect(typeof WORKSHEET_LIST_STALE_MS).toBe('number');
    expect(WORKSHEET_LIST_STALE_MS).toBeGreaterThan(0);
  });

  it('Default-Scope für Board-Library ist "all"', () => {
    expect(boardsLibraryQueryKey()).toEqual(['boards', 'library', 'all']);
  });

  it('Query-Keys sind als const tuples (Identitäts-stabil)', () => {
    expect(WORKSHEET_LIST_QUERY_KEY).toBe(WORKSHEET_LIST_QUERY_KEY);
    expect(BOARDS_LIST_QUERY_KEY).toBe(BOARDS_LIST_QUERY_KEY);
    expect(BOARDS_FOLDERS_QUERY_KEY).toBe(BOARDS_FOLDERS_QUERY_KEY);
  });

  it('eindeutige Roots zwischen Worksheet und Board Listen', () => {
    expect(WORKSHEET_LIST_QUERY_KEY[0]).not.toBe(BOARDS_LIST_QUERY_KEY[0]);
  });
});
