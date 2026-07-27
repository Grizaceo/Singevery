// ============================================================================
// translate.ts — traducción de las líneas de una letra.
//
// Proveedores:
//   - mymemory (por defecto): SIN API key ni registro. Es lo que permite que la
//     traducción funcione recién instalada la app; DeepL/Google quedan como
//     mejora opcional para quien tenga credenciales.
//   - deepl / google: mejor calidad, requieren clave del usuario.
// ============================================================================

export type TranslationProvider = 'mymemory' | 'deepl' | 'google';

export interface TranslationConfig {
  provider: TranslationProvider;
  /** DeepL/Google: la clave. MyMemory: email opcional (sube la cuota diaria). */
  apiKey: string;
  targetLang: string;
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

  const res = await fetch(`${MYMEMORY_URL}?${params.toString()}`, { signal });
  if (!res.ok) {
    throw new Error(`MyMemory HTTP ${res.status}`);
  }
  return readMyMemory((await res.json()) as MyMemoryResponse);
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

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal,
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
}

async function translateWithGoogle(
  lines: string[],
  apiKey: string,
  targetLang: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const url = `${GOOGLE_URL}?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: lines,
      target: targetLang.trim().toLowerCase() || 'es',
      format: 'text',
    }),
    signal,
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
  // MyMemory es el único que funciona sin credenciales; en él, `apiKey` es un
  // email opcional para subir la cuota.
  if (config.provider !== 'mymemory' && !key) {
    return { ok: false, error: 'Falta la API key de traducción (Ajustes → Traducción)' };
  }

  try {
    let translations: string[];
    if (config.provider === 'google') {
      translations = await translateWithGoogle(lines, key, config.targetLang, signal);
    } else if (config.provider === 'deepl') {
      translations = await translateWithDeepL(lines, key, config.targetLang, signal);
    } else {
      translations = await translateWithMyMemory(lines, key, config.targetLang, signal);
    }
    return { ok: true, translations };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error de traducción';
    return { ok: false, error: message };
  }
}
