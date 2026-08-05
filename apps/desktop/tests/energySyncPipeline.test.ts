// Pipeline P4 de punta a punta: WAV real → máscara vocal → correlación →
// decisión de corregir o no. Se apoya en audio sintético, así que corre en el
// sandbox sin tarjeta de sonido.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: class {},
  app: { getPath: () => '/tmp' },
}));

import { StateStore } from '../electron/core/stateStore';
import { decodeWav } from '../electron/core/wavDecode';
import { ENERGY_SYNC_MIN_CONFIDENCE } from '../electron/core/energySync';
import type { TimedLyrics } from '../src/types';

const SAMPLE_RATE = 16_000;

/** WAV PCM16 mono, igual formato que el que manda el renderer. */
function encodeWav(samples: Float32Array, sampleRate = SAMPLE_RATE): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const tag = (at: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(at + i, text.charCodeAt(i));
  };
  tag(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }
  return buffer;
}

function tone(freq: number, ms: number, amp = 0.8): Float32Array {
  const n = Math.round((SAMPLE_RATE * ms) / 1000);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
  return out;
}

function concat(chunks: Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((s, c) => s + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** 900 Hz = banda vocal; 60 Hz = bajo (sin voz). Frases irregulares para que
 *  el pico de correlación sea único (nada de estribillo repetido). */
const VOICE_SEGMENTS: Array<[number, number]> = [
  [1000, 4000],
  [4600, 6000],
  [8000, 12000],
];

function buildAudio(): ArrayBuffer {
  const chunks: Float32Array[] = [];
  let cursor = 0;
  for (const [from, to] of VOICE_SEGMENTS) {
    if (from > cursor) chunks.push(tone(60, from - cursor));
    chunks.push(tone(900, to - from));
    cursor = to;
  }
  return encodeWav(concat(chunks));
}

/** Letra cuyas líneas van `aheadMs` ADELANTADAS respecto del audio. */
function buildLyrics(aheadMs: number): TimedLyrics {
  return {
    source: 'lrclib',
    synced: true,
    lines: VOICE_SEGMENTS.map(([from, to]) => ({
      start_ms: from - aheadMs,
      end_ms: to - aheadMs,
      text: 'linea',
    })),
  };
}

describe('decodeWav', () => {
  it('lee el WAV PCM16 mono que produce el renderer', () => {
    const samples = tone(440, 100);
    const decoded = decodeWav(encodeWav(samples));
    expect(decoded).not.toBeNull();
    expect(decoded!.sampleRate).toBe(SAMPLE_RATE);
    expect(decoded!.channels).toBe(1);
    expect(decoded!.samples.length).toBe(samples.length);
    // PCM16 pierde precisión, pero la forma se conserva.
    expect(decoded!.samples[10]).toBeCloseTo(samples[10], 3);
  });

  it('acepta un Buffer de Node igual que un ArrayBuffer', () => {
    const wav = encodeWav(tone(440, 50));
    expect(decodeWav(Buffer.from(wav))).not.toBeNull();
  });

  it('devuelve null (no lanza) con basura', () => {
    expect(decodeWav(new ArrayBuffer(10))).toBeNull();
    expect(decodeWav(new Uint8Array(200))).toBeNull();
    expect(decodeWav(Buffer.from('esto no es un wav en absoluto, para nada'))).toBeNull();
  });

  it('sobrevive a un WAV truncado a mitad de los datos', () => {
    const full = new Uint8Array(encodeWav(tone(440, 200)));
    const decoded = decodeWav(full.slice(0, full.length / 2));
    expect(decoded).not.toBeNull();
    expect(decoded!.samples.length).toBeGreaterThan(0);
  });
});

describe('StateStore.reportAudioWindow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function storeWithLyrics(aheadMs: number): StateStore {
    const store = new StateStore(null);
    const now = Date.now();
    store.setImportedLyrics(buildLyrics(aheadMs), 'Tema', 'Artista', 0, now);
    return store;
  }

  it('mide que la letra va adelantada y NO corrige en modo observación', () => {
    const store = storeWithLyrics(1000);
    const before = store.getDisplayedPosition();

    const m = store.reportAudioWindow(buildAudio(), Date.now());

    expect(m).not.toBeNull();
    expect(m!.offsetMs).toBeLessThan(0); // hay que atrasar la letra
    expect(Math.abs(m!.offsetMs + 1000)).toBeLessThanOrEqual(400); // ±2 bins
    expect(m!.confidence).toBeGreaterThan(ENERGY_SYNC_MIN_CONFIDENCE);
    // Apagado por defecto: mide pero no toca el reloj.
    expect(m!.applied).toBe(false);
    expect(m!.skipped).toContain('observación');
    expect(store.getDisplayedPosition()).toBe(before);
  });

  it('con la corrección encendida sí mueve el reloj', () => {
    const store = storeWithLyrics(1000);
    store.setEnergySyncEnabled(true);

    const m = store.reportAudioWindow(buildAudio(), Date.now());
    expect(m!.applied).toBe(true);
    expect(m!.skipped).toBeUndefined();

    // La corrección entra por rampa: la posición se va acomodando.
    const start = store.getDisplayedPosition();
    vi.setSystemTime(Date.now() + 3000);
    expect(store.getDisplayedPosition()).toBeLessThan(start + 3000);
  });

  it('la medición queda en el diagnóstico aunque no se aplique', () => {
    const store = storeWithLyrics(1000);
    store.reportAudioWindow(buildAudio(), Date.now());

    const energy = store.getDiagnostics().sync.energy;
    expect(energy).not.toBeNull();
    expect(energy!.applied).toBe(false);
    expect(energy!.bins).toBeGreaterThan(0);
    expect(energy!.windowStartMs).toBe(0);
  });

  it('con la letra ya alineada no propone corrección', () => {
    const store = storeWithLyrics(0);
    store.setEnergySyncEnabled(true);
    const m = store.reportAudioWindow(buildAudio(), Date.now());
    expect(m!.offsetMs).toBe(0);
    expect(m!.applied).toBe(false);
    expect(m!.skipped).toBe('ya alineado');
  });

  it('sin letra sincronizada no hay nada que medir', () => {
    const store = new StateStore(null);
    expect(store.reportAudioWindow(buildAudio(), Date.now())).toBeNull();

    store.setImportedLyrics(
      { source: 'x', synced: false, lines: [{ start_ms: 0, text: 'a' }] },
      'T',
      'A',
    );
    expect(store.reportAudioWindow(buildAudio(), Date.now())).toBeNull();
  });

  it('con el reloj en pausa no se mide (no está sonando)', () => {
    const store = storeWithLyrics(1000);
    store.pauseClock();
    expect(store.reportAudioWindow(buildAudio(), Date.now())).toBeNull();
  });

  it('audio sin voz (instrumental parejo) no produce medición', () => {
    const store = storeWithLyrics(1000);
    expect(store.reportAudioWindow(encodeWav(tone(60, 6000)), Date.now())).toBeNull();
  });

  it('un buffer corrupto no rompe el flujo de reconocimiento', () => {
    const store = storeWithLyrics(1000);
    expect(() => store.reportAudioWindow(new ArrayBuffer(16), Date.now())).not.toThrow();
    expect(store.reportAudioWindow(new ArrayBuffer(16), Date.now())).toBeNull();
  });

  it('una corrección descomunal se mide pero NO se aplica', () => {
    const store = storeWithLyrics(1000);
    store.setEnergySyncEnabled(true);
    // La letra dice que todo pasa 4.8 s antes: dentro del rango de búsqueda
    // pero muy por encima de lo que puede ser deriva real.
    store.setImportedLyrics(buildLyrics(4_800), 'Tema', 'Artista', 0, Date.now());
    const before = store.getDisplayedPosition();

    const m = store.reportAudioWindow(buildAudio(), Date.now());
    expect(m).not.toBeNull();
    expect(Math.abs(m!.offsetMs)).toBeGreaterThan(3000);
    expect(m!.applied).toBe(false);
    expect(m!.skipped).toContain('tope');
    expect(store.getDisplayedPosition()).toBe(before);
  });
});
