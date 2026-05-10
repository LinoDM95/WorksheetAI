import { describe, expect, it } from 'vitest';

import { getWorksheetStatusInfo } from './worksheetStatus';

describe('getWorksheetStatusInfo', () => {
  it('maps published and ready to success with check', () => {
    expect(getWorksheetStatusInfo('published')).toEqual({
      tone: 'success',
      label: 'Geprüft',
      hasCheck: true,
    });
    expect(getWorksheetStatusInfo('ready')).toEqual({
      tone: 'success',
      label: 'Druckbereit',
      hasCheck: true,
    });
  });

  it('maps draft to neutral without check', () => {
    expect(getWorksheetStatusInfo('draft')).toMatchObject({
      tone: 'neutral',
      label: 'Entwurf',
      hasCheck: false,
    });
  });

  it('falls back to raw label for unknown status', () => {
    expect(getWorksheetStatusInfo('custom')).toEqual({
      tone: 'neutral',
      label: 'custom',
      hasCheck: false,
    });
  });

  it('uses Entwurf when status empty', () => {
    expect(getWorksheetStatusInfo(undefined)).toMatchObject({
      label: 'Entwurf',
      hasCheck: false,
    });
  });

  it('mappt shared auf primary ohne Check', () => {
    expect(getWorksheetStatusInfo('shared')).toEqual({
      tone: 'primary',
      label: 'Geteilt',
      hasCheck: false,
    });
  });

  it('verwendet Entwurf bei leerem String', () => {
    expect(getWorksheetStatusInfo('')).toEqual({
      tone: 'neutral',
      label: 'Entwurf',
      hasCheck: false,
    });
  });
});
