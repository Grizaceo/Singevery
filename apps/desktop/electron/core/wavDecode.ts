// ============================================================================
// wavDecode.ts — lector mínimo de WAV PCM en el proceso main.
//
// El renderer manda los chunks como WAV 16 kHz mono PCM16 (src/audio/wav.ts).
// Hasta ahora esos bytes solo viajaban al reconocedor; para el análisis de
// energía vocal hace falta abrirlos, y en el main no hay Web Audio.
//
// Es un lector deliberadamente estrecho: recorre los chunks RIFF buscando
// "fmt " y "data" (no asume offsets fijos: algunos codificadores meten chunks
// LIST/fact en medio) y solo entiende PCM entero de 8/16/24/32 bits o float32.
// Cualquier cosa rara devuelve null en vez de lanzar: esto corre en el camino
// del reconocimiento y no puede tumbarlo.
// ============================================================================

export interface DecodedWav {
  samples: Float32Array;
  sampleRate: number;
  channels: number;
}

const FORMAT_PCM = 1;
const FORMAT_FLOAT = 3;
const FORMAT_EXTENSIBLE = 0xfffe;

function readTag(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/**
 * Decodifica un WAV a muestras float mono en -1..1. Si trae varios canales los
 * promedia. Devuelve null si el buffer no es un WAV PCM legible.
 */
export function decodeWav(input: ArrayBuffer | Uint8Array | Buffer): DecodedWav | null {
  const bytes =
    input instanceof Uint8Array ? input : new Uint8Array(input as ArrayBuffer);
  if (bytes.byteLength < 44) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    if (readTag(view, 0) !== 'RIFF' || readTag(view, 8) !== 'WAVE') return null;

    let format = 0;
    let channels = 0;
    let sampleRate = 0;
    let bitsPerSample = 0;
    let dataStart = -1;
    let dataLength = 0;

    let offset = 12;
    while (offset + 8 <= view.byteLength) {
      const tag = readTag(view, offset);
      const size = view.getUint32(offset + 4, true);
      const body = offset + 8;
      if (tag === 'fmt ' && body + 16 <= view.byteLength) {
        format = view.getUint16(body, true);
        channels = view.getUint16(body + 2, true);
        sampleRate = view.getUint32(body + 4, true);
        bitsPerSample = view.getUint16(body + 14, true);
      } else if (tag === 'data') {
        dataStart = body;
        // Algunos encoders escriben un tamaño mayor que el archivo (streaming):
        // se recorta a lo que realmente hay.
        dataLength = Math.min(size, view.byteLength - body);
      }
      // Los chunks se alinean a 2 bytes.
      offset = body + size + (size % 2);
      if (dataStart >= 0 && format !== 0) break;
    }

    if (dataStart < 0 || channels < 1 || sampleRate < 1 || dataLength <= 0) return null;

    const isFloat = format === FORMAT_FLOAT || (format === FORMAT_EXTENSIBLE && bitsPerSample === 32);
    if (format !== FORMAT_PCM && format !== FORMAT_FLOAT && format !== FORMAT_EXTENSIBLE) return null;

    const bytesPerSample = bitsPerSample / 8;
    if (!Number.isInteger(bytesPerSample) || bytesPerSample < 1 || bytesPerSample > 4) return null;

    const frames = Math.floor(dataLength / (bytesPerSample * channels));
    if (frames <= 0) return null;

    const samples = new Float32Array(frames);
    for (let frame = 0; frame < frames; frame += 1) {
      let sum = 0;
      for (let ch = 0; ch < channels; ch += 1) {
        const at = dataStart + (frame * channels + ch) * bytesPerSample;
        sum += readSample(view, at, bitsPerSample, isFloat);
      }
      samples[frame] = sum / channels;
    }
    return { samples, sampleRate, channels };
  } catch {
    // Buffer truncado o cabecera corrupta: no hay análisis, y punto.
    return null;
  }
}

/** Una muestra normalizada a -1..1 según su profundidad de bits. */
function readSample(view: DataView, at: number, bitsPerSample: number, isFloat: boolean): number {
  if (isFloat) return view.getFloat32(at, true);
  switch (bitsPerSample) {
    case 8:
      // PCM de 8 bits es SIN signo, con el cero en 128.
      return (view.getUint8(at) - 128) / 128;
    case 16:
      return view.getInt16(at, true) / 32768;
    case 24: {
      const b0 = view.getUint8(at);
      const b1 = view.getUint8(at + 1);
      const b2 = view.getUint8(at + 2);
      let value = (b2 << 16) | (b1 << 8) | b0;
      if (value & 0x800000) value |= ~0xffffff; // extensión de signo
      return value / 8388608;
    }
    case 32:
      return view.getInt32(at, true) / 2147483648;
    default:
      return 0;
  }
}
