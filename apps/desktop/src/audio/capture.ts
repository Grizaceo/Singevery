import type { AudioSource } from '../types';
import { readMicrophonePrefs, writeMicrophonePrefs } from './micPrefs';

const RECORD_MS = 6000;
const PAUSE_MS = 2000;
/** Pausa entre ciclos de corrección de deriva una vez identificada la canción. */
const RESYNC_PAUSE_MS = 12000;
/**
 * Pausa cuando hay un cambio de canción EN CURSO de confirmarse: el main vio
 * otra pista pero la histéresis todavía no la dio por buena, o el monitor
 * detectó un corte de audio. Esperar los 12s normales significaba cerrar la
 * confirmación ~20s más tarde y dejar la letra vieja en pantalla todo ese rato.
 * Casi cero: el ciclo siguiente ya cuesta 6s de grabación + red.
 */
const FAST_PAUSE_MS = 300;

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

type LevelMeter = {
  sample: () => void;
  /** Pico acumulado durante toda la grabación (0..1). */
  peak: () => number;
  /** Pico del último frame muestreado (0..1) — sirve para detectar silencio en vivo. */
  instant: () => number;
  close: () => void;
};

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
    let frame = 0;
    return {
      sample: () => {
        analyser.getFloatTimeDomainData(buf);
        let f = 0;
        for (let i = 0; i < buf.length; i++) {
          const a = Math.abs(buf[i]);
          if (a > f) f = a;
        }
        frame = f;
        if (f > peak) peak = f;
      },
      peak: () => peak,
      instant: () => frame,
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
 * Fuente de audio persistente para una sesión de reconocimiento.
 *
 * Existe para que el stream se abra UNA vez y siga vivo entre ciclos: sobre él
 * cuelgan a la vez el MediaRecorder (grabación de cada chunk) y el monitor
 * continuo (audio/monitor.ts), que necesita oír también durante las pausas.
 */
export interface AudioCaptureSession {
  acquire(): Promise<MediaStream>;
  /** Stream ya abierto, o null si todavía no se adquirió. */
  current(): MediaStream | null;
  release(): void;
}

/**
 * Mantiene vivo el stream de captura mientras se usa solo su audio.
 * El handler en main.ts entrega video = frame propio del widget + loopback;
 * este objeto conserva el stream para no re-adquirir en cada ciclo (re-adquirir
 * getDisplayMedia dispararía el selector de captura de Windows cada vez).
 */
export class SystemAudioSession implements AudioCaptureSession {
  private displayStream: MediaStream | null = null;

  current(): MediaStream | null {
    if (!this.displayStream?.active) return null;
    return new MediaStream(this.displayStream.getAudioTracks());
  }

  async acquire(): Promise<MediaStream> {
    if (this.displayStream?.active) {
      return new MediaStream(this.displayStream.getAudioTracks());
    }

    // Video MÍNIMO (4×4 @ 1fps), no video:false ni video:true.
    //   - video:true  → captura la pantalla completa: Windows notifica la
    //     captura y Spotify (contenido protegido) PAUSA la reproducción.
    //   - video:false → en algunas versiones de Electron el loopback deja de
    //     llegar (issue #49607: sin track de video, el audio llega en silencio).
    //   4×4 @ 1fps es el workaround documentado: mantiene el loopback vivo sin
    //   capturar contenido visible que dispare la protección de Spotify.
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: { width: 4, height: 4, frameRate: 1 },
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

export async function openMicrophoneStream(): Promise<MediaStream> {
  const prefs = readMicrophonePrefs();

  const request = async (withDevice: boolean): Promise<MediaStream> => {
    const audio: MediaTrackConstraints = {
      echoCancellation: prefs.echoCancellation,
      noiseSuppression: prefs.noiseSuppression,
      autoGainControl: prefs.autoGainControl,
      ...(withDevice && prefs.deviceId ? { deviceId: prefs.deviceId } : {}),
    };
    try {
      return await navigator.mediaDevices.getUserMedia({ audio });
    } catch (err) {
      // Mensajes accionables según el motivo (permiso vs ausencia de micrófono).
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        throw new Error('Permiso de micrófono denegado — habilítalo para el widget.');
      }
      if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        if (withDevice) {
          // El deviceId guardado en preferencias quedó huérfano (el micrófono
          // se desenchufó o cambió): olvidarlo y reintentar con el por defecto.
          // Sin esto, el ♪ (práctica vocal) fallaba en silencio para siempre.
          writeMicrophonePrefs({ ...prefs, deviceId: undefined });
          return request(false);
        }
        throw new Error('No se encontró un micrófono disponible.');
      }
      throw err instanceof Error ? err : new Error('No se pudo abrir el micrófono.');
    }
  };

  return request(true);
}

/**
 * Micrófono persistente. Antes se abría y cerraba un stream por chunk: además
 * del coste de re-adquirir (y del parpadeo del indicador de micrófono del SO),
 * dejaba a la app SORDA entre ciclos, que es justo cuando hay que notar el
 * cambio de canción. Con la sesión abierta, el monitor continuo oye siempre.
 */
export class MicrophoneSession implements AudioCaptureSession {
  private stream: MediaStream | null = null;

  current(): MediaStream | null {
    return this.stream?.active ? this.stream : null;
  }

  async acquire(): Promise<MediaStream> {
    if (this.stream?.active) return this.stream;
    this.stream = await openMicrophoneStream();
    return this.stream;
  }

  release(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}

/** Sesión de captura para la fuente indicada (aún sin adquirir el stream). */
export function createCaptureSession(source: AudioSource): AudioCaptureSession {
  return source === 'system' ? new SystemAudioSession() : new MicrophoneSession();
}

async function recordWithMediaRecorder(
  stream: MediaStream,
  durationMs: number,
  signal?: AbortSignal,
  ownsStream = true,
  onLevel?: (level: number) => void,
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
    const meterTimer = meter
      ? window.setInterval(() => {
          meter.sample();
          onLevel?.(meter.instant());
        }, 100)
      : null;

    // Solo detenemos los tracks si este stream nos pertenece. El stream lo
    // gestiona la AudioCaptureSession (debe seguir vivo entre ciclos: el
    // loopback no se re-adquiere sin volver a pedir permiso, y el monitor
    // continuo escucha por él durante las pausas).
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
  captureSession?: AudioCaptureSession,
  onLevel?: (level: number) => void,
): Promise<RecordedChunk> {
  const session = captureSession ?? createCaptureSession(source);
  const ownsSession = !captureSession;

  try {
    const stream = await session.acquire();
    // El stream lo gestiona la sesión (sigue vivo entre ciclos para el monitor
    // continuo), así que el grabador nunca detiene sus tracks.
    return await recordWithMediaRecorder(stream, durationMs, signal, false, onLevel);
  } finally {
    if (ownsSession) session.release();
  }
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
export const CAPTURE_FAST_PAUSE_MS = FAST_PAUSE_MS;

export { blobToWav16kMono } from './wav';
