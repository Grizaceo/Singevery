import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { formatWithOptions } from 'node:util';

const MAX_LOG_BYTES = 1_000_000;
const DEFAULT_EXPORT_BYTES = 200_000;
let logFilePath: string | null = null;
let initialized = false;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Redacta credenciales, emails y la ruta del perfil antes de persistir/exportar. */
export function redactSensitiveText(input: string): string {
  let text = input
    .replace(
      /\b(api[_-]?key|authorization|audd_api_token|access[_-]?token|refresh[_-]?token|token)\b\s*[:=]\s*["']?[^\s,"']+/gi,
      '$1=[REDACTED]',
    )
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED_KEY]')
    .replace(/\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{12,}\b/g, '[REDACTED_KEY]')
    .replace(
      /([?&](?:api[_-]?key|auth_key|key|api_token|usertoken|token)=)[^&#\s]+/gi,
      '$1[REDACTED]',
    )
    .replace(/\b[A-Fa-f0-9]{32}\b/g, '[REDACTED_TOKEN]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]');

  const home = os.homedir();
  if (home) text = text.replace(new RegExp(escapeRegExp(home), 'gi'), '[USER_HOME]');
  return text;
}

function rotateIfNeeded(file: string): void {
  try {
    if (!fs.existsSync(file) || fs.statSync(file).size < MAX_LOG_BYTES) return;
    const previous = path.join(path.dirname(file), 'main.previous.log');
    fs.rmSync(previous, { force: true });
    fs.renameSync(file, previous);
  } catch {
    // Logging nunca debe impedir que la app arranque.
  }
}

function append(level: string, values: unknown[]): void {
  if (!logFilePath) return;
  try {
    const rendered = formatWithOptions(
      { colors: false, depth: 4, maxArrayLength: 30, maxStringLength: 4_000 },
      ...values,
    );
    const line = `${new Date().toISOString()} ${level} ${redactSensitiveText(rendered)}\n`;
    fs.appendFileSync(logFilePath, line, 'utf8');
  } catch {
    // Evita recursión: no usar console.* dentro del logger.
  }
}

export function initAppLogger(logDirectory: string, appVersion: string): string {
  if (initialized && logFilePath) return logFilePath;
  fs.mkdirSync(logDirectory, { recursive: true });
  logFilePath = path.join(logDirectory, 'main.log');
  rotateIfNeeded(logFilePath);

  const original = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  console.log = (...values: unknown[]): void => {
    original.log(...values);
    append('INFO ', values);
  };
  console.warn = (...values: unknown[]): void => {
    original.warn(...values);
    append('WARN ', values);
  };
  console.error = (...values: unknown[]): void => {
    original.error(...values);
    append('ERROR', values);
  };
  initialized = true;
  append('INFO ', [`Singevery ${appVersion} logger iniciado`]);
  return logFilePath;
}

export function getLogFilePath(): string | null {
  return logFilePath;
}

export function readRecentLog(maxBytes = DEFAULT_EXPORT_BYTES): string {
  if (!logFilePath || !fs.existsSync(logFilePath)) return '';
  try {
    const data = fs.readFileSync(logFilePath);
    const tail = data.subarray(Math.max(0, data.length - maxBytes)).toString('utf8');
    return redactSensitiveText(tail);
  } catch {
    return '';
  }
}
