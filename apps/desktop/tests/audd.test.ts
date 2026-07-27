import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseAuddTimecode,
  identifyFromAudd,
  AUDD_TIMEOUT_MS,
} from '../electron/services/recognition/auddProvider';

describe('parseAuddTimecode', () => {
  it('parsea segundos numéricos', () => {
    expect(parseAuddTimecode(12)).toBe(12000);
  });

  it('parsea formato m:ss', () => {
    expect(parseAuddTimecode('1:30')).toBe(90000);
  });

  it('parsea formato mm:ss', () => {
    expect(parseAuddTimecode('00:12')).toBe(12000);
  });

  it('devuelve 0 para valores vacíos', () => {
    expect(parseAuddTimecode(null)).toBe(0);
    expect(parseAuddTimecode('')).toBe(0);
  });
});

// ============================================================================
// Plazo. Sin él, una red caída deja el IPC `recognition:identify` sin resolver
// y la app clavada en "Identificando..." sin forma de salir.
// ============================================================================

describe('plazo de AudD', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('se rinde con un mensaje legible si AudD no responde', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
            });
          }),
      ),
    );

    const promesa = identifyFromAudd(Buffer.from([1, 2, 3]), 'audio/wav');
    const esperado = expect(promesa).rejects.toThrow(/AudD no respondió en \d+ s/);
    await vi.advanceTimersByTimeAsync(AUDD_TIMEOUT_MS + 1000);
    await esperado;
  });
});
