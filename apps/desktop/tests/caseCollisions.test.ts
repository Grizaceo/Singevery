import { describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// ===========================================================================
// Windows (y macOS) no distinguen mayúsculas en los nombres de archivo. Si dos
// módulos solo difieren en eso (p. ej. IpaGuide.tsx e ipaGuide.ts), en Linux
// cada import resuelve al suyo, pero en Windows `import … from './IpaGuide'`
// puede caer en el otro archivo y el componente llega `undefined`. Se descubrió
// recién en el release de Windows: este test lo detecta en el CI de Linux.
// ===========================================================================

const ROOT = join(__dirname, '..');
const MODULE_EXT = /\.(tsx?|jsx?|mjs|cjs)$/;

function modulesIn(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) modulesIn(path, out);
    else if (MODULE_EXT.test(name)) out.push(relative(ROOT, path));
  }
  return out;
}

describe('nombres de módulo', () => {
  it('no hay dos módulos que solo difieran en mayúsculas', () => {
    const byKey = new Map<string, string[]>();
    for (const dir of ['src', 'electron', 'tests']) {
      for (const file of modulesIn(join(ROOT, dir))) {
        const key = file.replace(MODULE_EXT, '').toLowerCase();
        byKey.set(key, [...(byKey.get(key) ?? []), file]);
      }
    }
    const collisions = [...byKey.values()].filter((files) => files.length > 1);
    expect(collisions).toEqual([]);
  });
});
