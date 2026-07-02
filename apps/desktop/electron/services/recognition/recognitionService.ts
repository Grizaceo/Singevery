import { getAuddToken } from '../env';
import type { TrackMatch } from '../../../src/types';
import type { RecognitionProviderMode } from './provider';
import { auddProvider } from './auddProvider';
import { shazamProvider } from './shazamProvider';

export interface RecognitionServiceOptions {
  getProviderMode: () => RecognitionProviderMode;
}

/**
 * Orquesta proveedores de reconocimiento con fallback:
 * - auto: Shazam (gratis) primero, AudD si hay token y Shazam no reconoce/falla.
 * - shazam / audd: proveedor fijo.
 */
export class RecognitionService {
  constructor(private readonly options: RecognitionServiceOptions) {}

  async identify(
    audio: Buffer | Uint8Array,
    mimeType = 'audio/wav',
  ): Promise<TrackMatch | null> {
    const mode = this.options.getProviderMode();
    if (mode === 'shazam') {
      return shazamProvider.identify(audio, mimeType);
    }
    if (mode === 'audd') {
      return auddProvider.identify(audio, mimeType);
    }
    return this.identifyAuto(audio, mimeType);
  }

  private async identifyAuto(
    audio: Buffer | Uint8Array,
    mimeType: string,
  ): Promise<TrackMatch | null> {
    try {
      const shazamMatch = await shazamProvider.identify(audio, mimeType);
      if (shazamMatch) return shazamMatch;
    } catch (err) {
      console.warn('[recognition] Shazam falló en modo auto:', err);
    }

    if (!getAuddToken()) {
      return null;
    }

    try {
      return await auddProvider.identify(audio, mimeType);
    } catch (err) {
      console.warn('[recognition] AudD falló en modo auto:', err);
      return null;
    }
  }
}

/** Resuelve el orden de proveedores para tests y diagnóstico. */
export function resolveProviderChain(mode: RecognitionProviderMode, hasAuddToken: boolean): string[] {
  if (mode === 'shazam') return ['shazam'];
  if (mode === 'audd') return ['audd'];
  return hasAuddToken ? ['shazam', 'audd'] : ['shazam'];
}
