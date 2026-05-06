import { describe, expect, it } from 'vitest';

import {
  BOARDS_DETAIL_QUERY_KEY,
  BOARDS_FOLDERS_QUERY_KEY,
  BOARDS_LIST_QUERY_KEY,
  BOARDS_REVISIONS_QUERY_KEY,
  PATTERNS_LIST_QUERY_KEY,
  WORKSHEET_LIST_QUERY_KEY,
  boardsLibraryQueryKey,
  boardLibraryEntryQueryKey,
} from './listQueries';

describe('listQueries keys', () => {
  it('uses stable tuple roots for lists', () => {
    expect(WORKSHEET_LIST_QUERY_KEY).toEqual(['worksheets', 'list']);
    expect(PATTERNS_LIST_QUERY_KEY).toEqual(['patterns', 'list']);
    expect(BOARDS_LIST_QUERY_KEY).toEqual(['boards', 'list']);
  });

  it('scopes board detail and revisions by id', () => {
    expect(BOARDS_DETAIL_QUERY_KEY('abc')).toEqual(['boards', 'detail', 'abc']);
    expect(BOARDS_REVISIONS_QUERY_KEY('abc')).toEqual(['boards', 'revisions', 'abc']);
    expect(BOARDS_FOLDERS_QUERY_KEY).toEqual(['boards', 'folders']);
    expect(boardsLibraryQueryKey('all')).toEqual(['boards', 'library', 'all']);
    expect(boardsLibraryQueryKey('mine')).toEqual(['boards', 'library', 'mine']);
    expect(boardLibraryEntryQueryKey('b1')).toEqual(['boards', 'library-entry', 'b1']);
  });
});
