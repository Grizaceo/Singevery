import { describe, it, expect } from 'vitest';
import { createServer } from 'node:net';
import { LlmRuntime } from '../electron/services/llm/llmRuntime';
import { EmbeddedTranslationStore, EMBEDDED_MODEL_NAME } from '../electron/services/llm/embeddedTranslationStore';
import { DEFAULT_LOCAL_ENDPOINT, DEFAULT_LOCAL_MODEL, translateLines } from '../electron/services/translate';
import type { TranslationSettings } from '../src/types';

// Opt-in: no descarga, no letras de usuarios, no proveedor remoto.
// SINGEVERY_TEST_LLM_BIN y SINGEVERY_TEST_LLM_MODEL apuntan a archivos locales.
const enabled = Boolean(process.env.SINGEVERY_TEST_LLM_BIN && process.env.SINGEVERY_TEST_LLM_MODEL);
describe.skipIf(!enabled)('Hy-MT2 real, runtime -> store -> translateLines', () => {
  it('traduce corpus original y cierra el sidecar', async () => {
    const port = await new Promise<number>((resolve, reject) => {
      const server = createServer();
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') return reject(new Error('No TCP port'));
        server.close(() => resolve(address.port));
      });
    });
    const runtime = new LlmRuntime(process.env.SINGEVERY_TEST_LLM_BIN!, process.env.SINGEVERY_TEST_LLM_MODEL!, () => {}, port);
    let config: TranslationSettings = {
      provider: 'local', apiKey: '', targetLang: 'es',
      localEndpoint: DEFAULT_LOCAL_ENDPOINT, localModel: DEFAULT_LOCAL_MODEL,
    };
    const store = new EmbeddedTranslationStore({ get: () => config, set: (p) => { config = { ...config, ...p }; } }, () => runtime);
    try {
      expect(runtime.start()).toBe(true);
      const deadline = Date.now() + 90000;
      while (runtime.getStatus().state !== 'ready' && Date.now() < deadline) {
        if (runtime.getStatus().state === 'error') throw new Error(runtime.getStatus().error);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(runtime.getStatus().state).toBe('ready');
      expect(store.get().localModel).toBe('hymt2-singevery');
      expect(EMBEDDED_MODEL_NAME).toBe(DEFAULT_LOCAL_MODEL);
      const cases = [
        ['I left my shadow waiting at the station.', 'You said the rain would wash our names away.', 'But every road still leads me to your doorway.', 'And I keep saving words I cannot say.'],
        ['The moon forgot the name of our street.', '', 'Oh, oh, I am still here.', 'The moon forgot the name of our street.'],
        ['雨の駅で君を待っていた', '言えなかった言葉がまだ胸にある', '君がいなくても朝は来る', 'I miss you でも前に進む'],
      ];
      for (const lines of cases) {
        const started = performance.now();
        const result = await translateLines(lines, store.get());
        console.log(JSON.stringify({ elapsedMs: Math.round(performance.now() - started), source: lines, ...result }));
        expect(result.ok, result.error).toBe(true);
        expect(result.translations).toHaveLength(lines.length);
        lines.forEach((line, i) => {
          if (line.trim()) expect(result.translations![i].trim()).not.toBe('');
          else expect(result.translations![i]).toBe('');
        });
      }
    } finally {
      runtime.stop();
      expect(runtime.getStatus().state).toBe('stopped');
    }
  }, 120000);
});
