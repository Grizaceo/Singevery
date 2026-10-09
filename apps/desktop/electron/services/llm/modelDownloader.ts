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

/**
 * Descarga el modelo desde `url` a `filePath`, reanudando desde el .part si
 * existe. Devuelve el resultado; si se aborta, el .part queda para reanudar.
 */
export async function downloadModel(
  url: string,
  filePath: string,
  onProgress?: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<DownloadResult> {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });

  const partPath = partFileName(filePath);
  let resumedFrom = 0;
  try {
    const st = await fs.promises.stat(partPath);
    resumedFrom = st.size;
  } catch {
    /* no hay .part: empieza de cero */
  }

  const headers: Record<string, string> = {};
  if (resumedFrom > 0) headers.Range = `bytes=${resumedFrom}-`;

  const res = await fetch(url, { headers, signal });
  if (!res.ok && res.status !== 206) {
    return { ok: false, filePath, totalBytes: resumedFrom, error: `HTTP ${res.status} al descargar el modelo` };
  }

  const total = resumedFrom + Number(res.headers.get('content-length') ?? 0);
  if (!res.body) {
    return { ok: false, filePath, totalBytes: resumedFrom, error: 'El servidor no envió cuerpo' };
  }

  const handle = await fs.promises.open(partPath, resumedFrom > 0 ? 'a' : 'w');
  let received = 0;
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await handle.write(value);
      received += value.length;
      onProgress?.({ received, total, resumedFrom });
    }
  } finally {
    await handle.close();
  }

  // Descarga completa: el .part pasa a ser el modelo final.
  await fs.promises.rename(partPath, filePath);
  return { ok: true, filePath, totalBytes: resumedFrom + received };
}

/** URL por defecto del modelo (exportada para la UI). */
export { DEFAULT_MODEL_URL };
