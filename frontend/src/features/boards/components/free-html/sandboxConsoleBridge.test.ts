import { describe, expect, it } from 'vitest';
import { isWaBoardSandboxLogPayload, WA_BOARD_SANDBOX_LOG_TYPE } from './sandboxConsoleBridge';

describe('sandboxConsoleBridge', () => {
  it('isWaBoardSandboxLogPayload erkennt gültige Nachrichten', () => {
    expect(
      isWaBoardSandboxLogPayload({
        type: WA_BOARD_SANDBOX_LOG_TYPE,
        token: 't1',
        level: 'error',
        message: 'x',
        ts: 1,
      }),
    ).toBe(true);
  });

  it('isWaBoardSandboxLogPayload lehnt falsche Typen ab', () => {
    expect(isWaBoardSandboxLogPayload(null)).toBe(false);
    expect(isWaBoardSandboxLogPayload({})).toBe(false);
    expect(
      isWaBoardSandboxLogPayload({
        type: 'other',
        token: 't',
        level: 'error',
        message: 'm',
        ts: 1,
      }),
    ).toBe(false);
  });
});
