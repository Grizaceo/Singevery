/** Retry-After is a host cooldown, not a reason to retry another query immediately. */
export class LyricsRateLimitError extends Error {
  constructor(readonly retryAt: number) {
    super(`Proveedor limitado hasta ${new Date(retryAt).toISOString()}`);
    this.name = 'LyricsRateLimitError';
  }
}

export function retryAfterTime(value: string | null, now = Date.now()): number {
  const text = value?.trim() ?? '';
  const milliseconds = /^\d+(?:\.\d+)?$/.test(text) ? Number(text) * 1000 : Date.parse(text) - now;
  return now + (Number.isFinite(milliseconds) ? Math.max(1000, milliseconds) : 60_000);
}
