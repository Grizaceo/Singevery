import type { TrackMatch } from '../../../src/types';

/** Identificador de un motor de reconocimiento acústico. */
export type RecognitionProviderId = 'shazam' | 'audd';

export interface RecognitionProvider {
  readonly id: RecognitionProviderId;
  identify(audio: Buffer | Uint8Array, mimeType?: string): Promise<TrackMatch | null>;
}

/** Modo de selección del proveedor (persistido en settings). */
export type RecognitionProviderMode = 'auto' | 'shazam' | 'audd';
