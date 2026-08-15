// ============================================================================
// trackChange.ts — detector LOCAL de corte de pista (sin red, sin API).
//
// El problema que resuelve: en modo seguimiento la app re-identifica cada
// ~18-20s (6s de captura + red + 12s de pausa). Cuando el usuario cambia de
// canción, el fingerprint no se entera hasta el siguiente ciclo, y encima la
// histéresis pide una segunda confirmación: la letra vieja se queda en
// pantalla 30-50s.
//
// Este detector mira el audio que YA está entrando (analyser en vivo, coste
// ~0) y avisa en cuanto ve la huella física de un cambio de tema:
//
//   - 'gap'     → bache de silencio entre pistas. Es la señal FUERTE: casi
//                 todos los reproductores dejan un hueco al pasar de canción.
//   - 'novelty' → el timbre cambió de golpe y se sostuvo (crossfade, mezcla
//                 encadenada, autoplay sin hueco). Señal DÉBIL: sirve para
//                 disparar una re-identificación, no para dar por hecho nada.
//
// El detector NUNCA mueve la letra: solo pide re-identificar. Si el
// fingerprint reconfirma la misma canción, el falso positivo sale gratis
// (esa pasada además corrige la deriva).
//
// Todo el módulo es puro y determinista: recibe frames {at, level, bands} y
// devuelve estado nuevo + evento. La captura real vive en audio/monitor.ts.
// ============================================================================

/** Bandas del perfil espectral. Pocas y anchas: buscamos un cambio de timbre
 *  grosero, no una huella; con muchas bandas domina el ruido. */
export const BOUNDARY_BANDS = 8;

/** Nivel (0..1) por debajo del cual el frame cuenta como silencio.
 *  Alineado con SILENCE_PEAK de capture.ts y SILENCE_LEVEL de syncClock. */
export const BOUNDARY_SILENCE_LEVEL = 0.012;
/** Nivel al que se considera que la música VOLVIÓ. Más alto que el umbral de
 *  silencio a propósito (histéresis): sin esa banda muerta, un nivel oscilando
 *  justo en el borde emitiría cortes en cadena. */
export const BOUNDARY_RESUME_LEVEL = 0.03;
/** Silencio mínimo para que el hueco cuente como corte entre pistas. Por
 *  debajo de esto son pausas musicales (un breakdown, un golpe seco). */
export const BOUNDARY_GAP_MIN_MS = 320;

/** Nivel mínimo para que el perfil espectral signifique algo. En silencio el
 *  espectro es ruido de fondo y su "novedad" no dice nada. */
export const NOVELTY_MIN_LEVEL = 0.04;
/** Distancia coseno (0..1) entre el perfil rápido y el lento que cuenta como
 *  timbre distinto. */
export const NOVELTY_DISTANCE = 0.32;
/** La distancia tiene que SOSTENERSE esto para no confundir un cambio de tema
 *  con la entrada de un coro o un solo. */
export const NOVELTY_HOLD_MS = 1100;
/** Audio acumulado antes de que el perfil lento sea una referencia creíble. */
export const NOVELTY_WARMUP_MS = 6000;

/** Tras un corte no se emite otro por este lapso: la re-identificación ya está
 *  en marcha y el arranque de la pista nueva es justo cuando el perfil lento
 *  todavía apunta a la anterior (se auto-dispararía en bucle). */
export const BOUNDARY_REFRACTORY_MS = 8000;

/** Constante de tiempo del perfil "de ahora". */
export const FAST_TAU_MS = 400;
/** Constante de tiempo del perfil "de la canción que venía sonando". */
export const SLOW_TAU_MS = 6000;

export type BoundaryKind = 'gap' | 'novelty';

/** Un frame de audio ya reducido: nivel de pico y energía por banda. */
export interface AudioFrame {
  /** Reloj de pared (ms). */
  at: number;
  /** Pico de amplitud del frame (0..1). */
  level: number;
  /** Energía por banda, sin normalizar. Vacío = sin análisis espectral. */
  bands: number[];
}

export interface TrackChangeState {
  /** Instante en que empezó el silencio en curso (null = hay señal). */
  silentSince: number | null;
  lastFrameAt: number | null;
  /** Perfil espectral normalizado reciente (null hasta el primer frame útil). */
  fast: number[] | null;
  /** Perfil espectral normalizado de la canción en curso. */
  slow: number[] | null;
  /** Audio con señal acumulado: calienta el perfil lento. */
  voicedMs: number;
  /** Instante en que la distancia espectral superó el umbral (null = no). */
  noveltySince: number | null;
  /** Último corte emitido: base del periodo refractario. */
  lastBoundaryAt: number;
}

export interface TrackChangeConfig {
  silenceLevel: number;
  resumeLevel: number;
  gapMinMs: number;
  noveltyMinLevel: number;
  noveltyDistance: number;
  noveltyHoldMs: number;
  noveltyWarmupMs: number;
  refractoryMs: number;
  fastTauMs: number;
  slowTauMs: number;
}

export const DEFAULT_TRACK_CHANGE_CONFIG: TrackChangeConfig = {
  silenceLevel: BOUNDARY_SILENCE_LEVEL,
  resumeLevel: BOUNDARY_RESUME_LEVEL,
  gapMinMs: BOUNDARY_GAP_MIN_MS,
  noveltyMinLevel: NOVELTY_MIN_LEVEL,
  noveltyDistance: NOVELTY_DISTANCE,
  noveltyHoldMs: NOVELTY_HOLD_MS,
  noveltyWarmupMs: NOVELTY_WARMUP_MS,
  refractoryMs: BOUNDARY_REFRACTORY_MS,
  fastTauMs: FAST_TAU_MS,
  slowTauMs: SLOW_TAU_MS,
};

export function createTrackChangeState(): TrackChangeState {
  return {
    silentSince: null,
    lastFrameAt: null,
    fast: null,
    slow: null,
    voicedMs: 0,
    noveltySince: null,
    lastBoundaryAt: Number.NEGATIVE_INFINITY,
  };
}

/** Perfil normalizado (suma 1). Devuelve null si el frame no tiene energía. */
export function normalizeProfile(bands: number[]): number[] | null {
  let total = 0;
  for (const b of bands) total += Math.max(0, b);
  if (!(total > 0)) return null;
  return bands.map((b) => Math.max(0, b) / total);
}

/**
 * Distancia coseno (0..1) entre dos perfiles normalizados. 0 = mismo timbre,
 * 1 = sin nada en común. Se usa coseno y no diferencia absoluta porque nos
 * interesa el REPARTO de energía entre bandas, no el volumen: subir el
 * volumen de la misma canción no debe contar como cambio de tema.
 */
export function profileDistance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na <= 0 || nb <= 0) return 0;
  const cos = dot / Math.sqrt(na * nb);
  return Math.max(0, Math.min(1, 1 - cos));
}

/** Coeficiente de una media exponencial con paso de tiempo irregular. */
function emaAlpha(dtMs: number, tauMs: number): number {
  if (tauMs <= 0) return 1;
  return 1 - Math.exp(-Math.max(0, dtMs) / tauMs);
}

function blend(prev: number[] | null, next: number[], alpha: number): number[] {
  if (!prev) return [...next];
  return next.map((v, i) => {
    const p = prev[i] ?? v;
    return p + (v - p) * alpha;
  });
}

/**
 * Consume un frame y decide si acaba de ocurrir un corte de pista.
 *
 * Devuelve SIEMPRE el estado nuevo (no muta el recibido) y el corte detectado,
 * o null si no hubo. El orden importa: el hueco de silencio se evalúa primero
 * porque un corte con hueco también dispara novedad espectral, y queremos
 * reportar la señal fuerte ('gap'), no la débil.
 */
export function feedTrackChangeFrame(
  state: TrackChangeState,
  frame: AudioFrame,
  config: TrackChangeConfig = DEFAULT_TRACK_CHANGE_CONFIG,
): { state: TrackChangeState; boundary: BoundaryKind | null } {
  const dt = state.lastFrameAt == null ? 0 : Math.max(0, frame.at - state.lastFrameAt);
  const next: TrackChangeState = { ...state, lastFrameAt: frame.at };
  const refractory = frame.at - state.lastBoundaryAt < config.refractoryMs;

  // ---- Hueco de silencio ---------------------------------------------------
  let boundary: BoundaryKind | null = null;
  if (frame.level < config.silenceLevel) {
    if (next.silentSince == null) next.silentSince = frame.at;
  } else if (frame.level >= config.resumeLevel) {
    const silentSince = next.silentSince;
    next.silentSince = null;
    if (silentSince != null && frame.at - silentSince >= config.gapMinMs && !refractory) {
      boundary = 'gap';
    }
  }
  // Entre silenceLevel y resumeLevel: zona muerta, no se toca `silentSince`.

  // ---- Perfil espectral ----------------------------------------------------
  const profile = frame.level >= config.noveltyMinLevel ? normalizeProfile(frame.bands) : null;
  if (profile) {
    next.fast = blend(next.fast, profile, emaAlpha(dt, config.fastTauMs));
    next.slow = blend(next.slow, profile, emaAlpha(dt, config.slowTauMs));
    next.voicedMs = state.voicedMs + dt;
  }

  if (boundary) {
    // Tras un hueco, el perfil "de la canción en curso" es historia: se re-ancla
    // al de ahora y se reinicia el calentamiento para que el arranque de la
    // pista nueva no dispare además una novedad espectral.
    next.slow = next.fast ? [...next.fast] : null;
    next.voicedMs = 0;
    next.noveltySince = null;
    next.lastBoundaryAt = frame.at;
    return { state: next, boundary };
  }

  // ---- Novedad espectral sostenida ----------------------------------------
  if (!next.fast || !next.slow || next.voicedMs < config.noveltyWarmupMs) {
    next.noveltySince = null;
    return { state: next, boundary: null };
  }

  const distance = profileDistance(next.fast, next.slow);
  if (distance < config.noveltyDistance) {
    next.noveltySince = null;
    return { state: next, boundary: null };
  }

  if (next.noveltySince == null) next.noveltySince = frame.at;
  if (frame.at - next.noveltySince < config.noveltyHoldMs || refractory) {
    return { state: next, boundary: null };
  }

  next.slow = [...next.fast];
  next.voicedMs = 0;
  next.noveltySince = null;
  next.lastBoundaryAt = frame.at;
  return { state: next, boundary: 'novelty' };
}
