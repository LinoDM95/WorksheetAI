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

export async function requestDocumentFullscreen(): Promise<void> {
  const el = document.documentElement;

  if (typeof el.requestFullscreen === 'function') {
    try {
      await el.requestFullscreen();
      return;
    } catch {
      return;
    }
  }

  const wk = el as HTMLElement & { webkitRequestFullscreen?: () => void };
  if (typeof wk.webkitRequestFullscreen === 'function') {
    try {
      wk.webkitRequestFullscreen();
    } catch {
      /* nicht unterstützt oder blockiert */
    }
  }
}
