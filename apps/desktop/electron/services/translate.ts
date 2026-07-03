// ============================================================================
// translate.ts — traducción por lote de líneas de letra (DeepL / Google v2).
// ============================================================================

export type TranslationProvider = 'deepl' | 'google';

export interface TranslationConfig {
  provider: TranslationProvider;
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

function normalizeTargetLang(lang: string): string {
  const trimmed = lang.trim().toUpperCase();
  return trimmed.length >= 2 ? trimmed.slice(0, 2) : 'ES';
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

/** Traduce un lote de líneas en una sola petición. */
export async function translateLines(
  lines: string[],
  config: TranslationConfig,
  signal?: AbortSignal,
): Promise<TranslationResult> {
  const key = config.apiKey.trim();
  if (!key) {
    return { ok: false, error: 'Falta la API key de traducción (Ajustes → Traducción)' };
  }
  if (lines.length === 0) {
    return { ok: true, translations: [] };
  }

  try {
    const translations =
      config.provider === 'google'
        ? await translateWithGoogle(lines, key, config.targetLang, signal)
        : await translateWithDeepL(lines, key, config.targetLang, signal);
    return { ok: true, translations };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error de traducción';
    return { ok: false, error: message };
  }
}
