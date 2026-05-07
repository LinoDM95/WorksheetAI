export class AiGenerationQueueAbortedError extends Error {
  constructor() {
    super('KI-Generierung aus der Warteschlange entfernt.');
    this.name = 'AiGenerationQueueAbortedError';
  }
}

export const isAiGenerationQueueAbortedError = (e: unknown): e is AiGenerationQueueAbortedError =>
  e instanceof AiGenerationQueueAbortedError;
