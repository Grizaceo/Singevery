import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { initAppLogger, isBrokenPipe, redactSensitiveText } from '../electron/services/appLogger';

describe('appLogger', () => {
  it('redacta credenciales y emails', () => {
    const tokenAssignment = 'AUDD_' + 'API_TOKEN=' + '0123456789abcdef0123456789abcdef';
    const key = 's' + 'k-abcdefghijklmnopqrstuv';
    const url = `https://example.test?q=1&key=${key}`;
    const output = redactSensitiveText(`${tokenAssignment} apiKey=${key} yo@example.com ${url}`);
    expect(output).not.toContain('0123456789abcdef');
    expect(output).not.toContain('abcdefghijklmnop');
    expect(output).not.toContain('yo@example.com');
    expect(output).toContain('[REDACTED');
    expect(output).toContain('&key=[REDACTED]');
  });

  it('isBrokenPipe reconoce la terminal cerrada y nada más', () => {
    expect(isBrokenPipe(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))).toBe(true);
    expect(isBrokenPipe(Object.assign(new Error('destroyed'), { code: 'ERR_STREAM_DESTROYED' }))).toBe(true);
    expect(isBrokenPipe(Object.assign(new Error('nope'), { code: 'ENOENT' }))).toBe(false);
    expect(isBrokenPipe(null)).toBe(false);
  });

  it('un EPIPE de stdout no escala a excepción y el archivo sigue registrando', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'singevery-logger-'));
    const file = initAppLogger(dir, 'test');
    const epipe = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
    // Sin listener, emitir 'error' en stdout lanza (es lo que volvía el EPIPE
    // una uncaughtException en bucle). Con el logger iniciado no debe lanzar.
    expect(() => process.stdout.emit('error', epipe)).not.toThrow();
    expect(() => console.error('después del EPIPE')).not.toThrow();
    expect(fs.readFileSync(file, 'utf8')).toContain('después del EPIPE');
  });
});
