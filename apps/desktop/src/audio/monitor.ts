// ============================================================================
// monitor.ts — escucha CONTINUA del stream de captura (Web Audio, sin red).
//
// Antes el audio solo se miraba durante los 6s de grabación de cada ciclo
// (~30% del tiempo): el resto de la pausa de 12s la app estaba ciega. Eso
// tenía dos costes:
//   - un cambio de canción no se veía hasta la siguiente grabación;
//   - la pausa del reloj por silencio (reportLevel) llegaba tarde.
//
// El monitor engancha un AnalyserNode al stream que YA está abierto y lo
// muestrea a ~20 Hz. No consume el stream (es un tap de lectura) y no compite
// con el MediaRecorder: ambos cuelgan de los mismos tracks.
//
// Lo que sale de aquí: nivel (0..1) para el medidor + la pausa por silencio, y
// eventos de corte de pista (audio/trackChange.ts) para re-identificar YA.
// ============================================================================

import {
  BOUNDARY_BANDS,
  createTrackChangeState,
  feedTrackChangeFrame,
  type BoundaryKind,
  type TrackChangeConfig,
  type TrackChangeState,
} from './trackChange';

/** Periodo de muestreo del monitor. 50 ms basta para ver un hueco de ~320 ms
 *  con varios frames dentro y es despreciable en CPU. */
export const MONITOR_INTERVAL_MS = 50;

/** Techo del análisis espectral (Hz). Por encima casi no hay energía musical y
 *  las bandas se llenarían de ruido de codec. */
const SPECTRUM_MAX_HZ = 8000;

export interface AudioMonitorOptions {
  /** Nivel de pico del frame (0..1), a ~20 Hz. */
  onLevel?: (level: number) => void;
  /** Corte de pista detectado localmente. */
  onBoundary?: (kind: BoundaryKind) => void;
  intervalMs?: number;
  config?: TrackChangeConfig;
}

/**
 * Reparte los bins de la FFT en bandas log-espaciadas (el oído y la música
 * reparten energía en octavas, no linealmente: con bandas lineales las 7
 * primeras caerían todas sobre los graves). Función pura: devuelve el índice
 * de bin donde arranca cada banda, más el final.
 */
export function bandEdges(binCount: number, bands = BOUNDARY_BANDS): number[] {
  const first = 1; // el bin 0 es DC: no aporta timbre
  const last = Math.max(first + bands, binCount);
  const edges: number[] = [];
  for (let i = 0; i <= bands; i += 1) {
    const t = i / bands;
    edges.push(Math.round(first * Math.pow(last / first, t)));
  }
  // Bandas monótonas y no vacías aunque el rango sea corto.
  for (let i = 1; i < edges.length; i += 1) {
    if (edges[i] <= edges[i - 1]) edges[i] = edges[i - 1] + 1;
  }
  return edges;
}

/** Energía media por banda a partir del espectro (0..255 de getByteFrequencyData). */
export function bandEnergies(spectrum: Uint8Array, edges: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < edges.length - 1; i += 1) {
    const from = Math.min(edges[i], spectrum.length);
    const to = Math.min(edges[i + 1], spectrum.length);
    let sum = 0;
    let n = 0;
    for (let bin = from; bin < to; bin += 1) {
      sum += spectrum[bin];
      n += 1;
    }
    out.push(n > 0 ? sum / n / 255 : 0);
  }
  return out;
}

/**
 * Tap de lectura sobre un stream vivo. `close()` lo desmonta; el stream sigue
 * siendo del llamador (la sesión de captura), el monitor nunca lo detiene.
 */
export class AudioMonitor {
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private timer: number | null = null;
  private detector: TrackChangeState = createTrackChangeState();
  private readonly config?: TrackChangeConfig;
  private readonly onLevel?: (level: number) => void;
  private readonly onBoundary?: (kind: BoundaryKind) => void;

  constructor(stream: MediaStream, options: AudioMonitorOptions = {}) {
    this.onLevel = options.onLevel;
    this.onBoundary = options.onBoundary;
    this.config = options.config;

    const Ctx: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    try {
      const ctx = new Ctx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      // Un contexto suspendido devuelve ceros en vez de audio, y eso aquí no es
      // inocuo: el nivel alimenta la pausa por silencio del reloj, así que la
      // letra se congelaría sin que nada avise. Se pide reanudar, y `sample()`
      // no reporta nada mientras el contexto no esté corriendo.
      void ctx.resume().catch(() => {});
      this.ctx = ctx;
      this.source = source;
      this.analyser = analyser;
    } catch {
      // Sin monitor la app sigue funcionando: solo pierde la detección rápida.
      this.close();
      return;
    }

    const timeBuf = new Float32Array(this.analyser.fftSize);
    const freqBuf = new Uint8Array(this.analyser.frequencyBinCount);
    // Bins que cubren hasta SPECTRUM_MAX_HZ (el resto es ruido para esto).
    const nyquist = this.ctx.sampleRate / 2;
    const usableBins = Math.max(
      BOUNDARY_BANDS + 2,
      Math.min(freqBuf.length, Math.round((SPECTRUM_MAX_HZ / nyquist) * freqBuf.length)),
    );
    const edges = bandEdges(usableBins);

    this.timer = window.setInterval(() => {
      this.sample(timeBuf, freqBuf, edges);
    }, options.intervalMs ?? MONITOR_INTERVAL_MS);
  }

  /** true si el tap quedó montado (false = Web Audio no disponible). */
  get active(): boolean {
    return this.analyser != null;
  }

  // Los buffers llevan el genérico explícito: sin él TS los infiere sobre
  // ArrayBufferLike (que admite SharedArrayBuffer) y las APIs del AnalyserNode
  // exigen ArrayBuffer.
  private sample(
    timeBuf: Float32Array<ArrayBuffer>,
    freqBuf: Uint8Array<ArrayBuffer>,
    edges: number[],
  ): void {
    const analyser = this.analyser;
    if (!analyser) return;
    // Contexto no corriendo (suspendido por política de autoplay, o cerrándose):
    // sus lecturas son ceros, no silencio real. Callar es lo correcto — el ciclo
    // de grabación sigue reportando nivel por su cuenta.
    if (this.ctx?.state !== 'running') {
      void this.ctx?.resume().catch(() => {});
      return;
    }
    analyser.getFloatTimeDomainData(timeBuf);
    let peak = 0;
    for (let i = 0; i < timeBuf.length; i += 1) {
      const a = Math.abs(timeBuf[i]);
      if (a > peak) peak = a;
    }
    analyser.getByteFrequencyData(freqBuf);
    const bands = bandEnergies(freqBuf, edges);

    this.onLevel?.(peak);

    const { state, boundary } = feedTrackChangeFrame(
      this.detector,
      { at: Date.now(), level: peak, bands },
      this.config,
    );
    this.detector = state;
    if (boundary) this.onBoundary?.(boundary);
  }

  close(): void {
    if (this.timer != null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    try {
      this.source?.disconnect();
    } catch {
      /* noop */
    }
    this.source = null;
    this.analyser = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
