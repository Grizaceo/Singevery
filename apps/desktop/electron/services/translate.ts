// ============================================================================
// translate.ts — traducción de las líneas de una letra.
//
// Proveedores:
//   - mymemory (por defecto): SIN API key ni registro. Es lo que permite que la
//     traducción funcione recién instalada la app; DeepL/Google quedan como
//     mejora opcional para quien tenga credenciales.
//   - deepl / google: mejor calidad, requieren clave del usuario.
// ============================================================================

import { deadline, isAbortError, seconds } from './http';

export type TranslationProvider = 'mymemory' | 'local' | 'deepl' | 'google';

/**
 * Tope por PETICIÓN. El modelo local es el caso raro: una canción entera en una
 * sola generación por CPU puede tardar minutos legítimamente, así que su plazo
 * mide en minutos mientras los servicios web miden en decenas de segundos.
 */
const REQUEST_TIMEOUT_MS: Record<TranslationProvider, number> = {
  mymemory: 20_000,
  deepl: 30_000,
  google: 30_000,
  local: 180_000,
};

/**
 * Tope para TODA la traducción de una canción. MyMemory manda una petición por
 * línea, así que sin un presupuesto global el peor caso serían decenas de
 * timeouts encadenados: minutos de spinner antes de rendirse.
 */
const TOTAL_BUDGET_MS: Record<TranslationProvider, number> = {
  mymemory: 150_000,
  deepl: 60_000,
  google: 60_000,
  local: 300_000,
};

export interface TranslationConfig {
  provider: TranslationProvider;
  /** DeepL/Google: la clave. MyMemory: email opcional (sube la cuota diaria). */
  apiKey: string;
  targetLang: string;
  /** Proveedor 'local': URL del runtime con API compatible con OpenAI. */
  localEndpoint?: string;
  /** Proveedor 'local': modelo a usar (p. ej. translategemma:4b). */
  localModel?: string;
}

export interface TranslationResult {
  ok: boolean;
  translations?: string[];
  error?: string;
}

const DEEPL_FREE_URL = 'https://api-free.deepl.com/v2/translate';
const DEEPL_PRO_URL = 'https://api.deepl.com/v2/translate';
const GOOGLE_URL = 'https://translation.googleapis.com/language/translate/v2';
const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';

/** Ollama expone además de su API propia una compatible con OpenAI, igual que
 *  LM Studio, llama.cpp server o Jan: con una sola implementación sirven todos. */
export const DEFAULT_LOCAL_ENDPOINT = 'http://localhost:11434/v1/chat/completions';
/** Gemma 3 afinado para traducir, 55 idiomas. `ollama pull translategemma:4b`. */
export const DEFAULT_LOCAL_MODEL = 'translategemma:4b';

/** Tope duro del parámetro `q` de MyMemory. Por encima, la API rechaza. */
export const MYMEMORY_MAX_BYTES = 500;
/** Peticiones en paralelo. La cuota es por caracteres, no por peticiones, así
 *  que agrupar no ahorra nada: el paralelismo solo recorta la espera. Modesto
 *  para no castigar a un servicio gratuito. */
const MYMEMORY_CONCURRENCY = 4;

function normalizeTargetLang(lang: string): string {
  const trimmed = lang.trim().toUpperCase();
  return trimmed.length >= 2 ? trimmed.slice(0, 2) : 'ES';
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Parte un texto en trozos que quepan en el límite de MyMemory, cortando por
 * espacios para no romper palabras. Si una sola palabra ya excede el límite
 * (raro en una letra), se corta por caracteres para no perderla. Pura.
 */
export function splitForMyMemory(text: string, maxBytes = MYMEMORY_MAX_BYTES): string[] {
  if (byteLength(text) <= maxBytes) return [text];

  const chunks: string[] = [];
  let current = '';

  const flush = (): void => {
    if (current) chunks.push(current);
    current = '';
  };

  for (const word of text.split(' ')) {
    const candidate = current ? `${current} ${word}` : word;
    if (byteLength(candidate) <= maxBytes) {
      current = candidate;
      continue;
    }
    flush();
    if (byteLength(word) <= maxBytes) {
      current = word;
      continue;
    }
    // Palabra suelta más larga que el límite: partir por caracteres.
    let piece = '';
    for (const char of word) {
      if (byteLength(piece + char) > maxBytes) {
        chunks.push(piece);
        piece = '';
      }
      piece += char;
    }
    current = piece;
  }
  flush();

  return chunks.length > 0 ? chunks : [text];
}

interface MyMemoryResponse {
  responseData?: { translatedText?: string; detectedLanguage?: string };
  responseStatus?: number | string;
  responseDetails?: string;
  quotaFinished?: boolean;
}

/** Traduce que la respuesta de MyMemory sea utilizable, o explica por qué no. */
function readMyMemory(data: MyMemoryResponse): { text: string; detected?: string } {
  const status = Number(data.responseStatus);
  const detail = (data.responseDetails ?? '').trim();

  if (data.quotaFinished || /USED ALL AVAILABLE FREE TRANSLATIONS/i.test(detail)) {
    throw new Error(
      'MyMemory: se agotó la cuota gratuita de hoy. Añade tu email en Ajustes → ' +
        'Traducción para subirla, o usa DeepL/Google con tu propia clave.',
    );
  }
  if (Number.isFinite(status) && status !== 200) {
    throw new Error(`MyMemory ${status}${detail ? `: ${detail.slice(0, 120)}` : ''}`);
  }

  const text = data.responseData?.translatedText;
  if (typeof text !== 'string' || !text) {
    throw new Error('MyMemory devolvió una respuesta vacía');
  }
  return { text, detected: data.responseData?.detectedLanguage };
}

async function myMemoryRequest(
  text: string,
  sourceLang: string,
  targetLang: string,
  email: string,
  signal?: AbortSignal,
): Promise<{ text: string; detected?: string }> {
  const params = new URLSearchParams({
    q: text,
    langpair: `${sourceLang}|${targetLang}`,
  });
  // `de` (email válido) sube la cuota diaria de 5.000 a 50.000 caracteres.
  if (email) params.set('de', email);

  const dl = deadline(REQUEST_TIMEOUT_MS.mymemory, signal);
  let res: Response;
  let payload: MyMemoryResponse;
  try {
    res = await fetch(`${MYMEMORY_URL}?${params.toString()}`, { signal: dl.signal });
    if (!res.ok) {
      throw new Error(`MyMemory HTTP ${res.status}`);
    }
    payload = (await res.json()) as MyMemoryResponse;
  } catch (err) {
    if (dl.timedOut) {
      throw new Error(`MyMemory no respondió en ${seconds(REQUEST_TIMEOUT_MS.mymemory)} s`);
    }
    throw err;
  } finally {
    dl.dispose();
  }
  return readMyMemory(payload);
}

/** Traduce una línea completa (troceándola si excede el límite). */
async function translateLineWithMyMemory(
  line: string,
  sourceLang: string,
  targetLang: string,
  email: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!line.trim()) return line; // líneas vacías: no gastan cuota

  const parts = splitForMyMemory(line);
  const out: string[] = [];
  for (const part of parts) {
    const { text } = await myMemoryRequest(part, sourceLang, targetLang, email, signal);
    out.push(text);
  }
  return out.join(' ');
}

/** Ejecuta `task` sobre cada índice con un tope de tareas simultáneas. */
async function mapWithConcurrency<T>(
  count: number,
  limit: number,
  task: (index: number) => Promise<T>,
): Promise<T[]> {
  const results = new Array<T>(count);
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < count) {
      const index = next++;
      results[index] = await task(index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, count) }, () => worker()));
  return results;
}

/**
 * MyMemory exige idioma origen. Se detecta UNA vez sobre la línea más larga
 * (las líneas sueltas de una letra son demasiado cortas para detectar bien:
 * un "Ah" o un "Hey!" puede salir en cualquier idioma) y se reutiliza para
 * todas. Si la detección falla, se deja que la API autodetecte línea a línea.
 */
async function detectSourceLang(
  lines: string[],
  targetLang: string,
  email: string,
  signal?: AbortSignal,
): Promise<string> {
  const sample = lines
    .filter((line) => line.trim())
    .sort((a, b) => b.length - a.length)[0];
  if (!sample) return 'Autodetect';

  try {
    const { detected } = await myMemoryRequest(
      splitForMyMemory(sample)[0],
      'Autodetect',
      targetLang,
      email,
      signal,
    );
    return detected && detected.length >= 2 ? detected : 'Autodetect';
  } catch {
    return 'Autodetect';
  }
}

async function translateWithMyMemory(
  lines: string[],
  email: string,
  targetLang: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const target = normalizeTargetLang(targetLang).toLowerCase();
  const source = await detectSourceLang(lines, target, email, signal);

  return mapWithConcurrency(lines.length, MYMEMORY_CONCURRENCY, (i) =>
    translateLineWithMyMemory(lines[i], source, target, email, signal),
  );
}

// ============================================================================
// Proveedor local — un modelo corriendo en el equipo del usuario.
//
// Sin cuota, sin red y sin mandar las letras a un tercero. Se habla con él por
// la API compatible con OpenAI que exponen Ollama, LM Studio, llama.cpp server
// y Jan, así que una sola implementación cubre todos los runtimes.
// ============================================================================

/**
 * Extrae las traducciones de una respuesta numerada del modelo.
 *
 * Los modelos generativos añaden de todo: preámbulos ("Aquí tienes la
 * traducción:"), bloques de código, líneas en blanco. Parsear por número es
 * mucho más robusto que confiar en el orden de las líneas. Pura y testeable.
 *
 * Devuelve null si no se recuperan exactamente `expected` líneas: quien llama
 * decide el plan B en vez de mostrar una letra desalineada.
 */
export function parseNumberedTranslations(raw: string, expected: number): string[] | null {
  const found = new Map<number, string>();

  for (const line of raw.split('\n')) {
    const match = /^\s*(\d+)\s*[.)：:\-]\s*(.*)$/.exec(line);
    if (!match) continue;
    const index = Number(match[1]);
    if (!Number.isInteger(index) || index < 1 || index > expected) continue;
    // Solo la primera aparición: si el modelo repite, gana la original.
    if (!found.has(index)) found.set(index, match[2].trim());
  }

  if (found.size !== expected) return null;
  return Array.from({ length: expected }, (_, i) => found.get(i + 1) ?? '');
}

/** Construye el prompt de traducción por lote. Pura (facilita ajustarlo). */
export function buildLocalPrompt(lines: string[], targetLang: string): string {
  const numbered = lines.map((line, i) => `${i + 1}. ${line}`).join('\n');
  return (
    `Translate each numbered line into ${targetLang}.\n` +
    `Rules:\n` +
    `- Output exactly ${lines.length} lines, using the same numbering.\n` +
    `- Translate the meaning, not word by word. These are song lyrics.\n` +
    `- Do not add explanations, notes or any extra text.\n` +
    `- If a line is empty or has no words, repeat it as is.\n\n` +
    numbered
  );
}

async function callLocalModel(
  prompt: string,
  endpoint: string,
  model: string,
  signal?: AbortSignal,
): Promise<string> {
  // El plazo envuelve la petición Y la lectura del cuerpo: con `stream: false`
  // el runtime puede tener la conexión abierta y en silencio mientras genera.
  const dl = deadline(REQUEST_TIMEOUT_MS.local, signal);
  let connected = false;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        // Traducir no es tarea creativa: determinismo y sin sorpresas.
        temperature: 0,
        stream: false,
      }),
      signal: dl.signal,
    });
    connected = true;

    if (res.status === 404) {
      throw new Error(
        `El runtime local no conoce el modelo "${model}". Descárgalo primero ` +
          `(con Ollama: ollama pull ${model}).`,
      );
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Modelo local ${res.status}${detail ? `: ${detail.slice(0, 120)}` : ''}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('El modelo local devolvió una respuesta vacía');
    }
    return content;
  } catch (err) {
    if (dl.timedOut) {
      throw new Error(
        `El modelo local no terminó en ${seconds(REQUEST_TIMEOUT_MS.local)} s. ` +
          'Prueba con un modelo más pequeño, o con GPU.',
      );
    }
    if (isAbortError(err)) throw err;
    // Solo es "no se pudo conectar" si el fallo ocurrió ANTES de la respuesta;
    // si ya conectamos, el error de arriba es más informativo y hay que dejarlo.
    if (connected) throw err;
    throw new Error(
      `No se pudo conectar con el modelo local en ${endpoint}. ` +
        '¿Está el runtime abierto? (por ejemplo, que Ollama esté corriendo)',
    );
  } finally {
    dl.dispose();
  }
}

async function translateWithLocal(
  lines: string[],
  endpoint: string,
  model: string,
  targetLang: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const target = normalizeTargetLang(targetLang).toLowerCase();

  // Una sola generación para toda la canción: mucho más rápido que una
  // petición por línea, que en CPU sería insoportable.
  const raw = await callLocalModel(buildLocalPrompt(lines, target), endpoint, model, signal);
  const parsed = parseNumberedTranslations(raw, lines.length);
  if (parsed) return parsed;

  // El modelo se salió del formato. Antes de rendirse, se reintenta pidiendo
  // solo las líneas con contenido: menos líneas = menos margen de error.
  const nonEmpty = lines.map((line, i) => ({ line, i })).filter((x) => x.line.trim());
  if (nonEmpty.length > 0 && nonEmpty.length < lines.length) {
    const retryRaw = await callLocalModel(
      buildLocalPrompt(nonEmpty.map((x) => x.line), target),
      endpoint,
      model,
      signal,
    );
    const retry = parseNumberedTranslations(retryRaw, nonEmpty.length);
    if (retry) {
      const out = [...lines];
      nonEmpty.forEach((x, k) => {
        out[x.i] = retry[k];
      });
      return out;
    }
  }

  throw new Error(
    `El modelo local no respetó el formato pedido (se esperaban ${lines.length} líneas ` +
      'numeradas). Prueba con un modelo especializado en traducción, como translategemma.',
  );
}

async function translateWithDeepL(
  lines: string[],
  apiKey: string,
  targetLang: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const url = apiKey.endsWith(':fx') ? DEEPL_FREE_URL : DEEPL_PRO_URL;
  const body = new URLSearchParams();
  body.set('auth_key', apiKey);
  body.set('target_lang', normalizeTargetLang(targetLang));
  for (const line of lines) {
    body.append('text', line);
  }

  const dl = deadline(REQUEST_TIMEOUT_MS.deepl, signal);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: dl.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`DeepL ${res.status}${detail ? `: ${detail.slice(0, 120)}` : ''}`);
    }

    const data = (await res.json()) as { translations?: { text: string }[] };
    const out = data.translations?.map((t) => t.text) ?? [];
    if (out.length !== lines.length) {
      throw new Error(`DeepL devolvió ${out.length} líneas, se esperaban ${lines.length}`);
    }
    return out;
  } catch (err) {
    if (dl.timedOut) {
      throw new Error(`DeepL no respondió en ${seconds(REQUEST_TIMEOUT_MS.deepl)} s`);
    }
    throw err;
  } finally {
    dl.dispose();
  }
}

async function translateWithGoogle(
  lines: string[],
  apiKey: string,
  targetLang: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const url = `${GOOGLE_URL}?key=${encodeURIComponent(apiKey)}`;
  const dl = deadline(REQUEST_TIMEOUT_MS.google, signal);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: lines,
        target: targetLang.trim().toLowerCase() || 'es',
        format: 'text',
      }),
      signal: dl.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Google Translate ${res.status}${detail ? `: ${detail.slice(0, 120)}` : ''}`);
    }

    const data = (await res.json()) as {
      data?: { translations?: { translatedText: string }[] };
    };
    const out = data.data?.translations?.map((t) => t.translatedText) ?? [];
    if (out.length !== lines.length) {
      throw new Error(`Google devolvió ${out.length} líneas, se esperaban ${lines.length}`);
    }
    return out;
  } catch (err) {
    if (dl.timedOut) {
      throw new Error(`Google Translate no respondió en ${seconds(REQUEST_TIMEOUT_MS.google)} s`);
    }
    throw err;
  } finally {
    dl.dispose();
  }
}

/** Traduce las líneas de una letra con el proveedor configurado. */
export async function translateLines(
  lines: string[],
  config: TranslationConfig,
  signal?: AbortSignal,
): Promise<TranslationResult> {
  if (lines.length === 0) {
    return { ok: true, translations: [] };
  }

  const key = config.apiKey.trim();
  // MyMemory y el modelo local funcionan sin credenciales; en MyMemory,
  // `apiKey` es un email opcional para subir la cuota.
  const needsKey = config.provider === 'deepl' || config.provider === 'google';
  if (needsKey && !key) {
    return { ok: false, error: 'Falta la API key de traducción (Ajustes → Traducción)' };
  }

  // Presupuesto para TODA la canción, por encima del plazo de cada petición:
  // sin él, un proveedor lento línea a línea encadena timeouts hasta el infinito.
  const budget = deadline(TOTAL_BUDGET_MS[config.provider], signal);

  try {
    let translations: string[];
    if (config.provider === 'google') {
      translations = await translateWithGoogle(lines, key, config.targetLang, budget.signal);
    } else if (config.provider === 'deepl') {
      translations = await translateWithDeepL(lines, key, config.targetLang, budget.signal);
    } else if (config.provider === 'local') {
      translations = await translateWithLocal(
        lines,
        config.localEndpoint?.trim() || DEFAULT_LOCAL_ENDPOINT,
        config.localModel?.trim() || DEFAULT_LOCAL_MODEL,
        config.targetLang,
        budget.signal,
      );
    } else {
      translations = await translateWithMyMemory(lines, key, config.targetLang, budget.signal);
    }
    return { ok: true, translations };
  } catch (err) {
    if (budget.timedOut) {
      return {
        ok: false,
        error:
          `La traducción tardó más de ${seconds(TOTAL_BUDGET_MS[config.provider])} s y se canceló. ` +
          'Inténtalo otra vez o cambia de proveedor en Ajustes → Traducción.',
      };
    }
    if (isAbortError(err)) {
      return { ok: false, error: 'Traducción cancelada' };
    }
    const message = err instanceof Error ? err.message : 'Error de traducción';
    return { ok: false, error: message };
  } finally {
    budget.dispose();
  }
}
