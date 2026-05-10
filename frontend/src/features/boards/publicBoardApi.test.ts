/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { axiosGetMock } = vi.hoisted(() => ({ axiosGetMock: vi.fn() }));

vi.mock('axios', () => ({
  default: {
    get: axiosGetMock,
  },
}));

vi.mock('../../lib/apiBaseUrl', () => ({
  getApiBaseUrl: () => 'http://localhost:8000/api',
}));

import { buildStudentBoardUrl, fetchPublicBoardByToken } from './publicBoardApi';

beforeEach(() => {
  axiosGetMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('fetchPublicBoardByToken', () => {
  it('GET /boards/public-play/:token/ mit URL-Encoding', async () => {
    axiosGetMock.mockResolvedValue({ data: { title: 'X' } });
    const data = await fetchPublicBoardByToken('hello world');
    expect(data).toEqual({ title: 'X' });
    const calledUrl = axiosGetMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('hello%20world');
    expect(calledUrl).toContain('/boards/public-play/');
    const cfg = axiosGetMock.mock.calls[0][1] as { timeout?: number } | undefined;
    expect(cfg?.timeout).toBe(60000);
  });

  it('propagiert Errors', async () => {
    axiosGetMock.mockRejectedValue(new Error('boom'));
    await expect(fetchPublicBoardByToken('t')).rejects.toThrow('boom');
  });
});

describe('buildStudentBoardUrl', () => {
  it('verwendet window.location.origin als Default', () => {
    const url = buildStudentBoardUrl('abc');
    expect(url).toContain('/s/abc');
  });

  it('encoded den Token', () => {
    const url = buildStudentBoardUrl('a/b c');
    expect(url).toContain('/s/a%2Fb%20c');
  });

  it('respektiert VITE_PUBLIC_APP_URL wenn gesetzt', () => {
    vi.stubEnv('VITE_PUBLIC_APP_URL', 'https://schule.de/');
    const url = buildStudentBoardUrl('abc');
    expect(url.startsWith('https://schule.de/s/abc') || url === 'https://schule.de/s/abc').toBe(
      true,
    );
  });
});
