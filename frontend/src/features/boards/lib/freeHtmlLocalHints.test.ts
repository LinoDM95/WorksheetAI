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

  it('flagt inline event handler in HTML (z. B. onclick=)', () => {
    const w = collectFreeHtmlLocalWarnings('<button onclick="x()">x</button>', '', '');
    expect(w.some((x) => x.toLowerCase().includes('event-handler'))).toBe(true);
  });

  it('flagt @import in CSS', () => {
    const w = collectFreeHtmlLocalWarnings('', '@import "x.css";', '');
    expect(w.some((x) => x.includes('@import'))).toBe(true);
  });

  it('flagt javascript:-URLs in HTML', () => {
    const w = collectFreeHtmlLocalWarnings('<a href="javascript:alert(1)">x</a>', '', '');
    expect(w.some((x) => x.toLowerCase().includes('javascript:'))).toBe(true);
  });

  it('flagt http(s) URL in CSS via url(...)', () => {
    const w = collectFreeHtmlLocalWarnings('', '.x { background: url(https://x.test/a.png); }', '');
    expect(w.some((x) => x.toLowerCase().includes('http'))).toBe(true);
  });

  it.each([
    ['XMLHttpRequest', 'new XMLHttpRequest()'],
    ['WebSocket', 'new WebSocket("/x")'],
    ['EventSource', 'new EventSource("/x")'],
    ['localStorage', 'localStorage.getItem("a")'],
    ['sessionStorage', 'sessionStorage.setItem("a","b")'],
    ['indexedDB', 'indexedDB.open("a")'],
    ['document.cookie', 'document.cookie = "a=b"'],
    ['eval(', 'eval("1+1")'],
    ['new Function(', 'new Function("return 1")'],
    ['import()', 'import("./x.js")'],
    ['window.top', 'window.top'],
    ['window.parent', 'window.parent'],
    ['opener', 'window.opener'],
    ['alert(', 'alert("x")'],
    ['confirm(', 'confirm("x")'],
    ['prompt(', 'prompt("x")'],
    ['location.href', 'location.href = "/y"'],
    ['location.assign', 'location.assign("/y")'],
    ['location.replace', 'location.replace("/y")'],
    ['document.write', 'document.write("<x>")'],
    ['serviceWorker', 'navigator.serviceWorker.register("/sw")'],
    ['Notification', 'new Notification("x")'],
    ['navigator.geolocation', 'navigator.geolocation.getCurrentPosition(()=>{})'],
    ['navigator.clipboard', 'navigator.clipboard.writeText("x")'],
    ['new Worker', 'new Worker("/w.js")'],
    ['new SharedWorker', 'new SharedWorker("/w.js")'],
  ])('flagt blockiertes JS-Muster %s', (label, snippet) => {
    const w = collectFreeHtmlLocalWarnings('', '', snippet);
    expect(w.some((x) => x.includes(label))).toBe(true);
  });

  it('liefert mehrere Warnungen, wenn mehrere Patterns greifen', () => {
    const w = collectFreeHtmlLocalWarnings(
      '<script>x</script><a href="javascript:1">x</a>',
      '@import "y.css";',
      'fetch("/x")',
    );
    expect(w.length).toBeGreaterThanOrEqual(4);
  });
});
