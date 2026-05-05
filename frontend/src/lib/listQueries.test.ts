import { describe, expect, it } from 'vitest';

import {
  BOARDS_DETAIL_QUERY_KEY,
  BOARDS_FOLDERS_QUERY_KEY,
  BOARDS_LIBRARY_QUERY_KEY,
  BOARDS_LIST_QUERY_KEY,
  BOARDS_REVISIONS_QUERY_KEY,
  PATTERNS_LIST_QUERY_KEY,
  WORKSHEET_LIST_QUERY_KEY,
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
    expect(BOARDS_LIBRARY_QUERY_KEY).toEqual(['boards', 'library']);
  });
});
