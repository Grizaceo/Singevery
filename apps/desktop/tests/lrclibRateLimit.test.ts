import { afterEach, describe, expect, it, vi } from 'vitest';
import { retryAfterTime } from '../electron/services/lyrics/rateLimit';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('LRCLIB Retry-After', () => {
  it('accepts seconds and HTTP dates, with a safe default for missing/invalid headers', () => {
    const now = Date.parse('2026-10-21T00:00:00Z');
    expect(retryAfterTime('120', now)).toBe(now + 120_000);
    expect(retryAfterTime('Wed, 21 Oct 2026 00:02:00 GMT', now)).toBe(now + 120_000);
    expect(retryAfterTime(null, now)).toBe(now + 60_000);
    expect(retryAfterTime('bad', now)).toBe(now + 60_000);
  });
  it('shares cooldown across query variants and later calls, then recovers', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-21T00:00:00Z'));
    const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '120' } }))
      .mockImplementation(async () => new Response('[]', { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    const { lrclibProvider } = await import('../electron/services/lyrics/providers/lrclib');
    await expect(lrclibProvider.lookup({ title: 'First', artist: 'Artist' })).rejects.toThrow('limitado');
    await expect(lrclibProvider.lookup({ title: 'Different', artist: 'Artist', durationMs: 120000 })).rejects.toThrow('limitado');
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(120_000);
    expect(await lrclibProvider.lookup({ title: 'Different', artist: 'Artist' })).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
