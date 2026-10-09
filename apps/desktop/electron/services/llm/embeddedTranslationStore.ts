// ============================================================================
// EmbeddedTranslationStore — redirige la traducción local al runtime embebido.
//
// Envuelve el TranslationStore persistente y, cuando el runtime LLM embebido
// (llama.cpp server) está 'ready', reescribe la config de traducción local
// para que apunte a él en vez de a Ollama/LM Studio. Así el usuario elige
// "IA local" en Ajustes y la app usa el runtime embebido automáticamente, sin
// configurar nada.
//
// Reglas (conservadoras):
//   - Solo actúa si el provider es 'local' (el usuario ya eligió IA local).
//   - Solo sobreescribe el endpoint si el usuario NO lo personalizó (si
//     configuró Ollama/LM Studio a mano en otro puerto, se respeta).
//   - El nombre del modelo es cosmético: llama.cpp server sirve el modelo que
//     cargó y no valida el nombre en /v1/chat/completions.
//   - set() delega al store real: la UI sigue persistiendo igual que antes.
// ============================================================================

import { DEFAULT_LOCAL_ENDPOINT } from '../translate';
import type { TranslationStore } from '../settings';
import type { TranslationSettings } from '../../../src/types';
import type { LlmRuntime } from './llmRuntime';

/** Nombre de modelo que se reporta al endpoint embebido (cosmético). */
export const EMBEDDED_MODEL_NAME = 'hymt2-singevery';

export class EmbeddedTranslationStore implements TranslationStore {
  constructor(
    private readonly inner: TranslationStore,
    private readonly runtimeRef: () => LlmRuntime | null,
  ) {}

  get(): TranslationSettings {
    const config = this.inner.get();
    const runtime = this.runtimeRef();
    if (config.provider !== 'local' || !runtime) return config;

    const status = runtime.getStatus();
    if (status.state !== 'ready' || !status.endpoint) return config;

    const endpoint = config.localEndpoint?.trim() || DEFAULT_LOCAL_ENDPOINT;
    // Respetar endpoints personalizados (Ollama/LM Studio manual en otro puerto).
    if (endpoint !== DEFAULT_LOCAL_ENDPOINT) return config;

    return {
      ...config,
      localEndpoint: `${status.endpoint}/v1/chat/completions`,
      localModel: EMBEDDED_MODEL_NAME,
    };
  }

  set(partial: Partial<TranslationSettings>): void {
    this.inner.set(partial);
  }
}
