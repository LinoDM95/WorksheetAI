/** Beendet Element-Vollbild (z. B. Tafel-Vorschau), damit Overlays im normalen Dokument sichtbar sind. */
export async function exitElementFullscreen(): Promise<void> {
  if (typeof document === 'undefined' || !document.fullscreenElement) return;
  try {
    await document.exitFullscreen();
  } catch {
    try {
      const doc = document as Document & { webkitExitFullscreen?: () => void };
      if (typeof doc.webkitExitFullscreen === 'function') {
        doc.webkitExitFullscreen();
      }
    } catch {
      /* ignore */
    }
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
