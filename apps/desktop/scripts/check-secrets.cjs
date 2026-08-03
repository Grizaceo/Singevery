'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'dist-electron',
  'release',
  'build',
  'coverage',
]);
const TEXT_EXTENSIONS = new Set([
  '', '.cjs', '.css', '.env', '.example', '.html', '.js', '.json', '.md',
  '.mjs', '.ps1', '.ts', '.tsx', '.txt', '.yml', '.yaml',
]);
const ASSIGNMENT_RE = /\b(AUDD_API_TOKEN|DEEPL_API_KEY|GOOGLE_API_KEY|OPENAI_API_KEY)\s*=\s*["']?([^\s"'#]+)["']?/gi;
const TOKEN_LIKE_PATTERNS = [
  { label: 'OpenAI-style key', re: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { label: 'GitHub token', re: /\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{20,}\b/g },
];
const SAFE_VALUES = [
  /^tu[_-]/i,
  /^your[_-]/i,
  /^example$/i,
  /^placeholder$/i,
  /^changeme$/i,
  /^<.+>$/,
  /^\$\{.+\}$/,
];

function isSafeExampleValue(value) {
  return SAFE_VALUES.some((re) => re.test(value));
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
    if (entry.name === '.env' || (entry.name.startsWith('.env.') && entry.name !== '.env.example')) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (TEXT_EXTENSIONS.has(ext) || entry.name.startsWith('.env')) out.push(full);
  }
  return out;
}

function scanText(text, relativePath) {
  const findings = [];
  let match;
  const assignments = new RegExp(ASSIGNMENT_RE.source, ASSIGNMENT_RE.flags);
  while ((match = assignments.exec(text)) !== null) {
    const value = match[2];
    if (!isSafeExampleValue(value)) {
      const line = text.slice(0, match.index).split(/\r?\n/).length;
      findings.push(`${relativePath}:${line} contiene un valor real para ${match[1]}`);
    }
  }
  for (const pattern of TOKEN_LIKE_PATTERNS) {
    const re = new RegExp(pattern.re.source, pattern.re.flags);
    while ((match = re.exec(text)) !== null) {
      const line = text.slice(0, match.index).split(/\r?\n/).length;
      findings.push(`${relativePath}:${line} contiene ${pattern.label}`);
    }
  }
  return findings;
}

function main() {
  const findings = [];
  for (const file of walk(ROOT)) {
    const relative = path.relative(ROOT, file).replaceAll('\\', '/');
    const text = fs.readFileSync(file, 'utf8');
    findings.push(...scanText(text, relative));
  }
  if (findings.length > 0) {
    console.error('[secrets] Posibles credenciales encontradas:');
    for (const finding of findings) console.error(`  - ${finding}`);
    console.error('[secrets] Revoca la credencial, reemplázala por un placeholder y vuelve a ejecutar.');
    process.exitCode = 1;
    return;
  }
  console.log('[secrets] OK: no se encontraron credenciales con patrones conocidos.');
}

if (require.main === module) main();

module.exports = { isSafeExampleValue, scanText };
