import { describe, it, expect } from 'vitest';
import { EmbeddedTranslationStore, EMBEDDED_MODEL_NAME } from '../electron/services/llm/embeddedTranslationStore';
import { DEFAULT_LOCAL_ENDPOINT } from '../electron/services/translate';
import type { TranslationSettings } from '../src/types';
import type { LlmRuntime, LlmRuntimeStatus } from '../electron/services/llm/llmRuntime';

/** Store en memoria mínimo (mismo contrato que TranslationStore). */
function makeInner(initial: TranslationSettings) {
  let current = { ...initial };
  return {
    get: () => ({ ...current }),
    set: (partial: Partial<TranslationSettings>) => {
      current = { ...current, ...partial };
    },
  };
}

/** Runtime falso con estado controlable. */
function makeRuntime(status: Partial<LlmRuntimeStatus>): LlmRuntime {
  return {
    getStatus: () => ({
      state: 'stopped',
      binPath: '/bin',
      modelPath: '/model.gguf',
      error: '',
      endpoint: '',
      ...status,
    }),
  } as unknown as LlmRuntime;
}

const BASE: TranslationSettings = {
  provider: 'local',
  apiKey: '',
  targetLang: 'es',
  localEndpoint: DEFAULT_LOCAL_ENDPOINT,
  localModel: 'translategemma:4b',
};

describe('EmbeddedTranslationStore', () => {
  it('delega tal cual si el provider no es local', () => {
    const inner = makeInner({ ...BASE, provider: 'mymemory' });
    const store = new EmbeddedTranslationStore(inner, () => makeRuntime({ state: 'ready', endpoint: 'http://127.0.0.1:8034' }));
    expect(store.get()).toEqual({ ...BASE, provider: 'mymemory' });
  });

  it('delega tal cual si el runtime no está ready', () => {
    const inner = makeInner(BASE);
    const store = new EmbeddedTranslationStore(inner, () => makeRuntime({ state: 'model-missing' }));
    expect(store.get()).toEqual(BASE);
  });

  it('delega tal cual si no hay runtime', () => {
    const inner = makeInner(BASE);
    const store = new EmbeddedTranslationStore(inner, () => null);
    expect(store.get()).toEqual(BASE);
  });

  it('redirige al runtime embebido cuando está ready y el endpoint es el default', () => {
    const inner = makeInner(BASE);
    const store = new EmbeddedTranslationStore(inner, () =>
      makeRuntime({ state: 'ready', endpoint: 'http://127.0.0.1:8034' }),
    );
    const out = store.get();
    expect(out.localEndpoint).toBe('http://127.0.0.1:8034/v1/chat/completions');
    expect(out.localModel).toBe(EMBEDDED_MODEL_NAME);
    expect(out.provider).toBe('local');
  });

  it('respeta un endpoint personalizado (Ollama/LM Studio manual en otro puerto)', () => {
    const inner = makeInner({ ...BASE, localEndpoint: 'http://localhost:12345/v1/chat/completions' });
    const store = new EmbeddedTranslationStore(inner, () =>
      makeRuntime({ state: 'ready', endpoint: 'http://127.0.0.1:8034' }),
    );
    expect(store.get().localEndpoint).toBe('http://localhost:12345/v1/chat/completions');
    expect(store.get().localModel).toBe('translategemma:4b');
  });

  it('set() delega al store persistente (la UI sigue persistiendo igual)', () => {
    const inner = makeInner(BASE);
    const store = new EmbeddedTranslationStore(inner, () => null);
    store.set({ targetLang: 'ja' });
    expect(inner.get().targetLang).toBe('ja');
  });
});
