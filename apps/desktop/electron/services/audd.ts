import type { TrackMatch } from '../../src/types';
import { getAuddToken } from './env';

const AUDD_URL = 'https://api.audd.io/';

interface AuddResult {
  artist?: string;
  title?: string;
  album?: string;
  timecode?: string | number | null;
  song_link?: string;
}

interface AuddResponse {
  status: 'success' | 'error';
  result?: AuddResult | null;
  error?: { error_code: number; error_message: string };
}

/** Convierte timecode de AudD (segundos o "m:ss") a milisegundos. */
export function parseAuddTimecode(timecode: string | number | null | undefined): number {
  if (timecode == null) return 0;
  if (typeof timecode === 'number') return Math.max(0, Math.round(timecode * 1000));

  const trimmed = String(timecode).trim();
  if (!trimmed) return 0;

  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map(Number);
    if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
    if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  }

  const seconds = parseFloat(trimmed);
  return Number.isFinite(seconds) ? Math.max(0, Math.round(seconds * 1000)) : 0;
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes('webm')) return 'sample.webm';
  if (mimeType.includes('ogg')) return 'sample.ogg';
  if (mimeType.includes('wav')) return 'sample.wav';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'sample.m4a';
  return 'sample.bin';
}

export async function identifyFromAudio(
  audio: Buffer | Uint8Array,
  mimeType = 'audio/webm',
): Promise<TrackMatch | null> {
  const form = new FormData();
  const token = getAuddToken();
  if (token) form.append('api_token', token);

  const bytes = audio instanceof Buffer ? new Uint8Array(audio) : audio;
  const blob = new Blob([bytes], { type: mimeType });
  console.log('[AudD DEBUG] Sending to AudD:', { mimeType, blobSize: blob.size, blobType: blob.type, hasToken: !!token });
  form.append('file', blob, extensionForMime(mimeType));
  form.append('return', 'apple_music,spotify');

  const response = await fetch(AUDD_URL, { method: 'POST', body: form });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`AudD HTTP ${response.status}: ${raw.slice(0, 120)}`);
  }

  let data: AuddResponse;
  try {
    data = JSON.parse(raw) as AuddResponse;
  } catch {
    throw new Error(`AudD respondió con un formato inválido: ${raw.slice(0, 120)}`);
  }
  if (data.status === 'error') {
    console.error('[AudD ERROR] Full response:', raw);
    const code = data.error?.error_code;
    const msg = data.error?.error_message ?? 'Error de AudD';
    throw new Error(code ? `AudD #${code}: ${msg}` : msg);
  }

  const result = data.result;
  if (!result?.title || !result?.artist) return null;

  const matchedAt = Date.now();
  return {
    track: {
      provider: 'audd',
      provider_track_id: result.song_link ?? `${result.artist}::${result.title}`,
      title: result.title,
      artist: result.artist,
      album: result.album ?? null,
    },
    confidence: 1.0,
    position_ms: parseAuddTimecode(result.timecode),
    matched_at: matchedAt,
  };
}
