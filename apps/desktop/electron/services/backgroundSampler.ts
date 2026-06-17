// ============================================================================
// backgroundSampler.ts — muestrea la luminancia del fondo detrás del widget.
//
// El widget es transparente; para que la letra SIEMPRE se lea (sobre cualquier
// fondo) sin una caja/scrim opaca, medimos qué tan claro/oscuro está el área
// detrás de la ventana y lo reportamos al renderer. El renderer elige texto
// NEGRO (fondos claros) o BLANCO (fondos oscuros) + halo del color opuesto.
//
// Cómo: capturamos un thumbnail pequeño de la pantalla con desktopCapturer
// (API estándar de Electron, funciona en Windows y WSLg) y promediamos la
// luminancia de sus píxeles. ~2 Hz es suficiente y barato (un thumbnail 160x90
// son ~14k píxeles; iterar cuesta <2 ms).
// ============================================================================

import { BrowserWindow, desktopCapturer, screen } from 'electron';

/** Umbral por encima del cual el fondo se considera "claro" (→ texto negro). */
export const LIGHT_THRESHOLD = 0.55;
/** Tamaño del thumbnail que pedimos a desktopCapturer (chico = rápido). */
const THUMBNAIL_W = 160;
const THUMBNAIL_H = 90;
/** Intervalo de muestreo. 2 Hz: balance entre responsividad y CPU/GPU. */
const SAMPLE_INTERVAL_MS = 500;
/** Factor de suavizado exponencial (EMA): evita parpadeo en bordes mezclados. */
const EMA_ALPHA = 0.35;

/**
 * Luminancia media (0..1) de un bitmap RGBA. Recorre todos los píxeles y
 * promedia (0.299·R + 0.587·G + 0.114·B)/255 (BT.601). Función pura (testeable).
 */
export function computeLuminance(rgba: Uint8Array): number {
  if (rgba.length < 4) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    // Ignoramos el alpha: lo que importa es el color del píxel, no su opacidad.
    sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    count++;
  }
  if (count === 0) return 0;
  return sum / (count * 255);
}

/** Clasifica una luminancia en 'light' (texto oscuro) o 'dark' (texto claro). */
export function classifyBackground(luminance: number): 'light' | 'dark' {
  return luminance > LIGHT_THRESHOLD ? 'light' : 'dark';
}

/**
 * Muestrea la luminancia detrás del widget y la emite por IPC al renderer.
 * Defensivo: si desktopCapturer falla (headless, sin display, sandbox raro),
 * queda en silencio y el renderer usa su default (texto blanco + halo).
 */
export class BackgroundSampler {
  private window: BrowserWindow;
  private timer: NodeJS.Timeout | null = null;
  private ema: number | null = null;
  /** Emite `value` solo si cambió de clasificación o varió >delta desde el último reporte. */
  private lastReported: number | null = null;
  private readonly reportDelta = 0.06;

  constructor(window: BrowserWindow) {
    this.window = window;
  }

  start(): void {
    if (this.timer) return;
    // Primer sample sin esperar el intervalo (el fondo se sabe cuanto antes).
    void this.tick();
    this.timer = setInterval(() => void this.tick(), SAMPLE_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    try {
      if (this.window.isDestroyed() || !this.window.isVisible()) return;

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: THUMBNAIL_W, height: THUMBNAIL_H },
        fetchWindowIcons: false,
      });
      // El monitor donde está el widget. `source.display_id` correlaciona con
      // `screen.getAllDisplays()[i].id`; si viene undefined (bug en algunos
      // Windows), emparejamos por índice o caemos al primero.
      const displays = screen.getAllDisplays();
      const winBounds = this.window.getBounds();
      const cx = winBounds.x + winBounds.width / 2;
      const cy = winBounds.y + winBounds.height / 2;
      const targetDisplay =
        displays.find(
          (d) =>
            cx >= d.bounds.x &&
            cx < d.bounds.x + d.bounds.width &&
            cy >= d.bounds.y &&
            cy < d.bounds.y + d.bounds.height,
        ) ?? displays[0];
      // display_id es string; Display.id es number → comparamos como string.
      const targetId = targetDisplay ? String(targetDisplay.id) : undefined;
      const source =
        (targetId && sources.find((s) => s.display_id === targetId)) ?? sources[0];
      if (!source) return;

      const bitmap = source.thumbnail.toBitmap(); // Uint8Array RGBA
      const luminance = computeLuminance(bitmap);

      // Suavizado EMA: amortigua saltos por bordes mezclados / animaciones de fondo.
      this.ema = this.ema === null ? luminance : this.ema + EMA_ALPHA * (luminance - this.ema);

      // Solo reportamos si hay cambio significativo o cruce de umbral (evita
      // spamear el renderer con el mismo valor 2 veces por segundo).
      if (this.shouldReport(this.ema)) {
        this.lastReported = this.ema;
        this.emit(Math.max(0, Math.min(1, this.ema)));
      }
    } catch {
      // Silencioso: el renderer ya tiene un default seguro (texto blanco + halo).
    }
  }

  private shouldReport(value: number): boolean {
    if (this.lastReported === null) return true;
    // Cambio de clasificación (cruce de umbral) siempre se reporta.
    if (classifyBackground(value) !== classifyBackground(this.lastReported)) return true;
    return Math.abs(value - this.lastReported) >= this.reportDelta;
  }

  private emit(value: number): void {
    if (this.window.isDestroyed()) return;
    this.window.webContents.send('background:luminance', value);
  }
}
