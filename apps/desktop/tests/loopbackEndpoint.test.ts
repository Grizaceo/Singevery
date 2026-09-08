// S4 — el proveedor "local" solo acepta endpoints en loopback; un endpoint
// remoto no debe poder recibir las letras sin consentimiento externo.
import { describe, expect, it } from 'vitest';
import { isLoopbackEndpoint } from '../electron/services/translate';

describe('isLoopbackEndpoint (S4)', () => {
  it('acepta localhost y 127.0.0.1 con http', () => {
    expect(isLoopbackEndpoint('http://localhost:11434/v1/chat/completions')).toBe(true);
    expect(isLoopbackEndpoint('http://127.0.0.1:8080/v1/chat/completions')).toBe(true);
  });

  it('acepta ::1 (IPv6 loopback)', () => {
    expect(isLoopbackEndpoint('http://[::1]:11434/v1/chat/completions')).toBe(true);
  });

  it('rechaza hosts remotos', () => {
    expect(isLoopbackEndpoint('http://192.168.1.10:11434/v1/chat/completions')).toBe(false);
    expect(isLoopbackEndpoint('https://translate.example.com/v1/chat/completions')).toBe(false);
    expect(isLoopbackEndpoint('http://localhost.evil.com:11434/v1')).toBe(false);
  });

  it('rechaza protocolos no http(s) y URLs inválidas', () => {
    expect(isLoopbackEndpoint('file:///etc/passwd')).toBe(false);
    expect(isLoopbackEndpoint('ftp://localhost/x')).toBe(false);
    expect(isLoopbackEndpoint('no-es-una-url')).toBe(false);
  });
});
