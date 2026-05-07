/** Kreativ-Arbeitsblatt: logische Abschnitte innerhalb von .ws-creative-page-inner für Lehrer-Oberfläche (ohne Ro-HTML). */

import type { WorksheetBlockKind } from './contentDraft';

export const CREATIVE_PAGE_ROOT_CLASS = 'ws-creative-page-inner';
export const CREATIVE_FLOW_ITEM_CLASS = 'ws-flow-item';

function directChildFlowSections(root: Element): Element[] {
  return Array.from(root.children).filter(
    (el) => el.tagName.toLowerCase() === 'section' && el.classList.contains(CREATIVE_FLOW_ITEM_CLASS),
  );
}

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Parst Seiten-HTML; liefert HTML-Schnipsel je sortierbarem Abschnitt (eine section oder ein Fallback-Chunk). */
export function parseCreativeFlowItemHtmlSnippets(html: string): string[] {
  const raw = String(html || '').trim();
  if (!raw) return [''];
  try {
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    const root = doc.body.querySelector(`.${CREATIVE_PAGE_ROOT_CLASS}`);
    if (!root) return [raw];
    const sections = directChildFlowSections(root);
    if (sections.length > 0) {
      return Array.from(sections).map((s) => s.outerHTML);
    }
    return [root.innerHTML];
  } catch {
    return [raw];
  }
}

/** Baut vollständiges Seiten-Fragment aus Abschnitts-HTML (jeweils section oder Roh-HTML). */
export function buildCreativePageHtmlFromFlowSnippets(snippets: string[]): string {
  const inner = (snippets && snippets.length ? snippets : ['']).map((s) => String(s ?? '')).join('');
  return `<div class="${CREATIVE_PAGE_ROOT_CLASS}">${inner}</div>`;
}

function editableTextHostsInSection(section: Element): Element[] {
  const hosts: Element[] = [];
  const visit = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style') return;
    if (tag === 'svg') {
      el.querySelectorAll('text').forEach((t) => hosts.push(t));
      return;
    }
    if (tag === 'td' || tag === 'th') {
      const nested = el.querySelector('td,th,p,h1,h2,h3,h4,h5,h6,li');
      if (nested) {
        Array.from(el.children).forEach((ch) => visit(ch as Element));
      } else {
        hosts.push(el);
      }
      return;
    }
    if (tag === 'p' || /^h[1-6]$/.test(tag)) {
      hosts.push(el);
      return;
    }
    if (tag === 'li') {
      const span = el.querySelector(':scope > label > span:last-of-type');
      if (span) hosts.push(span);
      else hosts.push(el);
      return;
    }
    Array.from(el.children).forEach((ch) => visit(ch as Element));
  };
  visit(section);
  return hosts;
}

/** Anzeige-Text für ein Abschnitts-HTML (ohne Tags für die Lehrkräfte-Textarea). */
export function creativeFlowSnippetToPlainText(snippet: string): string {
  const s = String(snippet || '');
  if (!s.trim()) return '';
  try {
    const doc = new DOMParser().parseFromString(`<div>${s}</div>`, 'text/html');
    const el = doc.body.firstElementChild;
    if (!el) return '';
    const section = el.querySelector('section.ws-flow-item') ?? el;
    if (section.tagName.toLowerCase() === 'section' && section.classList.contains(CREATIVE_FLOW_ITEM_CLASS)) {
      const hosts = editableTextHostsInSection(section);
      if (hosts.length > 0) {
        const lines = hosts.map((h) => (h.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n').trimEnd());
        return lines.join('\n').replace(/\r\n/g, '\n').trimEnd();
      }
    }
    const t = el.textContent?.replace(/\u00a0/g, ' ') ?? '';
    return t.replace(/\r\n/g, '\n').trim();
  } catch {
    return s;
  }
}

function normalizeTeacherPlainInput(s: string): string {
  return String(s ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

/**
 * True, wenn der Text in der Lehrkraft-Textarea dem extrahierten Klartext des Abschnitts entspricht.
 * Dann kein erneutes Setzen nötig — vermeidet z. B. nach Fokusverlust (Rechtsklick) den Verlust von Tabellen/SVG/Layout,
 * weil {@link creativeFlowSnippetSetPlainText} sonst nur noch einfache &lt;p&gt;-Absätze schreibt.
 */
export function creativeFlowTeacherPlainUnchanged(snippet: string, teacherPlain: string): boolean {
  return (
    normalizeTeacherPlainInput(creativeFlowSnippetToPlainText(snippet)) ===
    normalizeTeacherPlainInput(teacherPlain)
  );
}

const RICH_HOST_ALLOWED_TAGS = new Set(['STRONG', 'B', 'EM', 'I', 'U', 'BR']);

/** Erlaubt nur einfache Phrasen-Tags (Fett, Kursiv, Unterstrichen, Zeilenumbruch) — reduziert XSS-Risiko beim Lehrer-HTML. */
export function sanitizeCreativeFlowHostInnerHtml(html: string): string {
  const raw = String(html ?? '');
  if (raw.trim() === '') return '';
  try {
    const doc = new DOMParser().parseFromString(`<div>${raw}</div>`, 'text/html');
    const root = doc.body.firstElementChild;
    if (!root || root.tagName.toLowerCase() !== 'div') return escapeHtmlText(raw);
    sanitizeRichHostElement(root);
    return root.innerHTML;
  } catch {
    return escapeHtmlText(raw);
  }
}

function sanitizeRichHostElement(el: Element): void {
  const children = [...el.children];
  for (const child of children) {
    const tag = child.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE') {
      child.remove();
      continue;
    }
    if (!RICH_HOST_ALLOWED_TAGS.has(tag)) {
      const parent = child.parentElement;
      if (!parent) continue;
      while (child.firstChild) parent.insertBefore(child.firstChild, child);
      child.remove();
      sanitizeRichHostElement(el);
      return;
    }
    while (child.attributes.length > 0) {
      child.removeAttributeNode(child.attributes[0]!);
    }
    sanitizeRichHostElement(child);
  }
}

function normalizeRichLineForCompare(html: string): string {
  return sanitizeCreativeFlowHostInnerHtml(html);
}

/** Inner HTML je bearbeitbarem Text-Host (gleiche Reihenfolge wie Klartextzeilen). */
export function creativeFlowSnippetHostInnerHtmlLines(snippet: string): string[] {
  const s = String(snippet || '');
  if (!s.trim()) return [''];
  try {
    const doc = new DOMParser().parseFromString(`<div>${s}</div>`, 'text/html');
    const el = doc.body.firstElementChild;
    if (!el) return [''];
    const section = el.querySelector('section.ws-flow-item') ?? el;
    if (section.tagName.toLowerCase() === 'section' && section.classList.contains(CREATIVE_FLOW_ITEM_CLASS)) {
      const hosts = editableTextHostsInSection(section);
      if (hosts.length > 0) {
        return hosts.map((h) => sanitizeCreativeFlowHostInnerHtml(h.innerHTML));
      }
    }
    return [sanitizeCreativeFlowHostInnerHtml(el.textContent ?? '')];
  } catch {
    return [''];
  }
}

export function creativeFlowTeacherRichUnchanged(snippet: string, teacherLines: string[]): boolean {
  const cur = creativeFlowSnippetHostInnerHtmlLines(snippet);
  if (cur.length !== teacherLines.length) return false;
  for (let i = 0; i < cur.length; i += 1) {
    if (normalizeRichLineForCompare(cur[i] ?? '') !== normalizeRichLineForCompare(teacherLines[i] ?? '')) {
      return false;
    }
  }
  return true;
}

/** Wie {@link creativeFlowSnippetSetPlainText}, aber pro Host fragmentiertes HTML (nur erlaubte Phrasen-Tags). */
export function creativeFlowSnippetSetHostInnerHtmlLines(snippet: string, linesHtml: string[]): string {
  const lines = (linesHtml && linesHtml.length ? linesHtml : ['']).map((l) => sanitizeCreativeFlowHostInnerHtml(String(l ?? '')));
  const doc = new DOMParser().parseFromString(`<div>${String(snippet || '')}</div>`, 'text/html');
  const section = doc.body.querySelector('section.ws-flow-item');
  if (section) {
    const hosts = editableTextHostsInSection(section);
    if (hosts.length > 0) {
      for (let i = 0; i < hosts.length; i += 1) {
        hosts[i].innerHTML = lines[i] ?? '';
      }
      for (let j = hosts.length; j < lines.length; j += 1) {
        const frag = lines[j];
        if (frag === '') continue;
        const p = section.ownerDocument.createElement('p');
        p.innerHTML = frag;
        section.appendChild(p);
      }
      return section.outerHTML;
    }
    section.innerHTML = lines.map((l) => `<p>${l}</p>`).join('');
    return section.outerHTML;
  }
  return lines.map((l) => `<p>${l}</p>`).join('');
}

function collectTextNodes(el: Element): Text[] {
  const doc = el.ownerDocument;
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) {
    texts.push(n as Text);
  }
  return texts;
}

function hostHasPhrasingFormat(host: Element): boolean {
  return (
    host.querySelector(
      'strong,em,b,i,u,mark,sub,sup,a[href],small,s,del,ins,span.font-bold,span.font-semibold,span.font-medium,span.font-extrabold',
    ) != null
  );
}

/**
 * Setzt den sichtbaren Fließtext in einem Host (p, td, …), ohne phrasenweise Formatierung zu entfernen.
 * Ein-Textknoten-Fall (typ. <td><strong>x</strong></td>): ein Schreibvorgang.
 * Mehrere Textknoten + Inline-Tags: bei gleicher Zeichenlänge wie vorher werden die Segmente 1:1 neu befüllt;
 * sonst proportionale Aufteilung (best effort).
 */
function setHostPlainPreservingInline(host: Element, line: string): void {
  const lineNorm = String(line ?? '');
  const texts = collectTextNodes(host);
  const parts = texts.map((t) => t.nodeValue ?? '');
  const oldJoined = parts.join('');
  if (oldJoined === lineNorm) return;

  if (texts.length === 0) {
    host.textContent = lineNorm;
    return;
  }
  if (texts.length === 1) {
    texts[0].nodeValue = lineNorm;
    return;
  }

  if (!hostHasPhrasingFormat(host)) {
    host.textContent = lineNorm;
    return;
  }

  const oldLens = parts.map((p) => p.length);
  const sum = oldLens.reduce((a, b) => a + b, 0);
  if (sum === 0) {
    texts[0].nodeValue = lineNorm;
    for (let i = 1; i < texts.length; i += 1) {
      texts[i].nodeValue = '';
    }
    return;
  }

  const L = lineNorm.length;
  if (L === sum) {
    let pos = 0;
    for (let i = 0; i < texts.length; i += 1) {
      const len = oldLens[i];
      texts[i].nodeValue = lineNorm.slice(pos, pos + len);
      pos += len;
    }
    return;
  }

  let pos = 0;
  for (let i = 0; i < texts.length; i += 1) {
    if (i === texts.length - 1) {
      texts[i].nodeValue = lineNorm.slice(pos);
    } else {
      const take = Math.floor((L * oldLens[i]) / sum);
      texts[i].nodeValue = lineNorm.slice(pos, pos + take);
      pos += take;
    }
  }
}

function applyPlainToEditableHosts(section: Element, hosts: Element[], plainText: string): void {
  const lines = String(plainText ?? '').split(/\r?\n/);
  for (let i = 0; i < hosts.length; i += 1) {
    setHostPlainPreservingInline(hosts[i], lines[i] ?? '');
  }
  for (let j = hosts.length; j < lines.length; j += 1) {
    const line = lines[j];
    if (line === '') continue;
    const p = section.ownerDocument.createElement('p');
    p.textContent = line;
    section.appendChild(p);
  }
}

/** Setzt sichtbaren Text eines Abschnitts; behält Layout (Tabellen, Listen, SVG-Text …), wenn erkennbar. */
export function creativeFlowSnippetSetPlainText(snippet: string, plainText: string): string {
  const text = String(plainText ?? '');
  const doc = new DOMParser().parseFromString(`<div>${String(snippet || '')}</div>`, 'text/html');
  const section = doc.body.querySelector('section.ws-flow-item');
  if (section) {
    const hosts = editableTextHostsInSection(section);
    if (hosts.length > 0) {
      applyPlainToEditableHosts(section, hosts, text);
      return section.outerHTML;
    }
    const lines = text.split(/\r?\n/);
    section.innerHTML = lines.map((l) => `<p>${escapeHtmlText(l)}</p>`).join('');
    return section.outerHTML;
  }
  const lines = text.split(/\r?\n/);
  return lines.map((l) => `<p>${escapeHtmlText(l)}</p>`).join('');
}

export function defaultNewCreativeFlowSnippet(): string {
  return defaultCreativeFlowSnippetForKind('text');
}

/** Neuer Abschnitt im Kreativmodus — gleiche Typen wie in der Standard-Bearbeitung (Starthtml pro Typ). */
export function defaultCreativeFlowSnippetForKind(kind: WorksheetBlockKind): string {
  switch (kind) {
    case 'text':
      return '<section class="ws-flow-item"><h3>Neuer Abschnitt</h3><p>Hier Text eingeben.</p></section>';
    case 'task_list':
      return '<section class="ws-flow-item"><h3>Aufgaben</h3><ol class="list-decimal pl-6 space-y-2"><li>Erste Teilaufgabe</li><li>Zweite Teilaufgabe</li></ol></section>';
    case 'task_grid':
      return '<section class="ws-flow-item"><table class="worksheet-table"><thead><tr><th>Aufgabe</th><th>Antwort / Notizen</th></tr></thead><tbody><tr><td>1</td><td></td></tr><tr><td>2</td><td></td></tr></tbody></table></section>';
    case 'writing_lines':
      return '<section class="ws-flow-item"><h3>Schreiben</h3><div class="writing-line"></div><div class="writing-line"></div><div class="writing-line"></div><div class="writing-line"></div><div class="writing-line"></div></section>';
    case 'drawing_box':
      return '<section class="ws-flow-item"><h3>Zeichnen</h3><div style="min-height:12rem;border:1px solid #64748b;border-radius:4px;background:#fafafa;"></div></section>';
    case 'diagram':
      return '<section class="ws-flow-item"><h3>Diagramm</h3><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120" style="max-width:100%;height:auto;border:1px solid #e5e7eb;border-radius:4px;background:#fff;"><rect x="10" y="10" width="80" height="60" fill="#dbeafe" stroke="#64748b"/><text x="200" y="70" text-anchor="middle" font-size="14" fill="#334155">Platzhalter — KI oder manuell ersetzen</text></svg></section>';
    case 'checklist':
      return '<section class="ws-flow-item"><h3>Checkliste</h3><ul class="list-none space-y-2 pl-0"><li><label class="flex items-start gap-2"><input type="checkbox" disabled class="mt-1"/> <span>Erster Punkt</span></label></li><li><label class="flex items-start gap-2"><input type="checkbox" disabled class="mt-1"/> <span>Zweiter Punkt</span></label></li></ul></section>';
    case 'table':
      return '<section class="ws-flow-item"><table class="worksheet-table"><tbody><tr><th>Spalte A</th><th>Spalte B</th></tr><tr><td></td><td></td></tr><tr><td></td><td></td></tr></tbody></table></section>';
    default:
      return '<section class="ws-flow-item"><p><em>Neuer Abschnitt — hier Text eingeben.</em></p></section>';
  }
}

export function reorderFlowSnippets(snippets: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= snippets.length || to >= snippets.length) {
    return snippets;
  }
  const next = [...snippets];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
