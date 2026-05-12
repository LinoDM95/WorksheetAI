import { describe, expect, it } from 'vitest';
import {
  AiGenerationQueueAbortedError,
  isAiGenerationQueueAbortedError,
  isUserCancelledGenerationError,
} from './generationQueue';

describe('generationQueue', () => {
  it('erkennt Abbruch-Fehler', () => {
    expect(isAiGenerationQueueAbortedError(new AiGenerationQueueAbortedError())).toBe(true);
    expect(isAiGenerationQueueAbortedError(new Error('x'))).toBe(false);
  });

  it('AiGenerationQueueAbortedError ist Error-Subklasse mit korrektem Namen', () => {
    const err = new AiGenerationQueueAbortedError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('AiGenerationQueueAbortedError');
    expect(err.message).toMatch(/Warteschlange/i);
  });

  it('gibt false für nicht-Error Werte zurück', () => {
    expect(isAiGenerationQueueAbortedError(null)).toBe(false);
    expect(isAiGenerationQueueAbortedError(undefined)).toBe(false);
    expect(isAiGenerationQueueAbortedError('AiGenerationQueueAbortedError')).toBe(false);
    expect(isAiGenerationQueueAbortedError({ name: 'AiGenerationQueueAbortedError' })).toBe(false);
    expect(isAiGenerationQueueAbortedError(42)).toBe(false);
  });

  it('unterscheidet von anderen Error-Subklassen', () => {
    expect(isAiGenerationQueueAbortedError(new TypeError('foo'))).toBe(false);
    expect(isAiGenerationQueueAbortedError(new RangeError('bar'))).toBe(false);
  });

  it('isUserCancelledGenerationError: Warteschlange + Abort-/Cancel-Signale', () => {
    expect(isUserCancelledGenerationError(new AiGenerationQueueAbortedError())).toBe(true);
    const abortErr = new DOMException('Aborted', 'AbortError');
    expect(isUserCancelledGenerationError(abortErr)).toBe(true);
    const canceled = Object.assign(new Error('canceled'), { name: 'CanceledError', code: 'ERR_CANCELED' });
    expect(isUserCancelledGenerationError(canceled)).toBe(true);
    expect(isUserCancelledGenerationError(new Error('network'))).toBe(false);
  });
});
