// ============================================================================
// Resolución de rutas del runtime LLM embebido (llama.cpp server).
//
// El runtime es un sidecar nativo igual que espejo-smtc.exe: un binario
// empaquetado en resources/ que el main lanza y vigila. La diferencia es que
// llama.cpp server habla HTTP (API OpenAI-compatible) en vez de JSON por
// stdout, y que el MODELO no viaja en el instalador (pesa GB): se descarga
// bajo demanda en userData/models/.
//
// Prioridad del binario:
//   1. LLM_SERVER_BIN (env) — si el usuario la fuerza, se respeta.
//   2. Autodetección: <root>/native/llm/llama-server(.exe) para cada raíz
//      candidata (cwd, app.getAppPath(), __dirname relativo al repo, recursos
//      empaquetados). La primera que exista gana.
//   3. '' → runtime deshabilitado (el proveedor local queda como hoy: exige
//      Ollama/LM Studio configurado a mano).
//
// Prioridad del modelo:
//   1. LLM_MODEL_PATH (env) — ruta explícita.
//   2. <userData>/models/<DEFAULT_MODEL_FILENAME> — el modelo canónico
//      (descargado bajo demanda o colocado a mano).
//   3. '' → estado 'model-missing' (la app ofrece descargarlo).
//
// Pura respecto a la lista de raíces y al chequeo de existencia (inyectable
// para tests), igual que smtcPath.ts.
// ============================================================================

import * as path from 'path';
import * as fs from 'fs';

/** Nombre del binario según plataforma. */
export function llmServerExeName(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'llama-server.exe' : 'llama-server';
}

/** Subruta del binario bajo una raíz del repo. */
export const LLM_DIST_SUBPATH = path.join('native', 'llm');

/** Carpeta de modelos dentro de userData. */
export const LLM_MODELS_DIR = 'models';

/** Nombre canónico del modelo en disco (el fine-tune futuro lo reemplaza). */
export const DEFAULT_MODEL_FILENAME = 'translategemma-singevery.gguf';

/**
 * URL por defecto del modelo. Apunta al GGUF Q4_K_M de translategemma-4b-it
 * (mradermacher). Se puede sobreescribir con LLM_MODEL_URL (env) — útil para
 * servir el fine-tune propio desde otro origen.
 */
export const DEFAULT_MODEL_URL =
  'https://huggingface.co/mradermacher/translategemma-4b-it-GGUF/resolve/main/translategemma-4b-it.Q4_K_M.gguf';

/** Puerto del runtime embebido. 8033 es el llama.cpp del sistema (manual). */
export const LLM_PORT = 8034;
/** El runtime solo escucha en loopback: nunca expone el modelo a la red. */
export const LLM_HOST = '127.0.0.1';

/** Devuelve el path al binario bajo una raíz dada. */
export function llmServerPath(repoRoot: string, platform: NodeJS.Platform = process.platform): string {
  return path.join(repoRoot, LLM_DIST_SUBPATH, llmServerExeName(platform));
}

/**
 * Resuelve el ejecutable del runtime LLM.
 * - Si `envValue` está definido (LLM_SERVER_BIN), se devuelve tal cual.
 * - Si no, recorre `roots` en orden y devuelve la primera ruta existente.
 * - Si ninguna existe, devuelve '' (runtime fuera).
 */
export function resolveLlmServer(
  envValue: string | undefined,
  roots: string[],
  existsFn: (p: string) => boolean = defaultExists,
  platform: NodeJS.Platform = process.platform,
): string {
  const env = envValue?.trim();
  if (env) return env;
  for (const root of roots) {
    const p = llmServerPath(root, platform);
    if (existsFn(p)) return p;
  }
  return '';
}

/** Devuelve la ruta del modelo canónico bajo userData. */
export function llmModelPath(userDataDir: string, filename: string = DEFAULT_MODEL_FILENAME): string {
  return path.join(userDataDir, LLM_MODELS_DIR, filename);
}

/**
 * Resuelve la ruta del modelo.
 * - Si `envValue` está definido (LLM_MODEL_PATH), se devuelve tal cual.
 * - Si no, la ruta canónica bajo userData (exista o no: la descarga la crea).
 */
export function resolveLlmModel(
  envValue: string | undefined,
  userDataDir: string,
  filename: string = DEFAULT_MODEL_FILENAME,
): string {
  const env = envValue?.trim();
  if (env) return env;
  return llmModelPath(userDataDir, filename);
}

const defaultExists: (p: string) => boolean = (p) => fs.existsSync(p);
