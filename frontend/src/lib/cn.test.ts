import { describe, expect, it } from 'vitest';

import { cn } from './cn';

describe('cn', () => {
  it('merges conflicting tailwind paddings to the last utility', () => {
    expect(cn('px-2 px-4')).toBe('px-4');
  });

  it('concatenates independent utilities', () => {
    expect(cn('text-sm', 'font-bold')).toMatch(/text-sm/);
    expect(cn('text-sm', 'font-bold')).toMatch(/font-bold/);
  });
});
