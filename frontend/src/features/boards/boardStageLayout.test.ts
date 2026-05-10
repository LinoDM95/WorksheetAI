/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import {
  STAGE_BASE_H,
  STAGE_BASE_W,
  boardStageClipBoxStyle,
  boardStageScaledInnerStyle,
} from './boardStageLayout';

describe('boardStageLayout — Konstanten', () => {
  it('hat 1280×720 Bühne', () => {
    expect(STAGE_BASE_W).toBe(1280);
    expect(STAGE_BASE_H).toBe(720);
  });
});

describe('boardStageClipBoxStyle', () => {
  it('multipliziert Base mit Scale', () => {
    const s = boardStageClipBoxStyle(0.5);
    expect(s.width).toBe(STAGE_BASE_W * 0.5);
    expect(s.height).toBe(STAGE_BASE_H * 0.5);
    expect(s.overflow).toBe('hidden');
  });

  it('akzeptiert custom base dimensions', () => {
    const s = boardStageClipBoxStyle(2, 100, 50);
    expect(s.width).toBe(200);
    expect(s.height).toBe(100);
  });

  it('mit scale=1 entspricht Basisgröße', () => {
    const s = boardStageClipBoxStyle(1);
    expect(s.width).toBe(STAGE_BASE_W);
    expect(s.height).toBe(STAGE_BASE_H);
  });
});

describe('boardStageScaledInnerStyle', () => {
  it('hält Layout-Box auf Base und skaliert per transform', () => {
    const s = boardStageScaledInnerStyle(0.5);
    expect(s.width).toBe(STAGE_BASE_W);
    expect(s.height).toBe(STAGE_BASE_H);
    expect(s.transform).toBe('scale(0.5)');
    expect(s.transformOrigin).toBe('top left');
  });

  it('berechnet negative Margins korrekt', () => {
    const s = boardStageScaledInnerStyle(0.5);
    expect(s.marginRight).toBe(-STAGE_BASE_W * 0.5);
    expect(s.marginBottom).toBe(-STAGE_BASE_H * 0.5);
  });

  it('mit scale=1 sind die Margins 0', () => {
    const s = boardStageScaledInnerStyle(1);
    expect(Math.abs(Number(s.marginRight))).toBe(0);
    expect(Math.abs(Number(s.marginBottom))).toBe(0);
  });
});
