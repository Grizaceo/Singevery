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

function durationFromResponse(response: ShazamApiResponse): number | null {
  const songSection = response.track?.sections?.find((s) => s.type === 'SONG');
  const length = songSection?.metadata?.find((m) => m.title === 'Length')?.text;
  if (!length) return null;
  const parts = length.split(':').map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  return null;
}

/**
 * Mapea la respuesta de Shazam al contrato interno TrackMatch.
 *
 * `sampleMs` es el `samplems` de la huella que produjo el match: la ventana de
 * audio (desde el inicio de la grabación) que cubre esa huella. El `offset` de
 * Shazam está referido al FINAL de esa ventana, así que se propaga como
 * `sample_offset_ms` para que adjustMatchPosition pueda anclar bien el reloj.
 * Sin este dato se asumía el inicio de la grabación y la letra se adelantaba
 * varios segundos de forma sistemática.
 */
export function mapShazamResponse(
  response: ShazamApiResponse,
  sampleMs = 0,
): TrackMatch | null {
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
      duration_ms: durationFromResponse(response),
    },
    confidence: 1.0,
    position_ms: parseShazamPositionMs(response),
    matched_at: matchedAt,
    sample_offset_ms: Number.isFinite(sampleMs) ? Math.max(0, sampleMs) : 0,
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
        // `sig.samplems` viaja con el match: es el punto de la grabación al que
        // se refiere el offset devuelto (ver mapShazamResponse).
        return mapShazamResponse(response, sig.samplems);
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
