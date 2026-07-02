import type { TrackMatch } from '../../../src/types';
import type { ShazamApiResponse } from './shazamApi';
import type { RecognitionProvider } from './provider';

/** Extrae posición estimada en la pista (ms) desde la respuesta de Shazam. */
export function parseShazamPositionMs(response: ShazamApiResponse): number {
  const offsetSec = response.matches?.[0]?.offset;
  if (typeof offsetSec === 'number' && Number.isFinite(offsetSec)) {
    return Math.max(0, Math.round(offsetSec * 1000));
  }
  return 0;
}

function albumFromResponse(response: ShazamApiResponse): string | null {
  const songSection = response.track?.sections?.find((s) => s.type === 'SONG');
  const album = songSection?.metadata?.find((m) => m.title === 'Album')?.text;
  return album ?? null;
}

/** Mapea la respuesta de Shazam al contrato interno TrackMatch. */
export function mapShazamResponse(response: ShazamApiResponse): TrackMatch | null {
  const title = response.track?.title;
  const artist = response.track?.subtitle;
  if (!title || !artist) return null;

  const trackKey = response.track?.key ?? `${artist}::${title}`;
  const matchedAt = Date.now();

  return {
    track: {
      provider: 'shazam',
      provider_track_id: trackKey,
      title,
      artist,
      album: albumFromResponse(response),
    },
    confidence: 1.0,
    position_ms: parseShazamPositionMs(response),
    matched_at: matchedAt,
  };
}

/** Identifica audio WAV/compatible usando shazamio-core + API de Shazam. */
export async function identifyFromShazam(
  audio: Buffer | Uint8Array,
  _mimeType = 'audio/wav',
): Promise<TrackMatch | null> {
  const { recognizeBytes } = await import('shazamio-core');
  const bytes = audio instanceof Buffer ? new Uint8Array(audio) : audio;

  let signatures: Array<{ uri: string; samplems: number; free: () => void }>;
  try {
    signatures = recognizeBytes(bytes, 0, Number.MAX_SAFE_INTEGER) as Array<{
      uri: string;
      samplems: number;
      free: () => void;
    }>;
  } catch (err) {
    throw new Error(
      `Shazam: no se pudo generar huella (${err instanceof Error ? err.message : 'error desconocido'})`,
    );
  }

  try {
    const { sendShazamRecognizeRequest } = await import('./shazamApi');
    const startIdx = Math.floor(signatures.length / 2);

    for (let i = startIdx; i < signatures.length; i += 4) {
      const sig = signatures[i];
      const response = await sendShazamRecognizeRequest({
        uri: sig.uri,
        samplems: sig.samplems,
      });
      if (response) {
        return mapShazamResponse(response);
      }
    }
    return null;
  } finally {
    for (const sig of signatures) {
      try {
        sig.free();
      } catch {
        /* noop */
      }
    }
  }
}

export const shazamProvider: RecognitionProvider = {
  id: 'shazam',
  identify: identifyFromShazam,
};
