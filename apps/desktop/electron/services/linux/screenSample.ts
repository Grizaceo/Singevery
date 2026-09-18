// ============================================================================
// screenSample.ts — luminancia del fondo del widget en Wayland (auto-contraste).
//
// En Windows el auto-contraste captura la pantalla con desktopCapturer y el
// widget queda fuera de la captura gracias a setContentProtection. En Wayland
// ninguna de las dos cosas sirve:
//   - desktopCapturer pasa por el portal de ScreenCast y abre el selector de
//     pantalla en CADA muestra (cada 3 s);
//   - setContentProtection no existe en Linux: la captura incluiría la propia
//     letra, y el color elegido cambiaría la medición siguiente (texto blanco
//     sube la luminancia → texto oscuro → baja → blanco…: parpadeo).
// Aquí se captura con grim (wlr-screencopy: Hyprland, Sway…; sin diálogos) y
// se mide un ANILLO alrededor de la ventana, nunca su interior: el fondo que
// rodea la letra, sin realimentación del propio widget.
// ============================================================================

import { execFile } from 'child_process';
import type { Rect } from './hyprland';

/** Ancho del anillo que se mide alrededor de la ventana (px lógicos). */
export const RING_MARGIN_PX = 48;
/** Escala de la captura: 1/4 basta para una media y pesa ~100 KB. */
export const SAMPLE_SCALE = 0.25;

/** Luminancia relativa sRGB (0..1), la misma fórmula que autoContrast.ts. */
function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Decodifica un PPM binario (P6, maxval 255) como el que emite `grim -t ppm`. */
export function parsePpm(buf: Buffer): { width: number; height: number; pixels: Buffer } | null {
  // Cabecera: "P6" <ws> ancho <ws> alto <ws> maxval <un ws> datos.
  const header = /^P6\s+(\d+)\s+(\d+)\s+(\d+)\s/.exec(buf.subarray(0, 64).toString('latin1'));
  if (!header) return null;
  const width = Number(header[1]);
  const height = Number(header[2]);
  if (Number(header[3]) !== 255 || width <= 0 || height <= 0) return null;
  const pixels = buf.subarray(header[0].length);
  if (pixels.length < width * height * 3) return null;
  return { width, height, pixels };
}

/** Región a capturar: la ventana más el anillo, recortada al monitor. */
export function ringRegion(win: Rect, display: Rect, margin = RING_MARGIN_PX): Rect {
  const x0 = Math.max(display.x, win.x - margin);
  const y0 = Math.max(display.y, win.y - margin);
  const x1 = Math.min(display.x + display.width, win.x + win.width + margin);
  const y1 = Math.min(display.y + display.height, win.y + win.height + margin);
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

/**
 * Luminancia media de los píxeles de `region` que quedan FUERA de `inner`
 * (la ventana). Si la ventana tapa toda la región (pantalla completa), mide
 * la región entera: mejor una medición contaminada que ninguna.
 */
export function ringLuminance(
  image: { width: number; height: number; pixels: Buffer },
  region: Rect,
  inner: Rect,
): number {
  const sx = image.width / Math.max(1, region.width);
  const sy = image.height / Math.max(1, region.height);
  const ix0 = (inner.x - region.x) * sx;
  const iy0 = (inner.y - region.y) * sy;
  const ix1 = ix0 + inner.width * sx;
  const iy1 = iy0 + inner.height * sy;

  const measure = (skipInner: boolean): { sum: number; count: number } => {
    let sum = 0;
    let count = 0;
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        if (skipInner && x + 0.5 >= ix0 && x + 0.5 < ix1 && y + 0.5 >= iy0 && y + 0.5 < iy1) continue;
        const i = (y * image.width + x) * 3;
        sum += relativeLuminance(image.pixels[i] / 255, image.pixels[i + 1] / 255, image.pixels[i + 2] / 255);
        count++;
      }
    }
    return { sum, count };
  };

  let { sum, count } = measure(true);
  if (count === 0) ({ sum, count } = measure(false));
  if (count === 0) throw new Error('Captura sin píxeles');
  return sum / count;
}

export type GrimRunner = (args: string[]) => Promise<Buffer>;

const defaultRunner: GrimRunner = (args) =>
  new Promise((resolve, reject) => {
    execFile('grim', args, { encoding: 'buffer', timeout: 3000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout) =>
      err ? reject(err) : resolve(stdout),
    );
  });

/** Captura el anillo alrededor de `win` con grim y devuelve su luminancia media. */
export async function sampleSurroundingLuminance(
  win: Rect,
  display: Rect,
  run: GrimRunner = defaultRunner,
): Promise<number> {
  const region = ringRegion(win, display);
  if (region.width < 1 || region.height < 1) throw new Error('El widget está fuera del monitor');
  const geometry = `${region.x},${region.y} ${region.width}x${region.height}`;
  const image = parsePpm(await run(['-s', String(SAMPLE_SCALE), '-g', geometry, '-t', 'ppm', '-']));
  if (!image) throw new Error('grim devolvió una imagen ilegible');
  return ringLuminance(image, region, win);
}
