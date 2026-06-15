import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

/** Carga variables de .env al arranque (solo proceso main). */
export function loadDotEnv(): void {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(app.getAppPath(), '.env'),
    // En dev: apps/desktop/dist-electron/electron/main.js → repo root es ../../..
    path.join(__dirname, '..', '..', '..', '.env'),
    // En prod: apps/desktop/dist-electron/electron/main.js → repo root es ../../..
    path.join(__dirname, '..', '..', '.env'),
  ];

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    console.log(`[env] Cargado .env desde: ${envPath}`);
    break;
  }
}

export function getAuddToken(): string | undefined {
  const token = process.env.AUDD_API_TOKEN?.trim();
  return token || undefined;
}
