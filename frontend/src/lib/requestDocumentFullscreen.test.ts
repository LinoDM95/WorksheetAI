import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exitElementFullscreen, requestDocumentFullscreen } from './requestDocumentFullscreen';

describe('exitElementFullscreen', () => {
  const orig = globalThis.document;

  afterEach(() => {
    globalThis.document = orig as Document;
  });

  it('beendet aktiv, wenn exitFullscreen existiert', async () => {
    const exit = vi.fn().mockResolvedValue(undefined);
    (globalThis as unknown as { document: Document }).document = {
      get fullscreenElement() {
        return {};
      },
      exitFullscreen: exit,
    } as unknown as Document;

    await exitElementFullscreen();

    expect(exit).toHaveBeenCalledOnce();
  });
});

describe('requestDocumentFullscreen', () => {
  const orig = globalThis.document;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.document = orig as Document;
  });

  it('nutzt documentElement.requestFullscreen wenn vorhanden', async () => {
    const req = vi.fn().mockResolvedValue(undefined);
    (globalThis as unknown as { document: Document }).document = {
      documentElement: { requestFullscreen: req },
    } as unknown as Document;

    await requestDocumentFullscreen();

    expect(req).toHaveBeenCalledOnce();
  });

  it('fällt auf webkitRequestFullscreen zurück', async () => {
    const webkit = vi.fn();
    const el = {};
    Object.assign(el, { webkitRequestFullscreen: webkit });
    (globalThis as unknown as { document: Document }).document = {
      documentElement: el,
    } as unknown as Document;

    await requestDocumentFullscreen();

    expect(webkit).toHaveBeenCalledOnce();
  });
});
