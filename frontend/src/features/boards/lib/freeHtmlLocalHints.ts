/** Leichte Client-Hinweise für den Editor — Backend-Validierung ist maßgeblich. */

const FORBIDDEN_JS_TOKENS: { label: string; re: RegExp }[] = [
  { label: 'fetch(', re: /\bfetch\s*\(/ },
  { label: 'XMLHttpRequest', re: /\bXMLHttpRequest\b/ },
  { label: 'WebSocket', re: /\bWebSocket\b/ },
  { label: 'EventSource', re: /\bEventSource\b/ },
  { label: 'localStorage', re: /\blocalStorage\b/ },
  { label: 'sessionStorage', re: /\bsessionStorage\b/ },
  { label: 'indexedDB', re: /\bindexedDB\b/ },
  { label: 'document.cookie', re: /\bdocument\.cookie\b/ },
  { label: 'eval(', re: /\beval\s*\(/ },
  { label: 'new Function(', re: /\bnew\s+Function\s*\(/ },
  { label: 'import()', re: /\bimport\s*\(/ },
  { label: 'window.top', re: /\bwindow\.top\b/ },
  { label: 'window.parent', re: /\bwindow\.parent\b/ },
  { label: 'top.', re: /(?<![A-Za-z0-9_$])top\s*\./ },
  { label: 'parent.', re: /(?<![A-Za-z0-9_$])parent\s*\./ },
  { label: 'opener', re: /\bopener\b/ },
  { label: 'alert(', re: /\balert\s*\(/ },
  { label: 'confirm(', re: /\bconfirm\s*\(/ },
  { label: 'prompt(', re: /\bprompt\s*\(/ },
  { label: 'location.href', re: /\blocation\.href\b/ },
  { label: 'location.assign', re: /\blocation\.assign\b/ },
  { label: 'location.replace', re: /\blocation\.replace\b/ },
  { label: 'document.write', re: /\bdocument\.write\b/ },
  { label: 'serviceWorker', re: /\bserviceWorker\b/ },
  { label: 'Notification', re: /\bNotification\b/ },
  { label: 'navigator.geolocation', re: /\bnavigator\.geolocation\b/ },
  { label: 'navigator.clipboard', re: /\bnavigator\.clipboard\b/ },
  { label: 'new Worker', re: /\bnew\s+Worker\b/ },
  { label: 'new SharedWorker', re: /\bnew\s+SharedWorker\b/ },
];

export const collectFreeHtmlLocalWarnings = (html: string, css: string, js: string): string[] => {
  const w: string[] = [];
  if (/<\s*script/i.test(html || '')) {
    w.push('Im HTML wurden <script>-Vorkommen gefunden — der Server entfernt diese beim Speichern.');
  }
  if (/\bon\w+\s*=/i.test(html || '')) {
    w.push('Im HTML gibt es mögliche Inline-Event-Handler.');
  }
  for (const t of FORBIDDEN_JS_TOKENS) {
    if (t.re.test(js || '')) {
      w.push(`JavaScript enthält ein blockiertes Muster: ${t.label}.`);
    }
  }
  if (/@import/i.test(css || '')) {
    w.push('CSS enthält @import — wird beim Speichern entfernt oder ersetzt.');
  }
  if (
    /\b(href|src)\s*=\s*["']?\s*https?:/i.test(html || '') ||
    /\burl\s*\(\s*["']?\s*https?:/i.test(css || '')
  ) {
    w.push(
      'Es wurden http(s)-URLs im Markup oder CSS gefunden — Ziel ist ein möglichst offline-fähiges Board.',
    );
  }
  if (/javascript:/i.test(html || '')) {
    w.push('HTML enthält javascript:-URLs.');
  }
  return w;
};
