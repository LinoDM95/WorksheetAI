import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  notifyAuthSessionExpired,
  registerAuthSessionExpiredHandler,
  resetAuthSessionExpiredFlag,
} from './authSessionBridge';

describe('authSessionBridge', () => {
  beforeEach(() => {
    registerAuthSessionExpiredHandler(null);
    resetAuthSessionExpiredFlag();
  });

  afterEach(() => {
    registerAuthSessionExpiredHandler(null);
    resetAuthSessionExpiredFlag();
  });

  it('calls handler once until reset', () => {
    const fn = vi.fn();
    registerAuthSessionExpiredHandler(fn);
    notifyAuthSessionExpired();
    notifyAuthSessionExpired();
    expect(fn).toHaveBeenCalledTimes(1);
    resetAuthSessionExpiredFlag();
    notifyAuthSessionExpired();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('macht nichts ohne registrierten Handler', () => {
    expect(() => notifyAuthSessionExpired()).not.toThrow();
    // Ein zweiter Aufruf ist weiterhin idempotent
    expect(() => notifyAuthSessionExpired()).not.toThrow();
  });

  it('schluckt Fehler im Handler aber blockiert weitere Notifies (idempotent)', () => {
    const fn = vi.fn(() => {
      throw new Error('navigate-fail');
    });
    registerAuthSessionExpiredHandler(fn);
    expect(() => notifyAuthSessionExpired()).not.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
    // Flag bleibt gesetzt – kein weiterer Aufruf bis reset
    notifyAuthSessionExpired();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('Handler-Wechsel zur Laufzeit greift nach reset', () => {
    const a = vi.fn();
    const b = vi.fn();
    registerAuthSessionExpiredHandler(a);
    notifyAuthSessionExpired();
    expect(a).toHaveBeenCalledTimes(1);
    resetAuthSessionExpiredFlag();
    registerAuthSessionExpiredHandler(b);
    notifyAuthSessionExpired();
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledTimes(1);
  });

  it('Unregister via null entfernt Handler', () => {
    const fn = vi.fn();
    registerAuthSessionExpiredHandler(fn);
    registerAuthSessionExpiredHandler(null);
    notifyAuthSessionExpired();
    expect(fn).not.toHaveBeenCalled();
  });
});
