// ============================================================================
// ModelDownloader — descarga del modelo GGUF bajo demanda.
//
// El modelo Hy-MT2 (~1,13 GB) NO viaja en el instalador: se descarga la primera vez
// que el usuario activa la traducción IA local. La descarga:
//   - es reanudable (HTTP Range: si se corta, continúa desde donde iba);
//   - escribe a un archivo temporal (.part) y lo renombra al terminar, así un
//     archivo a medio bajar nunca se confunde con un modelo válido;
//   - reporta progreso (bytes y porcentaje) para la barra de la UI;
//   - se puede abortar (AbortSignal) y el .part queda para reanudar después.
//
// El tamaño esperado se lee del header Content-Length de la primera petición.
// Si el servidor no lo manda (chunked), el progreso se reporta solo en bytes.
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_MODEL_URL } from './llmPath';

export interface DownloadProgress {
  /** Bytes descargados en esta sesión (no incluye lo reanudado). */
  received: number;
  /** Bytes totales (0 si el servidor no manda Content-Length). */
  total: number;
  /** Bytes ya en disco antes de esta sesión (reanudación). */
  resumedFrom: number;
}

export interface DownloadResult {
  ok: boolean;
  /** Ruta final del modelo (válida solo si ok). */
  filePath: string;
  /** Bytes totales descargados (incluyendo lo reanudado). */
  totalBytes: number;
  error?: string;
}

/** Nombre del archivo temporal mientras se descarga. */
export function partFileName(finalPath: string): string {
  return `${finalPath}.part`;
}

const activeDownloads = new Set<string>();
const IDLE_TIMEOUT_MS = 30_000;

interface ResumeIdentity { url: string; etag: string; }

/** A partial file is reusable only with a strong validator for this URL. */
function readIdentity(file: string, url: string): ResumeIdentity | null {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as ResumeIdentity;
    return value.url === url && /^"[^"\r\n]+"$/.test(value.etag) ? value : null;
  } catch { return null; }
}

export async function downloadModel(
  url: string,
  filePath: string,
  onProgress?: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<DownloadResult> {
  const key = path.resolve(filePath);
  if (activeDownloads.has(key)) return { ok: false, filePath, totalBytes: 0, error: 'Ya hay una descarga en curso' };
  activeDownloads.add(key);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  let timer: ReturnType<typeof setTimeout>;
  const touch = () => { clearTimeout(timer); timer = setTimeout(abort, IDLE_TIMEOUT_MS); };
  touch();
  const partPath = partFileName(filePath);
  const identityPath = `${partPath}.json`;
  let res: Response | undefined;
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    const identity = readIdentity(identityPath, url);
    let resumedFrom = identity ? await fs.promises.stat(partPath).then(s => s.size).catch(() => 0) : 0;
    const headers: Record<string, string> = { 'Accept-Encoding': 'identity' };
    if (resumedFrom > 0 && identity) {
      headers.Range = `bytes=${resumedFrom}-`;
      headers['If-Range'] = identity.etag;
    }
    res = await fetch(url, { headers, signal: controller.signal });
    if (res.status !== 200 && res.status !== 206) {
      // An obsolete/full partial can be restarted on the next attempt.
      if (res.status === 416) await fs.promises.rm(identityPath, { force: true });
      return { ok: false, filePath, totalBytes: resumedFrom, error: `HTTP ${res.status} al descargar el modelo` };
    }
    if (!res.body) throw new Error('El servidor no envió cuerpo');
    const encoding = res.headers.get('content-encoding');
    if (encoding && encoding !== 'identity') throw new Error('Codificación no válida para descargar el modelo');
    const rawLength = res.headers.get('content-length');
    const length = rawLength === null ? null : Number(rawLength);
    if (length !== null && (!Number.isSafeInteger(length) || length <= 0)) throw new Error('Content-Length inválido');
    let total = length ?? 0;
    if (res.status === 206) {
      const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(res.headers.get('content-range') ?? '');
      if (!range || resumedFrom <= 0 || !identity || res.headers.get('etag') !== identity.etag) {
        throw new Error('El servidor no confirmó la identidad/rango del modelo parcial');
      }
      const [begin, end, size] = range.slice(1).map(Number);
      if (![begin, end, size].every(Number.isSafeInteger) || begin !== resumedFrom || end !== size - 1 || end < begin ||
          (length !== null && length !== end - begin + 1)) throw new Error('Content-Range no coincide con el modelo parcial');
      total = size;
    } else {
      // A server may ignore Range, or If-Range may detect a new model. Replace.
      resumedFrom = 0;
    }
    const etag = res.headers.get('etag');
    await fs.promises.rm(identityPath, { force: true });
    const handle = await fs.promises.open(partPath, resumedFrom > 0 ? 'a' : 'w');
    let received = 0;
    try {
      // Truncate/open before publishing a new identity: a crash must not pair
      // an old prefix with the validator of a newly served model.
      if (etag && /^"[^"\r\n]+"$/.test(etag)) {
        await fs.promises.writeFile(identityPath, JSON.stringify({ url, etag }), { mode: 0o600 });
      }
      const reader = res.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.signal.throwIfAborted();
          touch();
          await handle.writeFile(value);
          received += value.length;
          if (total > 0 && resumedFrom + received > total) throw new Error('El modelo excede el tamaño anunciado');
          onProgress?.({ received, total, resumedFrom });
        }
      } finally { reader.releaseLock(); }
    } finally { await handle.close(); }
    controller.signal.throwIfAborted();
    const totalBytes = resumedFrom + received;
    if (totalBytes < 8 || (total > 0 && totalBytes !== total)) throw new Error('Descarga incompleta del modelo');
    const check = await fs.promises.open(partPath, 'r');
    try {
      const magic = Buffer.alloc(4);
      await check.read(magic, 0, 4, 0);
      if (magic.toString('ascii') !== 'GGUF') {
        await fs.promises.rm(identityPath, { force: true });
        throw new Error('El archivo descargado no es un modelo GGUF');
      }
    } finally { await check.close(); }
    await fs.promises.rename(partPath, filePath);
    await fs.promises.rm(identityPath, { force: true });
    return { ok: true, filePath, totalBytes };
  } finally {
    clearTimeout(timer!);
    signal?.removeEventListener('abort', abort);
    if (res?.body && !res.body.locked) await res.body.cancel().catch(() => {});
    activeDownloads.delete(key);
  }
}

/** URL por defecto del modelo (exportada para la UI). */
export { DEFAULT_MODEL_URL };
