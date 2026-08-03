import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { isSafeExampleValue, scanText } = require('../scripts/check-secrets.cjs') as {
  isSafeExampleValue: (value: string) => boolean;
  scanText: (text: string, relativePath: string) => string[];
};

describe('check-secrets', () => {
  it('acepta placeholders de archivos example', () => {
    expect(isSafeExampleValue('tu_token_aqui')).toBe(true);
    expect(isSafeExampleValue('YOUR_API_KEY')).toBe(true);
    expect(isSafeExampleValue('${AUDD_API_TOKEN}')).toBe(true);
  });

  it('rechaza valores reales asignados a variables sensibles', () => {
    const findings = scanText(
      'AUDD_' + 'API_TOKEN=' + '0123456789abcdef0123456789abcdef',
      '.env.example',
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('AUDD_API_TOKEN');
  });

  it('detecta tokens conocidos aunque no estén en un archivo env', () => {
    const findings = scanText('const key = "s' + 'k-abcdefghijklmnopqrstuv";', 'src/example.ts');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('OpenAI-style');
  });
});
