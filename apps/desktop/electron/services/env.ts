import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

/** Carga variables de .env al arranque (solo proceso main). */
export function loadDotEnv(): void {
  // En dev compilado: __dirname = apps/desktop/dist-electron/electron/services
  // Repo root = ../../../../../
  const candidates = [
    // App empaquetada: .env que el PROPIO USUARIO deja junto a la instalación
    // para configurar su AUDD_API_TOKEN (ver GUIA_DE_USO.md §7). El instalador
    // ya no empaqueta ningún .env: hacerlo repartía el token del desarrollador
    // en texto plano a todo el que instalara la app.
    path.join(process.resourcesPath, '.env'),
    path.join(process.cwd(), '.env'),
    path.join(app.getAppPath(), '.env'),
    // Desde dist-electron/electron/services → repo root
    path.join(__dirname, '..', '..', '..', '..', '..', '.env'),
    // Desde dist-electron/electron (fallback)
    path.join(__dirname, '..', '..', '..', '..', '.env'),
    // Desde dist-electron (fallback)
    path.join(__dirname, '..', '..', '..', '.env'),
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