import { describe, it, expect } from 'vitest';
import * as path from 'path';
import {
  resolveLlmServer,
  llmServerPath,
  LLM_DIST_SUBPATH,
  llmServerExeName,
  resolveLlmModel,
  llmModelPath,
  LLM_MODELS_DIR,
  DEFAULT_MODEL_FILENAME,
} from '../electron/services/llm/llmPath';

describe('llmPath', () => {
  it('llmServerPath une raíz + native/llm/llama-server(.exe)', () => {
    expect(llmServerPath('/repo', 'win32')).toBe(path.join('/repo', LLM_DIST_SUBPATH, 'llama-server.exe'));
    expect(llmServerPath('/repo', 'linux')).toBe(path.join('/repo', LLM_DIST_SUBPATH, 'llama-server'));
  });

  it('llmServerExeName según plataforma', () => {
    expect(llmServerExeName('win32')).toBe('llama-server.exe');
    expect(llmServerExeName('linux')).toBe('llama-server');
    expect(llmServerExeName('darwin')).toBe('llama-server');
  });

  it('respeta LLM_SERVER_BIN explícita aunque no exista', () => {
    const exists = (p: string) => p === '/repo/native/llm/llama-server.exe';
    expect(resolveLlmServer('/custom/llama-server.exe', ['/repo'], exists)).toBe('/custom/llama-server.exe');
  });

  it('trim de la env: espacios → respeta la ruta limpia', () => {
    expect(resolveLlmServer('  /forced.exe  ', ['/repo'], () => false)).toBe('/forced.exe');
  });

  it('autodetecta la primera raíz con binario', () => {
    const target = llmServerPath('/repo', 'win32');
    const exists = (p: string) => p === target;
    expect(resolveLlmServer(undefined, ['/nope1', '/repo', '/nope2'], exists, 'win32')).toBe(target);
  });

  it('devuelve "" si ninguna raíz tiene el binario (runtime deshabilitado)', () => {
    expect(resolveLlmServer(undefined, ['/a', '/b'], () => false)).toBe('');
  });

  it('llmModelPath une userData + models + nombre canónico', () => {
    expect(llmModelPath('/userData')).toBe(path.join('/userData', LLM_MODELS_DIR, DEFAULT_MODEL_FILENAME));
  });

  it('resolveLlmModel respeta LLM_MODEL_PATH explícita', () => {
    expect(resolveLlmModel('/custom/model.gguf', '/userData')).toBe('/custom/model.gguf');
  });

  it('resolveLlmModel sin env → ruta canónica bajo userData', () => {
    expect(resolveLlmModel(undefined, '/userData')).toBe(llmModelPath('/userData'));
  });
});
