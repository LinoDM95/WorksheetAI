/** True, wenn das Dokument gerade im Browser-Vollbild ist (inkl. älteres WebKit). */
export function isDocumentFullscreenActive(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.fullscreenElement) return true;
  const d = document as Document & { webkitFullscreenElement?: Element | null };
  return Boolean(d.webkitFullscreenElement);
}

/** Beendet Element-Vollbild (z. B. Tafel-Vorschau), damit Overlays im normalen Dokument sichtbar sind. */
export async function exitElementFullscreen(): Promise<void> {
  if (typeof document === 'undefined' || !isDocumentFullscreenActive()) return;
  try {
    if (typeof document.exitFullscreen === 'function' && document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
  } catch {
    /* Fall-through zu WebKit */
  }
  try {
    const doc = document as Document & { webkitExitFullscreen?: () => void };
    if (typeof doc.webkitExitFullscreen === 'function') {
      doc.webkitExitFullscreen();
    }
  } catch {
    /* ignore */
  }
}

type FsElement = HTMLElement & {
  requestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
  webkitRequestFullscreen?: () => void;
};

async function requestFullscreenOnElement(el: FsElement): Promise<boolean> {
  const rf = el.requestFullscreen;
  if (typeof rf === 'function') {
    try {
      await rf.call(el, { navigationUI: 'hide' });
      return true;
    } catch {
      try {
        await rf.call(el);
        return true;
      } catch {
        /* WebKit / nächster Kandidat */
      }
    }
  }
  const wk = el.webkitRequestFullscreen;
  if (typeof wk === 'function') {
    try {
      wk.call(el);
      return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

/** Fragt Vollbild an: zuerst `document.documentElement`, dann `document.body` (hilft bei Querformat-Quirks). */
export async function requestDocumentFullscreen(): Promise<void> {
  if (typeof document === 'undefined') return;

  const candidates: FsElement[] = [document.documentElement, document.body].filter(
    (node): node is FsElement => Boolean(node),
  );

  for (const el of candidates) {
    if (await requestFullscreenOnElement(el)) return;
  }
}
