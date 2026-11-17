// ============================================================================
// autoGhost.ts — intangible automático por inactividad.
// Si el usuario no toca el HUD durante un rato, el widget pasa a modo fantasma
// solo (deja pasar los clics) para no estorbar. Preferencias en localStorage,
// mismo patrón que widgetPrefs.ts. Lógica pura y testeable: el temporizador
// acepta schedule/cancel inyectables.
// ============================================================================

export interface AutoGhostPrefs {
  enabled: boolean;
  /** Segundos de inactividad antes de pasar a fantasma. */
  idleSeconds: number;
}

export const AUTO_GHOST_KEY = 'espejo.widget.autoGhost';

export const AUTO_GHOST_OPTIONS_S = [15, 30, 60, 120, 300] as const;

export const DEFAULT_AUTO_GHOST: AutoGhostPrefs = { enabled: true, idleSeconds: 60 };

function nearestIdleOption(seconds: number): number {
  let best: number = AUTO_GHOST_OPTIONS_S[0];
  let bestDist = Math.abs(seconds - best);
  for (const option of AUTO_GHOST_OPTIONS_S) {
    const dist = Math.abs(seconds - option);
    if (dist < bestDist) {
      best = option;
      bestDist = dist;
    }
  }
  return best;
}

export function readAutoGhostPrefs(): AutoGhostPrefs {
  try {
    const raw = localStorage.getItem(AUTO_GHOST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AutoGhostPrefs>;
      const enabled =
        typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_AUTO_GHOST.enabled;
      const idleSeconds =
        typeof parsed.idleSeconds === 'number' && Number.isFinite(parsed.idleSeconds)
          ? nearestIdleOption(parsed.idleSeconds)
          : DEFAULT_AUTO_GHOST.idleSeconds;
      return { enabled, idleSeconds };
    }
  } catch {
    /* ídem widgetPrefs: si el almacenamiento falla, defaults */
  }
  return DEFAULT_AUTO_GHOST;
}

export function writeAutoGhostPrefs(prefs: AutoGhostPrefs): void {
  try {
    localStorage.setItem(AUTO_GHOST_KEY, JSON.stringify(prefs));
  } catch {
    /* ídem */
  }
}

/**
 * El intangible automático solo aplica cuando el widget está "desocupado":
 * sin píldora, sin modo tangible forzado, sin paneles abiertos y sin fantasma
 * ya activo (en fantasma no hay nada que temporizar).
 */
export function autoGhostEligible(s: {
  collapsed: boolean;
  tangible: boolean;
  settingsOpen: boolean;
  welcomeOpen: boolean;
  manualSearchOpen: boolean;
  ghost: boolean;
}): boolean {
  return !(s.collapsed || s.tangible || s.settingsOpen || s.welcomeOpen || s.manualSearchOpen || s.ghost);
}

/**
 * Qué eventos cuentan como "el usuario tocó el HUD" para el temporizador.
 * Los mousemove/pointermove solo cuentan cuando la ventana NO es click-through:
 * con la ventana atravesable el movimiento es reenviado por el SO aunque el
 * cursor solo esté pasando camino a otra app, y no debe reiniciar la cuenta.
 */
export function isHudActivity(eventType: string, clickThrough: boolean): boolean {
  switch (eventType) {
    case 'pointerdown':
    case 'mousedown':
    case 'wheel':
    case 'keydown':
    case 'contextmenu':
      return true;
    case 'pointermove':
    case 'mousemove':
      return !clickThrough;
    default:
      return false;
  }
}

type TimerHandle = ReturnType<typeof setTimeout>;
type ScheduleFn = (fn: () => void, ms: number) => TimerHandle;
type CancelFn = (handle: TimerHandle) => void;

/**
 * Cuenta atrás de inactividad. Dispara UNA vez por período: tras disparar no
 * rearma hasta que haya actividad (activity) o un update que lo desarme y
 * rearme desde no-elegible/deshabilitado.
 */
export class AutoGhostTimer {
  private timer: TimerHandle | null = null;
  private want = false;
  private fired = false;
  private idleMs = 0;
  private readonly onFire: () => void;
  private readonly schedule: ScheduleFn;
  private readonly cancel: CancelFn;

  constructor(
    onFire: () => void,
    schedule: ScheduleFn = (fn, ms) => setTimeout(fn, ms),
    cancel: CancelFn = (handle) => clearTimeout(handle),
  ) {
    this.onFire = onFire;
    this.schedule = schedule;
    this.cancel = cancel;
  }

  update(config: { enabled: boolean; idleMs: number; eligible: boolean }): void {
    const prevIdleMs = this.idleMs;
    this.want = config.enabled && config.eligible;
    this.idleMs = config.idleMs;
    if (!this.want) {
      this.clear();
      // Al desarmarse el período termina: si vuelve a ser elegible, cuenta de cero.
      this.fired = false;
      return;
    }
    if (this.fired) return; // ya disparó en este período de inactividad
    if (this.timer != null && prevIdleMs === this.idleMs) return; // ya armado igual
    this.clear();
    this.arm();
  }

  /** Actividad del usuario: reinicia la cuenta si está armado; si ya disparó,
   *  rearma (el período nuevo empieza ahora). */
  activity(): void {
    if (!this.want) return;
    if (this.timer != null) {
      this.clear();
      this.arm();
    } else if (this.fired) {
      this.fired = false;
      this.arm();
    }
  }

  dispose(): void {
    this.want = false;
    this.clear();
  }

  private arm(): void {
    const ms = this.idleMs;
    this.timer = this.schedule(() => {
      this.timer = null;
      this.fired = true;
      this.onFire();
    }, ms);
  }

  private clear(): void {
    if (this.timer != null) {
      this.cancel(this.timer);
      this.timer = null;
    }
  }
}
