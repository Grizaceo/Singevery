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
