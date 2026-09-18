import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  LlmRuntime,
  nextRestartDelay,
  LLM_RESTART_BASE_MS,
  LLM_RESTART_MAX_MS,
} from '../electron/services/llm/llmRuntime';

describe('llmRuntime (funciones puras)', () => {
  describe('nextRestartDelay', () => {
    it('backoff exponencial: base * 2^(attempt-1)', () => {
      expect(nextRestartDelay(1)).toBe(LLM_RESTART_BASE_MS);
      expect(nextRestartDelay(2)).toBe(LLM_RESTART_BASE_MS * 2);
      expect(nextRestartDelay(3)).toBe(LLM_RESTART_BASE_MS * 4);
    });

    it('techo: nunca supera LLM_RESTART_MAX_MS', () => {
      expect(nextRestartDelay(10)).toBe(LLM_RESTART_MAX_MS);
      expect(nextRestartDelay(100)).toBe(LLM_RESTART_MAX_MS);
    });

    it('attempt <= 0 → 0 (sin reintento)', () => {
      expect(nextRestartDelay(0)).toBe(0);
      expect(nextRestartDelay(-1)).toBe(0);
    });
  });

  it('start() vuelve a arrancar después de un stop() explícito', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'singevery-llm-'));
    const model = path.join(dir, 'model.gguf');
    fs.writeFileSync(model, 'x');
    // El binario solo tiene que existir y poder lanzarse; node sale enseguida
    // por los argumentos desconocidos y el puerto nunca responde.
    const runtime = new LlmRuntime(process.execPath, model, () => {}, 1);
    expect(runtime.start()).toBe(true);
    runtime.stop();
    expect(runtime.getStatus().state).toBe('stopped');
    expect(runtime.start()).toBe(true);
    expect(runtime.getStatus().state).toBe('starting');
    runtime.stop();
  });
});

