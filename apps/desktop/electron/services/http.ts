// ============================================================================
// appFetch — fetch robusto para el proceso main.
//
// En Electron usa net.fetch: la pila de red de Chromium (Happy Eyeballs
// IPv4/IPv6, proxy del sistema, HTTP/2). El fetch de Node (undici) puede
// colgarse hasta el timeout en redes con IPv6 roto o rutas malas — visto en
// producción: lrclib.net colgado 8 s y abortado en CADA consulta mientras
// otros hosts respondían en ms y el navegador cargaba lrclib sin problema.
//
// Fuera de Electron (vitest / Node puro) cae al fetch global en el momento de
// la llamada, así los tests pueden seguir usando vi.stubGlobal('fetch', ...).
// ============================================================================

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

/** undefined = aún no resuelto; null = no estamos en Electron. */
let electronFetch: FetchLike | null | undefined;

async function resolveElectronFetch(): Promise<FetchLike | null> {
  try {
    // En Node puro el paquete `electron` exporta un string (ruta al binario):
    // `.net` no existe y caemos al fetch global. En el main de Electron sí.
    const electron = (await import('electron')) as unknown as {
      net?: { fetch?: (input: string | URL, init?: RequestInit) => Promise<Response> };
    };
    const netFetch = electron?.net?.fetch;
    if (typeof netFetch !== 'function') return null;
    return (input, init) => netFetch(input, init);
  } catch {
    return null;
  }
}

export async function appFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  if (electronFetch === undefined) {
    electronFetch = await resolveElectronFetch();
  }
  return electronFetch ? electronFetch(input, init) : globalThis.fetch(input, init);
}

// ============================================================================
// Plazos (deadlines) para llamadas de red.
//
// Un fetch SIN plazo no falla: se queda esperando. En el proceso main eso deja
// la promesa del IPC sin resolver y el spinner del renderer girando para
// siempre, sin forma de cancelar. Cualquier llamada de red debe tener un tope.
//
// `deadline()` combina un plazo propio con un signal externo (el presupuesto
// total de la operación, p. ej.), y recuerda CUÁL de los dos cortó: sin eso no
// se puede distinguir "el servicio no respondió" de "el usuario canceló".
// ============================================================================

export interface Deadline {
  readonly signal: AbortSignal;
  /** true solo si el corte lo provocó ESTE plazo, no el signal externo. */
  readonly timedOut: boolean;
  /** Libera el temporizador y el listener. Llamar siempre en un `finally`. */
  dispose(): void;
}

/**
 * Signal que se aborta al vencer `ms` o cuando se aborta `external`.
 *
 * No usa `AbortSignal.any` / `AbortSignal.timeout` a propósito: se necesita
 * saber cuál de las dos causas disparó, y esto funciona igual en Node 20, en
 * Chromium y bajo los temporizadores falsos de vitest.
 */
export function deadline(ms: number, external?: AbortSignal | null): Deadline {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);

  const onExternalAbort = (): void => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', onExternalAbort, { once: true });
  }

  return {
    signal: controller.signal,
    get timedOut(): boolean {
      return timedOut;
    },
    dispose(): void {
      clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    },
  };
}

/** ¿El error viene de un abort (plazo vencido o cancelación) y no de la red? */
export function isAbortError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const name = (err as { name?: unknown }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}

/** Segundos legibles para mensajes de error ("12" y no "12.0" ni "12000"). */
export function seconds(ms: number): string {
  return String(Math.round(ms / 1000));
}
