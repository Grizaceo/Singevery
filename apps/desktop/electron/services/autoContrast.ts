// ============================================================================
// autoContrast.ts — muestreo periódico del fondo bajo el widget para elegir
// texto claro u oscuro según la luminancia (modo auto-contraste).
//
// EXPERIMENTAL: la captura de pantalla (desktopCapturer) puede producir un
// ligero tirón/parpadeo en el compositor de Windows en cada muestra. Se
// mitiga espaciando las capturas y usando miniaturas pequeñas, pero no se
// puede eliminar del todo sin dejar de mirar el fondo.
// ============================================================================

import { BrowserWindow, desktopCapturer, screen } from 'electron';
import type { DisplayStore } from './settings';
import type { StateStore } from '../core/stateStore';

const SAMPLE_INTERVAL_MS = 3000;
const THUMBNAIL_WIDTH = 240;
/** Fondo claro si luminancia > HIGH; vuelve a oscuro si < LOW (hysteresis). */
const LUMINANCE_HIGH = 0.55;
const LUMINANCE_LOW = 0.4;
const MAX_CAPTURE_FAILURES = 3;

export const AUTO_LIGHT_TEXT = '#ffffff';
export const AUTO_DARK_TEXT = '#111114';

/** El color del usuario se conserva en modo auto si da contraste suficiente. */
const USER_COLOR_MIN_LUM_ON_DARK = 0.45;
const USER_COLOR_MAX_LUM_ON_LIGHT = 0.4;

const isDev = process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER_URL;

/** Luminancia relativa sRGB (0..1). */
function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Luminancia relativa de un color hex #rrggbb (0..1). */
function hexLuminance(hex: string): number {
  const match = hex.match(/^#([0-9a-fA-F]{6})$/);
  if (!match) return 1;
  const n = parseInt(match[1], 16);
  return relativeLuminance(((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255);
}

/**
 * Captura una miniatura del display donde vive el widget y devuelve la
 * luminancia media de la franja central de la ventana (donde está la letra).
 * El widget en sí está excluido de la captura vía setContentProtection.
 */
async function sampleWindowRegionLuminance(win: BrowserWindow): Promise<number> {
  const bounds = win.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const db = display.bounds;
  const requestedH = Math.max(1, Math.round(THUMBNAIL_WIDTH * (db.height / db.width)));

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: THUMBNAIL_WIDTH, height: requestedH },
  });

  const displayId = String(display.id);
  const source =
    sources.find((s) => s.display_id === displayId) ??
    sources.find((s) => s.id.startsWith('screen:')) ??
    sources[0];

  if (!source?.thumbnail || source.thumbnail.isEmpty()) {
    throw new Error('No se pudo capturar miniatura de pantalla');
  }

  // El thumbnail real puede diferir del tamaño pedido (Electron lo ajusta a
  // la proporción del display): usar SIEMPRE sus dimensiones reales.
  const thumb = source.thumbnail.getSize();
  const scaleX = thumb.width / db.width;
  const scaleY = thumb.height / db.height;

  // Franja central de la ventana (donde se dibuja la letra): recorta 20%
  // por lado horizontal y 25% arriba/abajo para no diluir la medición con
  // los márgenes del widget.
  const insetX = bounds.width * 0.2;
  const insetY = bounds.height * 0.25;
  const regionX = bounds.x - db.x + insetX;
  const regionY = bounds.y - db.y + insetY;
  const regionW = bounds.width - insetX * 2;
  const regionH = bounds.height - insetY * 2;

  const cropX = Math.min(thumb.width - 1, Math.max(0, Math.round(regionX * scaleX)));
  const cropY = Math.min(thumb.height - 1, Math.max(0, Math.round(regionY * scaleY)));
  const cropW = Math.max(1, Math.min(thumb.width - cropX, Math.round(regionW * scaleX)));
  const cropH = Math.max(1, Math.min(thumb.height - cropY, Math.round(regionH * scaleY)));

  const cropped = source.thumbnail.crop({ x: cropX, y: cropY, width: cropW, height: cropH });
  const size = cropped.getSize();
  if (size.width <= 0 || size.height <= 0) {
    throw new Error('Región de captura inválida');
  }

  // toBitmap devuelve BGRA.
  const bitmap = cropped.toBitmap();
  let sum = 0;
  let count = 0;
  for (let i = 0; i + 3 < bitmap.length; i += 4) {
    sum += relativeLuminance(bitmap[i + 2] / 255, bitmap[i + 1] / 255, bitmap[i] / 255);
    count++;
  }
  if (count === 0) throw new Error('Miniatura sin píxeles');
  return sum / count;
}

export class AutoContrastService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private currentIsLightBg: boolean | null = null;
  private lastEmittedColor: string | null = null;
  private captureFailures = 0;

  constructor(
    private getWindow: () => BrowserWindow | null,
    private displayStore: DisplayStore,
    private stateStore: StateStore,
  ) {}

  /** Arranca o detiene según textColorMode en ajustes. */
  sync(): void {
    if (this.displayStore.get().textColorMode === 'auto') {
      this.start();
      // Si el usuario cambió su color preferido con el modo auto ya activo,
      // re-resuelve al instante sin esperar la próxima captura.
      if (this.currentIsLightBg !== null) {
        this.emitColor(this.currentIsLightBg);
      }
    } else {
      this.stop();
    }
  }

  dispose(): void {
    this.stop();
  }

  /**
   * Elige el color efectivo: conserva el color preferido del usuario si da
   * contraste suficiente contra el fondo; si no, cae a blanco/oscuro puros.
   */
  private pickColor(isLightBg: boolean): string {
    const userColor = this.displayStore.get().textColor;
    const lum = hexLuminance(userColor);
    if (isLightBg) {
      return lum <= USER_COLOR_MAX_LUM_ON_LIGHT ? userColor : AUTO_DARK_TEXT;
    }
    return lum >= USER_COLOR_MIN_LUM_ON_DARK ? userColor : AUTO_LIGHT_TEXT;
  }

  private emitColor(isLightBg: boolean): void {
    const color = this.pickColor(isLightBg);
    if (color !== this.lastEmittedColor || isLightBg !== this.currentIsLightBg) {
      this.lastEmittedColor = color;
      this.stateStore.setAutoContrast(color, isLightBg);
    }
  }

  private start(): void {
    const win = this.getWindow();
    if (win && !win.isDestroyed()) {
      win.setContentProtection(true);
    }
    if (this.timer) return;
    if (isDev) console.log('[autoContrast] activado');
    void this.tick();
    this.timer = setInterval(() => void this.tick(), SAMPLE_INTERVAL_MS);
  }

  private stop(): void {
    const win = this.getWindow();
    if (win && !win.isDestroyed()) {
      win.setContentProtection(false);
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      if (isDev) console.log('[autoContrast] desactivado');
    }
    this.ticking = false;
    this.currentIsLightBg = null;
    this.lastEmittedColor = null;
    this.captureFailures = 0;
    this.stateStore.clearAutoContrast();
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const win = this.getWindow();
      if (!win || win.isDestroyed() || !win.isVisible()) return;
      if (this.displayStore.get().textColorMode !== 'auto') {
        this.stop();
        return;
      }

      const luminance = await sampleWindowRegionLuminance(win);
      this.captureFailures = 0;

      let isLightBg: boolean;
      if (this.currentIsLightBg === null) {
        isLightBg = luminance >= 0.5;
      } else if (this.currentIsLightBg) {
        isLightBg = luminance >= LUMINANCE_LOW;
      } else {
        isLightBg = luminance > LUMINANCE_HIGH;
      }

      if (isDev) {
        console.log(
          `[autoContrast] lum=${luminance.toFixed(3)} fondo=${isLightBg ? 'claro' : 'oscuro'} texto=${this.pickColor(isLightBg)}`,
        );
      }
      this.emitColor(isLightBg);
      this.currentIsLightBg = isLightBg;
    } catch (err) {
      this.captureFailures++;
      console.warn('[autoContrast] error de captura:', err);
      if (this.captureFailures >= MAX_CAPTURE_FAILURES) {
        console.warn('[autoContrast] demasiados fallos; volviendo a color manual');
        this.displayStore.set({ textColorMode: 'manual' });
        this.stop();
      }
    } finally {
      this.ticking = false;
    }
  }
}
