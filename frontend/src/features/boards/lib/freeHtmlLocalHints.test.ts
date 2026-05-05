import { describe, expect, it } from 'vitest';

import { collectFreeHtmlLocalWarnings } from './freeHtmlLocalHints';

describe('collectFreeHtmlLocalWarnings', () => {
  it('flags script in html', () => {
    const w = collectFreeHtmlLocalWarnings('<script>x</script>', '', '');
    expect(w.some((x) => x.includes('<script>'))).toBe(true);
  });

  it('flags fetch in js', () => {
    const w = collectFreeHtmlLocalWarnings('', '', "fetch('/x')");
    expect(w.some((x) => x.includes('fetch'))).toBe(true);
  });

  it('flags external http url in html', () => {
    const w = collectFreeHtmlLocalWarnings('<img src="https://a.test/x">', '', '');
    expect(w.some((x) => x.toLowerCase().includes('http'))).toBe(true);
  });

  it('returns empty for minimal safe bundle', () => {
    expect(collectFreeHtmlLocalWarnings('<p>ok</p>', '.x{}', 'const a = 1')).toEqual([]);
  });
});
