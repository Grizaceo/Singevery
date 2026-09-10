import { describe, it, expect } from 'vitest';
import { nextRestartDelay, LLM_RESTART_BASE_MS, LLM_RESTART_MAX_MS } from '../electron/services/llm/llmRuntime';

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
});
