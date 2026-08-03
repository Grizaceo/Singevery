import { describe, expect, it } from 'vitest';
import { redactSensitiveText } from '../electron/services/appLogger';

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
});
