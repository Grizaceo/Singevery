// ============================================================================
// LlmRuntime — runtime de inferencia local EMBEBIDO (llama.cpp server).
//
// Mismo patrón que SmtcReader: un sidecar nativo que el main lanza y vigila.
// La diferencia es que llama.cpp server no emite eventos por stdout: expone
// una API HTTP OpenAI-compatible en loopback, así que el health check es una
// petición GET /health en vez de un heartbeat por línea.
//
// Ciclo de vida:
//   - start(): lanza el binario con el modelo y espera a que /health responda.
//   - Watchdog: si el proceso muere o /health deja de responder, se relanza
//     con backoff (máx LLM_MAX_RESTARTS). Un solo camino de reintento.
//   - stop(): kill + SIGKILL de respaldo a los 500 ms (lección anti-zombie
//     de ef2034b: en Windows SIGTERM puede ser ignorado).
//
// El runtime es OPCIONAL: si no hay binario o no hay modelo, el proveedor
// 'local' de traducción sigue funcionando contra Ollama/LM Studio configurado
// a mano (comportamiento actual). El runtime embebido solo se activa cuando
// hay binario Y modelo.
//
// Estados (para la UI de Ajustes):
//   'disabled'      — sin binario (no empaquetado) o plataforma no soportada
//   'model-missing' — binario OK pero falta el modelo (ofrecer descarga)
//   'stopped'       — binario y modelo OK, runtime apagado (no se ha usado)
//   'starting'      — lanzando / esperando /health
//   'ready'         — /health responde, listo para traducir
//   'error'         — se agotaron los reintentos o falló el arranque
// ============================================================================

import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import * as fs from 'fs';
import { LLM_HOST, LLM_PORT } from './llmPath';

/** Frecuencia del chequeo del watchdog. */
export const LLM_WATCHDOG_INTERVAL_MS = 5000;
/** Sin /health OK por 4 chequeos → el runtime se considera caído. */
export const LLM_HEALTH_TIMEOUT_MS = LLM_WATCHDOG_INTERVAL_MS * 4;
/** Reintentos máximos antes de rendirse y deshabilitar el runtime. */
export const LLM_MAX_RESTARTS = 3;
/** Backoff base del reintento (se duplica por intento). */
export const LLM_RESTART_BASE_MS = 1000;
/** Techo del backoff. */
export const LLM_RESTART_MAX_MS = 30000;
/** Tiempo máximo esperando /health al arrancar (carga del modelo en CPU). */
export const LLM_STARTUP_TIMEOUT_MS = 120_000;
/** Tiempo máximo esperando /health tras un reinicio. */
export const LLM_RESTART_HEALTH_TIMEOUT_MS = 60_000;

export type LlmRuntimeState =
  | 'disabled'
  | 'model-missing'
  | 'stopped'
  | 'starting'
  | 'ready'
  | 'error';

export interface LlmRuntimeStatus {
  state: LlmRuntimeState;
  /** Ruta del binario ('' si no hay). */
  binPath: string;
  /** Ruta del modelo ('' si no hay). */
  modelPath: string;
  /** Mensaje legible del último error ('' si no hay). */
  error: string;
  /** URL base del endpoint OpenAI-compatible ('' si no está ready). */
  endpoint: string;
}

/** Backoff del reintento: base * 2^(attempt-1), con techo. Pura (testeable). */
export function nextRestartDelay(attempt: number, baseMs = LLM_RESTART_BASE_MS, maxMs = LLM_RESTART_MAX_MS): number {
  if (attempt <= 0) return 0;
  return Math.min(baseMs * 2 ** (attempt - 1), maxMs);
}

/** GET /health contra el runtime. Devuelve true si responde 200. */
export async function checkLlmHealth(
  host: string = LLM_HOST,
  port: number = LLM_PORT,
  timeoutMs = 2000,
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`http://${host}:${port}/health`, { signal: controller.signal });
      return res.ok;
    } finally {
      clearTimeout(t);
    }
  } catch {
    return false;
  }
}

/**
 * Gestiona el ciclo de vida del runtime LLM embebido.
 *
 * El arranque es asíncrono (espera /health): start() devuelve de inmediato y
 * el estado pasa por 'starting' hasta 'ready' o 'error'. Los listeners de
 * estado se notifican en cada transición.
 */
export class LlmRuntime {
  private proc: ChildProcess | null = null;
  private watchdog: NodeJS.Timeout | null = null;
  private restarts = 0;
  private stopping = false;
  private state: LlmRuntimeState = 'stopped';
  private lastError = '';
  private startupTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly binPath: string,
    private readonly modelPath: string,
    private readonly onStateChange: (status: LlmRuntimeStatus) => void = () => {},
    private readonly port: number = LLM_PORT,
    private readonly host: string = LLM_HOST,
  ) {}

  getStatus(): LlmRuntimeStatus {
    return {
      state: this.state,
      binPath: this.binPath,
      modelPath: this.modelPath,
      error: this.lastError,
      endpoint: this.state === 'ready' ? `http://${this.host}:${this.port}` : '',
    };
  }

  private setState(next: LlmRuntimeState, error = ''): void {
    if (next === this.state && error === this.lastError) return;
    this.state = next;
    if (error) this.lastError = error;
    this.onStateChange(this.getStatus());
  }

  /** Estado inicial según binario/modelo. Pura (testeable). */
  static initialStatus(binPath: string, modelPath: string): LlmRuntimeStatus {
    if (!binPath) {
      return { state: 'disabled', binPath: '', modelPath, error: '', endpoint: '' };
    }
    if (!modelPath || !fs.existsSync(modelPath)) {
      return { state: 'model-missing', binPath, modelPath, error: '', endpoint: '' };
    }
    return { state: 'stopped', binPath, modelPath, error: '', endpoint: '' };
  }

  /** ¿Hay binario y modelo? (precondición para start()). */
  canStart(): boolean {
    return Boolean(this.binPath) && Boolean(this.modelPath) && fs.existsSync(this.modelPath);
  }

  /**
   * Lanza el runtime. No-op si ya está corriendo o si no hay binario/modelo.
   * El binario se resuelve con el nombre de la plataforma (llama-server.exe en
   * Windows, llama-server en Linux; ver llmPath.ts), así que nunca se intenta
   * ejecutar un binario de otro SO.
   */
  start(): boolean {
    // stop() deja `stopping` en true para frenar los reintentos pendientes del
    // watchdog; un start() explícito posterior SÍ debe arrancar. Antes este
    // guard también miraba `stopping` y, tras un stop, el runtime no volvía a
    // arrancar nunca (ni con llm:start ni al terminar la descarga del modelo).
    if (this.proc) return false;
    if (!this.canStart()) {
      const status = LlmRuntime.initialStatus(this.binPath, this.modelPath);
      this.setState(status.state, status.error);
      return false;
    }

    this.stopping = false;
    this.setState('starting');

    try {
      // Acotar KV cache; builds CPU ejecutan en CPU aunque se solicite offload.
      this.proc = spawn(this.binPath, [
        '-m', this.modelPath, '--host', this.host, '--port', String(this.port),
        '--no-webui', '-c', '4096', '--gpu-layers', '99',
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      this.proc = null;
      this.setState('error', `No se pudo lanzar el runtime: ${String(err)}`);
      return false;
    }

    this.proc.stderr?.on('data', (d: Buffer) => {
      const text = d.toString();
      // El log de llama.cpp es ruidoso; solo se reenvía lo que parece un error.
      if (/error|failed|fatal/i.test(text)) console.error('[llm]', text.trim());
    });
    this.proc.on('exit', (code) => {
      console.warn('[llm] runtime finalizó con code', code);
      this.proc = null;
      if (!this.stopping) {
        // El watchdog detecta la ausencia de /health y decide el reintento.
        // Un solo camino de reintento evita bucles apretados.
        this.setState('starting', `El runtime se cerró (code ${code})`);
      }
    });

    this.ensureWatchdog();
    this.awaitHealth(LLM_STARTUP_TIMEOUT_MS);
    return true;
  }

  /** Espera a que /health responda; si no, marca error (el watchdog reintenta). */
  private awaitHealth(timeoutMs: number): void {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    const startedAt = Date.now();
    const poll = async (): Promise<void> => {
      if (this.stopping || !this.proc) return;
      if (await checkLlmHealth(this.host, this.port)) {
        this.restarts = 0; // arranque limpio: resetear el contador de reintentos
        this.setState('ready');
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        this.setState('error', `El runtime no respondió en ${Math.round(timeoutMs / 1000)} s`);
        return;
      }
      this.startupTimer = setTimeout(poll, 1000);
      this.startupTimer.unref?.();
    };
    void poll();
  }

  /** Chequea que el runtime siga vivo (/health) y lo relanza si no. */
  private checkHealth = (): void => {
    if (this.stopping || !this.proc) return;
    void checkLlmHealth(this.host, this.port).then((ok) => {
      if (this.stopping || !this.proc) return;
      if (ok) {
        if (this.state === 'starting' || this.state === 'error') this.setState('ready');
        return;
      }
      if (this.state === 'ready' || this.state === 'starting') {
        console.warn(`[llm] sin /health; relanzando (intento ${this.restarts + 1}/${LLM_MAX_RESTARTS})`);
        this.restart();
      }
    });
  };

  private ensureWatchdog(): void {
    if (this.watchdog) return;
    this.watchdog = setInterval(this.checkHealth, LLM_WATCHDOG_INTERVAL_MS);
    this.watchdog.unref?.();
  }

  private restart(): void {
    const proc = this.proc;
    this.proc = null;
    if (proc) {
      try {
        proc.kill('SIGKILL');
      } catch {
        /* ya murió entre medias */
      }
    }
    if (this.restarts >= LLM_MAX_RESTARTS) {
      console.error('[llm] se agotaron los reintentos; runtime deshabilitado (queda el proveedor local manual)');
      this.setState('error', 'El runtime se cerró repetidamente; revisa el modelo o usa Ollama/LM Studio');
      this.stop();
      return;
    }
    this.restarts += 1;
    const delay = nextRestartDelay(this.restarts);
    setTimeout(() => {
      if (this.stopping) return;
      const ok = this.start();
      if (!ok && this.restarts < LLM_MAX_RESTARTS) {
        this.restart();
      }
    }, delay);
  }

  stop(): void {
    this.stopping = true;
    if (this.watchdog) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    const proc = this.proc;
    this.proc = null;
    if (!proc) {
      this.setState('stopped');
      return;
    }
    proc.kill();
    proc.unref();
    // Respaldo anti-zombie: en Windows, SIGTERM a procesos nativos puede ser
    // ignorado. Si sigue vivo tras 500 ms, SIGKILL forzoso.
    const t = setTimeout(() => {
      if (proc.exitCode === null && proc.signalCode === null) {
        try {
          proc.kill('SIGKILL');
        } catch {
          /* ya murió entre medias */
        }
      }
    }, 500);
    t.unref?.();
    this.setState('stopped');
  }
}
