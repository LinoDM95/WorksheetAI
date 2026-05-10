/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import {
  buildCreativePageHtmlFromFlowSnippets,
  creativeFlowSnippetHostInnerHtmlLines,
  creativeFlowSnippetSetHostInnerHtmlLines,
  creativeFlowSnippetSetPlainText,
  creativeFlowSnippetToPlainText,
  creativeFlowTeacherPlainUnchanged,
  creativeFlowTeacherRichUnchanged,
  defaultCreativeFlowSnippetForKind,
  defaultNewCreativeFlowSnippet,
  parseCreativeFlowItemHtmlSnippets,
  reorderFlowSnippets,
  sanitizeCreativeFlowHostInnerHtml,
} from './creativeHtmlFlow';

describe('parseCreativeFlowItemHtmlSnippets — edge cases', () => {
  it('liefert [""] bei leerem Input', () => {
    expect(parseCreativeFlowItemHtmlSnippets('')).toEqual(['']);
    expect(parseCreativeFlowItemHtmlSnippets('   ')).toEqual(['']);
  });

  it('returnt rohes HTML wenn .ws-creative-page-inner fehlt', () => {
    const html = '<div><p>x</p></div>';
    const sn = parseCreativeFlowItemHtmlSnippets(html);
    expect(sn).toEqual([html]);
  });

  it('mehrere Sections in einem Wrapper bleiben getrennt', () => {
    const html = `<div class="ws-creative-page-inner">
      <section class="ws-flow-item"><p>1</p></section>
      <section class="ws-flow-item"><p>2</p></section>
      <section class="ws-flow-item"><p>3</p></section>
    </div>`;
    expect(parseCreativeFlowItemHtmlSnippets(html)).toHaveLength(3);
  });
});

describe('buildCreativePageHtmlFromFlowSnippets', () => {
  it('rendert leeren Wrapper bei [""]', () => {
    const html = buildCreativePageHtmlFromFlowSnippets(['']);
    expect(html).toBe('<div class="ws-creative-page-inner"></div>');
  });

  it('verbindet mehrere snippets', () => {
    const html = buildCreativePageHtmlFromFlowSnippets(['<p>a</p>', '<p>b</p>']);
    expect(html).toContain('<p>a</p><p>b</p>');
  });
});

describe('sanitizeCreativeFlowHostInnerHtml', () => {
  it('lässt erlaubte Phrasentags durch', () => {
    expect(sanitizeCreativeFlowHostInnerHtml('<strong>a</strong>')).toContain('strong');
    expect(sanitizeCreativeFlowHostInnerHtml('<em>a</em>')).toContain('em');
    expect(sanitizeCreativeFlowHostInnerHtml('<u>a</u>')).toContain('u');
    expect(sanitizeCreativeFlowHostInnerHtml('<b>a</b>')).toContain('b');
    expect(sanitizeCreativeFlowHostInnerHtml('<i>a</i>')).toContain('i');
    expect(sanitizeCreativeFlowHostInnerHtml('a<br>b')).toContain('br');
  });

  it('entfernt Attribute (XSS)', () => {
    const out = sanitizeCreativeFlowHostInnerHtml('<strong onclick="alert(1)">a</strong>');
    expect(out).not.toContain('onclick');
    expect(out).toContain('strong');
  });

  it('entfernt verschachtelte Skripte / Style', () => {
    const out = sanitizeCreativeFlowHostInnerHtml('<strong>a<script>x</script></strong>');
    expect(out).not.toContain('<script');
    expect(out).toContain('a');
  });

  it('liefert "" bei leerer Eingabe', () => {
    expect(sanitizeCreativeFlowHostInnerHtml('')).toBe('');
    expect(sanitizeCreativeFlowHostInnerHtml('   ')).toBe('');
  });
});

describe('creativeFlowSnippetSetPlainText — Robustheit', () => {
  it('macht aus rohem Snippet ein <p>-Block', () => {
    const out = creativeFlowSnippetSetPlainText('', 'eins\nzwei');
    expect(out).toContain('<p>eins</p>');
    expect(out).toContain('<p>zwei</p>');
  });

  it('ergänzt zusätzliche <p> wenn mehr Zeilen als Hosts', () => {
    const sn = '<section class="ws-flow-item"><p>A</p></section>';
    const out = creativeFlowSnippetSetPlainText(sn, 'Neu\nExtra1\nExtra2');
    expect(out).toContain('Extra1');
    expect(out).toContain('Extra2');
  });

  it('escaped HTML-Sonderzeichen bei Roh-Fallback', () => {
    const out = creativeFlowSnippetSetPlainText('', '<x>&"');
    expect(out).toContain('&lt;x&gt;');
    expect(out).toContain('&amp;');
  });

  it('list-items: jeder li ein eigener Host', () => {
    const sn = '<section class="ws-flow-item"><ol><li>eins</li><li>zwei</li></ol></section>';
    const lines = creativeFlowSnippetToPlainText(sn).split('\n');
    expect(lines).toEqual(['eins', 'zwei']);
    const out = creativeFlowSnippetSetPlainText(sn, 'EINS\nZWEI');
    expect(out).toContain('EINS');
    expect(out).toContain('ZWEI');
  });
});

describe('creativeFlowTeacherPlainUnchanged + Rich', () => {
  it('Whitespace-Normalisierung gilt für trailing newlines', () => {
    const sn = '<section class="ws-flow-item"><p>A</p></section>';
    expect(creativeFlowTeacherPlainUnchanged(sn, 'A')).toBe(true);
    expect(creativeFlowTeacherPlainUnchanged(sn, 'A\n')).toBe(true);
    expect(creativeFlowTeacherPlainUnchanged(sn, 'A\r\n\r\n')).toBe(true);
  });

  it('TeacherRichUnchanged false bei Längenmismatch', () => {
    const sn = '<section class="ws-flow-item"><p>A</p></section>';
    expect(creativeFlowTeacherRichUnchanged(sn, ['A', 'B'])).toBe(false);
  });
});

describe('reorderFlowSnippets — edge cases', () => {
  it('returnt original bei from===to', () => {
    const a = ['a', 'b'];
    expect(reorderFlowSnippets(a, 0, 0)).toBe(a);
  });

  it('returnt original bei out-of-range', () => {
    const a = ['a', 'b'];
    expect(reorderFlowSnippets(a, -1, 0)).toBe(a);
    expect(reorderFlowSnippets(a, 0, 99)).toBe(a);
  });
});

describe('defaultNewCreativeFlowSnippet', () => {
  it('liefert ws-flow-item-Snippet', () => {
    const sn = defaultNewCreativeFlowSnippet();
    expect(sn).toContain('ws-flow-item');
  });
});

describe('creativeFlowSnippetHostInnerHtmlLines — leer', () => {
  it('returnt [""] bei leerem snippet', () => {
    expect(creativeFlowSnippetHostInnerHtmlLines('')).toEqual(['']);
  });
});

describe('creativeFlowSnippetSetHostInnerHtmlLines — Fallback ohne Hosts', () => {
  it('rendert <p>-Liste wenn keine Hosts da sind', () => {
    const out = creativeFlowSnippetSetHostInnerHtmlLines('', ['Hallo', 'Welt']);
    expect(out).toContain('<p>');
    expect(out).toContain('Hallo');
    expect(out).toContain('Welt');
  });
});

describe('defaultCreativeFlowSnippetForKind — Inhalt', () => {
  it('task_list enthält ol mit li', () => {
    const sn = defaultCreativeFlowSnippetForKind('task_list');
    expect(sn).toMatch(/<ol[^>]*>/);
    expect(sn).toContain('<li');
  });

  it('table enthält table-Markup', () => {
    const sn = defaultCreativeFlowSnippetForKind('table');
    expect(sn).toContain('<table');
  });

  it('checklist enthält Checkbox', () => {
    const sn = defaultCreativeFlowSnippetForKind('checklist');
    expect(sn).toContain('checkbox');
  });
});
