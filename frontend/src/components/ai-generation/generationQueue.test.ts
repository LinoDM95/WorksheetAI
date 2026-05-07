import { describe, expect, it } from 'vitest';
import {
  AiGenerationQueueAbortedError,
  isAiGenerationQueueAbortedError,
} from './generationQueue';

describe('generationQueue', () => {
  it('erkennt Abbruch-Fehler', () => {
    expect(isAiGenerationQueueAbortedError(new AiGenerationQueueAbortedError())).toBe(true);
    expect(isAiGenerationQueueAbortedError(new Error('x'))).toBe(false);
  });
});
