import { describe, it, expect, vi, afterEach } from 'vitest';
import { mapShazamResponse, parseShazamPositionMs } from '../electron/services/recognition/shazamProvider';
import {
  sendShazamRecognizeRequest,
  SHAZAM_TIMEOUT_MS,
  type ShazamApiResponse,
} from '../electron/services/recognition/shazamApi';

describe('parseShazamPositionMs', () => {
  it('convierte offset en segundos a ms', () => {
    const response: ShazamApiResponse = { matches: [{ offset: 42.5 }] };
    expect(parseShazamPositionMs(response)).toBe(42500);
  });

  it('devuelve 0 sin matches', () => {
    expect(parseShazamPositionMs({})).toBe(0);
  });
});

describe('mapShazamResponse', () => {
  it('mapea título, artista, álbum y provider', () => {
    const response: ShazamApiResponse = {
      matches: [{ offset: 12 }],
      track: {
        title: 'Test Song',
        subtitle: 'Test Artist',
        key: 'shz-123',
        sections: [
          {
            type: 'SONG',
            metadata: [{ title: 'Album', text: 'Test Album' }],
          },
        ],
      },
    };

    const match = mapShazamResponse(response);
    expect(match).not.toBeNull();
    expect(match!.track.provider).toBe('shazam');
    expect(match!.track.title).toBe('Test Song');
    expect(match!.track.artist).toBe('Test Artist');
    expect(match!.track.album).toBe('Test Album');
    expect(match!.position_ms).toBe(12000);
  });

  it('devuelve null si faltan campos obligatorios', () => {
    expect(mapShazamResponse({ track: { title: 'Only Title' } })).toBeNull();
  });
});

// ============================================================================
// Plazo. Igual que AudD: sin tope, el reconocimiento se cuelga sin salida.
// ============================================================================

describe('plazo de Shazam', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('se rinde con un mensaje legible si Shazam no responde', async () => {
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

    const promesa = sendShazamRecognizeRequest({ uri: 'data:audio/vnd.shazam.sig;base64,AA', samplems: 3000 });
    const esperado = expect(promesa).rejects.toThrow(/Shazam no respondió en \d+ s/);
    await vi.advanceTimersByTimeAsync(SHAZAM_TIMEOUT_MS + 1000);
    await esperado;
  });
});
