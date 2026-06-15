import type { AudioSource } from '../types';

const RECORD_MS = 6000;
const PAUSE_MS = 2000;

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

async function openStream(source: AudioSource): Promise<MediaStream> {
  if (source === 'microphone') {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    audio: true,
    video: true,
  });

  // En Windows loopback el audio suele depender del track de vídeo: no detenerlo.
  for (const track of stream.getVideoTracks()) {
    track.enabled = false;
  }

  if (stream.getAudioTracks().length === 0) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error('No se pudo capturar audio del sistema');
  }

  return stream;
}

export async function recordChunk(
  source: AudioSource,
  durationMs = RECORD_MS,
  signal?: AbortSignal,
): Promise<Blob> {
  const stream = await openStream(source);
  const mimeType = pickMimeType();

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      stream.getTracks().forEach((track) => track.stop());
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];

    const cleanup = (): void => {
      stream.getTracks().forEach((track) => track.stop());
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

    recorder.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      cleanup();
      reject(recorder.error ?? new Error('Error al grabar audio'));
    };

    recorder.onstop = () => {
      signal?.removeEventListener('abort', onAbort);
      cleanup();
      resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }));
    };

    recorder.start(500);
    window.setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    }, durationMs);
  });
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
