import { deadline, isAbortError, seconds } from '../http';

/**
 * Tope para la llamada a Shazam. Sin él, una red que no responde deja el IPC
 * `recognition:identify` sin resolver y la app clavada en "Identificando...".
 * 15 s es holgado: la huella ya viaja comprimida y el servicio responde en ~1-2 s.
 */
export const SHAZAM_TIMEOUT_MS = 15_000;

/** Headers HTTP para la API no oficial de Shazam (amp.shazam.com). */
export function shazamRequestHeaders(language = 'en-US'): Record<string, string> {
  return {
    'X-Shazam-Platform': 'IPHONE',
    'X-Shazam-AppVersion': '14.1.0',
    Accept: '*/*',
    'Content-Type': 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Accept-Language': language,
    'User-Agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  };
}

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  }).toUpperCase();
}

function buildRecognizeUrl(): string {
  const base = `https://amp.shazam.com/discovery/v5/en/US/iphone/-/tag/${uuidv4()}/${uuidv4()}`;
  const params = new URLSearchParams({
    sync: 'true',
    webv3: 'true',
    sampling: 'true',
    connected: '',
    shazamapiversion: 'v3',
    sharehub: 'true',
    hubv5minorversion: 'v5.1',
    hidelb: 'true',
    video: 'v3',
  });
  return `${base}?${params.toString()}`;
}

export interface ShazamSignaturePayload {
  uri: string;
  samplems: number;
}

export interface ShazamApiResponse {
  matches?: Array<{ offset?: number }>;
  track?: {
    title?: string;
    subtitle?: string;
    key?: string;
    sections?: Array<{
      type?: string;
      metadata?: Array<{ title?: string; text?: string }>;
    }>;
  };
}

/** Envía una huella a Shazam y devuelve la respuesta cruda (null si no hay match). */
export async function sendShazamRecognizeRequest(
  signature: ShazamSignaturePayload,
  timezone = 'Europe/Paris',
  language = 'en-US',
): Promise<ShazamApiResponse | null> {
  const body = JSON.stringify({
    timezone,
    signature: {
      uri: signature.uri,
      samplems: signature.samplems,
    },
    timestamp: Date.now(),
    context: {},
    geolocation: {},
  });

  // El plazo cubre también la lectura del cuerpo: un servidor puede aceptar la
  // conexión y luego no mandar nada, que es igual de fatal que no responder.
  const dl = deadline(SHAZAM_TIMEOUT_MS);
  try {
    const response = await fetch(buildRecognizeUrl(), {
      method: 'POST',
      headers: shazamRequestHeaders(language),
      body,
      signal: dl.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Shazam HTTP ${response.status}: ${text.slice(0, 120)}`);
    }

    const data = (await response.json()) as ShazamApiResponse;
    if (!data.matches || data.matches.length === 0) return null;
    if (!data.track?.title || !data.track?.subtitle) return null;
    return data;
  } catch (err) {
    if (dl.timedOut) {
      throw new Error(`Shazam no respondió en ${seconds(SHAZAM_TIMEOUT_MS)} s`);
    }
    if (isAbortError(err)) throw new Error('Reconocimiento cancelado');
    throw err;
  } finally {
    dl.dispose();
  }
}
