import { describe, expect, it, vi } from 'vitest';
import {
  notifyAuthSessionExpired,
  registerAuthSessionExpiredHandler,
  resetAuthSessionExpiredFlag,
} from './authSessionBridge';

describe('authSessionBridge', () => {
  it('calls handler once until reset', () => {
    const fn = vi.fn();
    registerAuthSessionExpiredHandler(fn);
    resetAuthSessionExpiredFlag();
    notifyAuthSessionExpired();
    notifyAuthSessionExpired();
    expect(fn).toHaveBeenCalledTimes(1);
    resetAuthSessionExpiredFlag();
    notifyAuthSessionExpired();
    expect(fn).toHaveBeenCalledTimes(2);
    registerAuthSessionExpiredHandler(null);
  });
});
