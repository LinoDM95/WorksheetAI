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
  parseCreativeFlowItemHtmlSnippets,
  reorderFlowSnippets,
  sanitizeCreativeFlowHostInnerHtml,
} from './creativeHtmlFlow';

describe('creativeHtmlFlow', () => {
  it('parst section.ws-flow-item Abschnitte', () => {
    const html = `<div class="ws-creative-page-inner"><section class="ws-flow-item"><p>A</p></section><section class="ws-flow-item"><p>B</p></section></div>`;
    const sn = parseCreativeFlowItemHtmlSnippets(html);
    expect(sn).toHaveLength(2);
    expect(sn[0]).toContain('A');
    expect(sn[1]).toContain('B');
  });

  it('Fallback: ein Chunk für inneres Markup ohne sections', () => {
    const html = `<div class="ws-creative-page-inner"><p>Alles</p></div>`;
    const sn = parseCreativeFlowItemHtmlSnippets(html);
    expect(sn).toEqual(['<p>Alles</p>']);
  });

  it('baut Seite aus Schnipseln und setzt Klartext in section', () => {
    const built = buildCreativePageHtmlFromFlowSnippets([
      '<section class="ws-flow-item"><p>x</p></section>',
    ]);
    expect(built).toContain('ws-creative-page-inner');
    const next = creativeFlowSnippetSetPlainText(
      '<section class="ws-flow-item"><p>alt</p></section>',
      'neu\nzeile',
    );
    expect(next).toContain('neu');
    expect(next).toContain('zeile');
    expect(next.startsWith('<section class="ws-flow-item">')).toBe(true);
  });

  it('Struktur bleibt bei Tabellen-Zellen erhalten', () => {
    const sn =
      '<section class="ws-flow-item"><table class="worksheet-table"><tr><td>A</td><td>B</td></tr></table></section>';
    const next = creativeFlowSnippetSetPlainText(sn, 'X\nB');
    expect(next).toContain('<table');
    expect(next).toContain('>X<');
    expect(next).toContain('>B<');
  });

  it('Behält dichte Schrift (strong) bei einem Textrun', () => {
    const sn = '<section class="ws-flow-item"><p>Ein <strong>fettes</strong> Wort.</p></section>';
    const next = creativeFlowSnippetSetPlainText(sn, 'Ein FETTES Wort.');
    expect(next).toMatch(/<strong[^>]*>\s*FETTES\s*<\/strong>/);
    expect(next).toContain('Wort.');
  });

  it('Behält strong bei gleicher Gesamtlänge (Segment-Mapping)', () => {
    const sn = '<section class="ws-flow-item"><p><span>a </span><strong>bc</strong></p></section>';
    const plainBefore = creativeFlowSnippetToPlainText(sn);
    expect(plainBefore.replace(/\s+/g, '')).toBe('abc');
    const next = creativeFlowSnippetSetPlainText(sn, 'x yz');
    expect(next).toContain('<strong>');
    expect(next).toContain('yz');
  });

  it('Klartext aus Snippet', () => {
    expect(creativeFlowSnippetToPlainText('<section class="ws-flow-item"><p>Hallo</p></section>')).toBe('Hallo');
  });

  it('creativeFlowTeacherPlainUnchanged: Tabellen-Markup bleibt bei unverändertem Klartext „geschützt“', () => {
    const sn =
      '<section class="ws-flow-item"><table class="worksheet-table"><tr><td>Zelle</td></tr></table></section>';
    const plain = creativeFlowSnippetToPlainText(sn);
    expect(creativeFlowTeacherPlainUnchanged(sn, plain)).toBe(true);
    expect(creativeFlowTeacherPlainUnchanged(sn, `${plain}\n`)).toBe(true);
    expect(creativeFlowTeacherPlainUnchanged(sn, 'Anderer')).toBe(false);
  });

  it('reorderFlowSnippets', () => {
    expect(reorderFlowSnippets(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });

  it('sanitizeCreativeFlowHostInnerHtml entfernt Skripte und fremde Tags', () => {
    expect(sanitizeCreativeFlowHostInnerHtml('Hallo<script>alert(1)</script>')).toBe('Hallo');
    expect(sanitizeCreativeFlowHostInnerHtml('<p>a</p>')).toBe('a');
    expect(sanitizeCreativeFlowHostInnerHtml('<strong>x</strong>')).toContain('strong');
  });

  it('Host-HTML-Zeilen: Roundtrip mit Fett', () => {
    const sn = '<section class="ws-flow-item"><p>Ein <strong>Wort</strong>.</p></section>';
    const lines = creativeFlowSnippetHostInnerHtmlLines(sn);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('strong');
    const back = creativeFlowSnippetSetHostInnerHtmlLines(sn, ['Neues <b>fett</b>.']);
    expect(back).toContain('<b>');
    expect(creativeFlowSnippetToPlainText(back)).toMatch(/Neues/);
  });

  it('creativeFlowTeacherRichUnchanged', () => {
    const sn = '<section class="ws-flow-item"><p>A</p></section>';
    const lines = creativeFlowSnippetHostInnerHtmlLines(sn);
    expect(creativeFlowTeacherRichUnchanged(sn, lines)).toBe(true);
    expect(creativeFlowTeacherRichUnchanged(sn, ['B'])).toBe(false);
  });

  it('defaultCreativeFlowSnippetForKind liefert ws-flow-item pro Typ', () => {
    for (const kind of [
      'text',
      'task_list',
      'task_grid',
      'writing_lines',
      'drawing_box',
      'diagram',
      'checklist',
      'table',
    ] as const) {
      const sn = defaultCreativeFlowSnippetForKind(kind);
      expect(sn).toMatch(/<section class="ws-flow-item">/);
    }
  });
});
