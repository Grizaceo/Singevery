import type { AudioSource } from '../types';

const RECORD_MS = 6000;
const PAUSE_MS = 2000;
/** Pausa entre ciclos de corrección de deriva una vez identificada la canción. */
const RESYNC_PAUSE_MS = 12000;

/** Pico de amplitud (0..1) por debajo del cual consideramos que no llega señal. */
export const SILENCE_PEAK = 0.012;

/** Resultado de grabar un chunk: el audio + el pico de nivel medido (0..1). */
export interface RecordedChunk {
  blob: Blob;
  /** Pico de amplitud durante la grabación (0 = silencio, ~1 = saturado). */
  level: number;
}

function pickMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

type LevelMeter = { sample: () => void; peak: () => number; close: () => void };

/**
 * Mide el nivel de audio de un stream sin consumirlo (tap de solo lectura vía
 * Web Audio). Permite distinguir "no llega señal" (permiso/fuente) de
 * "capturando pero en silencio" (volumen del sistema bajo / nada sonando).
 */
function createLevelMeter(stream: MediaStream): LevelMeter | null {
  try {
    const Ctx: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let peak = 0;
    return {
      sample: () => {
        analyser.getFloatTimeDomainData(buf);
        for (let i = 0; i < buf.length; i++) {
          const a = Math.abs(buf[i]);
          if (a > peak) peak = a;
        }
      },
      peak: () => peak,
      close: () => {
        try {
          source.disconnect();
        } catch {
          /* noop */
        }
        ctx.close().catch(() => {});
      },
    };
  } catch {
    return null;
  }
}

/**
 * Mantiene vivo el stream de pantalla (con video) mientras se captura solo audio.
 * En Windows el loopback de Electron deja de enviar audio si se detienen los tracks de video.
 */
export class SystemAudioSession {
  private displayStream: MediaStream | null = null;

  async acquire(): Promise<MediaStream> {
    if (this.displayStream?.active) {
      return new MediaStream(this.displayStream.getAudioTracks());
    }

    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: true,
    });

    const audioTracks = displayStream.getAudioTracks();
    if (audioTracks.length === 0) {
      displayStream.getTracks().forEach((track) => track.stop());
      throw new Error('No se pudo capturar audio del sistema (sin tracks de audio)');
    }

    this.displayStream = displayStream;
    return new MediaStream(audioTracks);
  }

  release(): void {
    this.displayStream?.getTracks().forEach((track) => track.stop());
    this.displayStream = null;
  }
}

async function openMicrophoneStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  } catch (err) {
    // Mensajes accionables según el motivo (permiso vs ausencia de micrófono).
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new Error('Permiso de micrófono denegado — habilítalo para el widget.');
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new Error('No se encontró un micrófono disponible.');
    }
    throw err instanceof Error ? err : new Error('No se pudo abrir el micrófono.');
  }
}

async function recordWithMediaRecorder(
  stream: MediaStream,
  durationMs: number,
  signal?: AbortSignal,
  ownsStream = true,
): Promise<RecordedChunk> {
  const mimeType = pickMimeType();
  const meter = createLevelMeter(stream);

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      if (ownsStream) stream.getTracks().forEach((track) => track.stop());
      meter?.close();
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    const meterTimer = meter ? window.setInterval(() => meter.sample(), 100) : null;

    // Solo detenemos los tracks si este stream nos pertenece. El stream del
    // sistema lo gestiona SystemAudioSession (debe seguir vivo entre ciclos de
    // re-sync); detenerlo aquí cortaría el loopback en capturas posteriores.
    const cleanup = (): void => {
      if (meterTimer != null) window.clearInterval(meterTimer);
      meter?.close();
      if (ownsStream) stream.getTracks().forEach((track) => track.stop());
    };

    const onAbort = (): void => {
      if (recorder.state !== 'inactive') recorder.stop();
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    recorder.onerror = (event) => {
      signal?.removeEventListener('abort', onAbort);
      cleanup();
      const err = event instanceof ErrorEvent ? event.error : new Error('Error al grabar audio');
      reject(err);
    };

    recorder.onstop = () => {
      signal?.removeEventListener('abort', onAbort);
      const level = meter?.peak() ?? 0;
      cleanup();
      resolve({
        blob: new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }),
        level,
      });
    };

    recorder.start();
    meter?.sample();
    window.setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    }, durationMs);
  });
}

export async function recordChunk(
  source: AudioSource,
  durationMs = RECORD_MS,
  signal?: AbortSignal,
  systemSession?: SystemAudioSession,
): Promise<RecordedChunk> {
  if (source === 'system') {
    const session = systemSession ?? new SystemAudioSession();
    const ownsSession = !systemSession;

    try {
      const stream = await session.acquire();
      // El stream del sistema lo gestiona la sesión, no el grabador.
      return await recordWithMediaRecorder(stream, durationMs, signal, false);
    } finally {
      if (ownsSession) session.release();
    }
  }

  const stream = await openMicrophoneStream();
  return await recordWithMediaRecorder(stream, durationMs, signal, true);
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = (): void => {
      window.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export const CAPTURE_RECORD_MS = RECORD_MS;
export const CAPTURE_PAUSE_MS = PAUSE_MS;
export const CAPTURE_RESYNC_PAUSE_MS = RESYNC_PAUSE_MS;
