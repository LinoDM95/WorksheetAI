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

  it('akzeptiert Conditionals als Objekt', () => {
    expect(cn('a', { b: true, c: false }, 'd')).toBe('a b d');
  });

  it('filtert falsy Werte', () => {
    expect(cn('a', false && 'b', null, undefined, '', 'c')).toBe('a c');
  });

  it('flatted Arrays', () => {
    expect(cn(['a', ['b', { c: true }]])).toMatch(/a/);
    expect(cn(['a', ['b', { c: true }]])).toMatch(/b/);
    expect(cn(['a', ['b', { c: true }]])).toMatch(/c/);
  });

  it('mergt konfliktäre Tailwind-Modifier (text-sm vs text-lg)', () => {
    expect(cn('text-sm text-lg')).toBe('text-lg');
  });

  it('mergt margin-Konflikte', () => {
    expect(cn('mt-2 mt-4')).toBe('mt-4');
  });

  it('liefert leeren String ohne Args', () => {
    expect(cn()).toBe('');
  });
});
