import { describe, expect, it } from 'vitest';
import { LG_MEDIA_QUERY } from './useMediaQuery';

describe('LG_MEDIA_QUERY', () => {
  it('entspricht Tailwind lg-Breakpoint (1024px)', () => {
    expect(LG_MEDIA_QUERY).toBe('(min-width: 1024px)');
  });

  it('ist eine gültige Media-Query und matchMedia akzeptiert sie ohne Fehler', () => {
    expect(() => window.matchMedia(LG_MEDIA_QUERY)).not.toThrow();
    const mq = window.matchMedia(LG_MEDIA_QUERY);
    expect(mq).toHaveProperty('matches');
    expect(typeof mq.matches).toBe('boolean');
  });
});
