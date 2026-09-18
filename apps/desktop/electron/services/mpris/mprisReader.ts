// ============================================================================
// MPRIS reader — Capa b en Linux: el reproductor del SO como reloj maestro.
//
// Equivalente Linux del sidecar SMTC de Windows. Los reproductores (Spotify,
// Firefox/Zen, Chromium, VLC, mpv…) publican su sesión en el bus de sesión
// D-Bus bajo org.mpris.MediaPlayer2.*: metadata, playhead y play/pausa. Este
// reader los consulta con `busctl` (systemd, presente en cualquier escritorio
// con systemd) y produce EXACTAMENTE los mismos eventos que el sidecar SMTC
// (track / position / playback), que viajan por el mismo filtro y el mismo
// sink del StateStore. Nada del core distingue de qué SO vino el evento.
//
// Por qué polling y no señales: la spec MPRIS no emite PropertiesChanged para
// Position (hay que preguntarla), así que un tick de 1 s es inevitable; con
// él alcanza también para metadata y play/pausa. Sin dependencias nuevas.
//
// Selección de reproductor (análoga a GetCurrentSession de SMTC): se sigue al
// que está sonando; si otro empieza a sonar, se cambia a él; en pausa se
// conserva el actual.
//
// Si busctl no existe, el reader se apaga con un aviso y la app sigue con el
// reconocimiento por audio (Shazam/AudD), igual que Windows sin sidecar.
// ============================================================================

import { execFile } from 'child_process';
import {
  dispatchSmtcEvent,
  nextForwardablePosition,
  type SmtcEvent,
  type SmtcSink,
} from '../smtc/smtcReader';

export const MPRIS_PREFIX = 'org.mpris.MediaPlayer2.';
const MPRIS_PATH = '/org/mpris/MediaPlayer2';
const MPRIS_PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player';

/** Periodo del polling (igual al tick de posición del sidecar SMTC). */
export const MPRIS_POLL_MS = 1000;
/** Cada cuántos ticks se re-listan los reproductores para ver si otro empezó a sonar. */
export const MPRIS_DISCOVERY_EVERY = 3;

/**
 * Timeline viejo tras un cambio de pista (mismo bug que resolvía el sidecar
 * SMTC con TimelineIsStale): los navegadores cambian la metadata ANTES que la
 * posición, así que el primer Position de la pista nueva puede ser todavía el
 * de la anterior. Se reconoce porque CONTINÚA la posición previa.
 */
export const MPRIS_STALE_GRACE_MS = 5000;
/** Holgura para decidir que una posición continúa la de la pista anterior. */
export const MPRIS_STALE_TOLERANCE_MS = 1500;
/** Por debajo de esto una posición es "inicio de pista" y nunca se toma por vieja. */
export const MPRIS_STALE_MIN_MS = 3000;

export type MprisStatus = 'Playing' | 'Paused' | 'Stopped';

/** Estado de un reproductor MPRIS en un instante. */
export interface MprisSnapshot {
  name: string;
  status: MprisStatus;
  title: string;
  artist: string;
  album: string | null;
  durationMs: number | null;
  /** null si el reproductor no expone Position. */
  positionMs: number | null;
  /** Instante (epoch ms) en que se leyó. */
  at: number;
}

/** Lo que el reader recuerda entre ticks del reproductor seguido. */
export interface MprisTracker {
  trackSig: string;
  playing: boolean | null;
  lastPositionMs: number | null;
  lastAt: number;
  /** Hasta cuándo se desconfía de la posición (0 = confiable). */
  staleUntil: number;
}

export function emptyMprisTracker(): MprisTracker {
  return { trackSig: '', playing: null, lastPositionMs: null, lastAt: 0, staleUntil: 0 };
}

type Variant = { type?: string; data?: unknown };

function variantData(v: unknown): unknown {
  return v && typeof v === 'object' && 'data' in v ? (v as Variant).data : undefined;
}

function variantString(v: unknown): string {
  const d = variantData(v);
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.filter((x) => typeof x === 'string').join(', ');
  return '';
}

function variantNumber(v: unknown): number | null {
  const d = variantData(v);
  return typeof d === 'number' && Number.isFinite(d) ? d : null;
}

/**
 * Nombres MPRIS presentes en el bus (salida JSON de busctl ListNames).
 * Excluye la sesión de la propia app: Chromium publica
 * org.mpris.MediaPlayer2.chromium.instance<pid> si algo suena en el widget.
 */
export function parseMprisNames(stdout: string, ownPid: number): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  const names = variantData(parsed);
  const list = Array.isArray(names) && Array.isArray(names[0]) ? (names[0] as unknown[]) : [];
  return list.filter(
    (n): n is string =>
      typeof n === 'string' && n.startsWith(MPRIS_PREFIX) && !n.endsWith(`.instance${ownPid}`),
  );
}

/**
 * Parsea la respuesta JSON de busctl a
 * Properties.GetAll("org.mpris.MediaPlayer2.Player"). Pura (testeable).
 */
export function parseMprisProperties(name: string, stdout: string, at: number): MprisSnapshot | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  const args = variantData(parsed);
  const props = Array.isArray(args) ? (args[0] as Record<string, unknown> | undefined) : undefined;
  if (!props || typeof props !== 'object') return null;

  const rawStatus = variantString(props.PlaybackStatus);
  const status: MprisStatus =
    rawStatus === 'Playing' || rawStatus === 'Paused' ? rawStatus : 'Stopped';
  const meta = (variantData(props.Metadata) ?? {}) as Record<string, unknown>;
  const lengthUs = variantNumber(meta['mpris:length']);
  const positionUs = variantNumber(props.Position);
  const album = variantString(meta['xesam:album']);

  return {
    name,
    status,
    title: variantString(meta['xesam:title']).trim(),
    artist: variantString(meta['xesam:artist']).trim(),
    album: album.trim() ? album.trim() : null,
    durationMs: lengthUs != null && lengthUs > 0 ? Math.round(lengthUs / 1000) : null,
    positionMs: positionUs != null && positionUs >= 0 ? Math.round(positionUs / 1000) : null,
    at,
  };
}

/**
 * Elige qué reproductor seguir. Pura (testeable).
 *   1. El actual, si sigue sonando.
 *   2. Si no, cualquiera que esté sonando (alguien le dio play a otro).
 *   3. Si nadie suena, el actual en pausa (no saltar a otro por estar quieto).
 *   4. Sin actual: el primero que tenga metadata útil.
 */
export function pickMprisPlayer(snapshots: MprisSnapshot[], current: string | null): string | null {
  const usable = snapshots.filter((s) => s.title || s.artist);
  const cur = usable.find((s) => s.name === current);
  if (cur?.status === 'Playing') return cur.name;
  const playing = usable.find((s) => s.status === 'Playing');
  if (playing) return playing.name;
  if (cur) return cur.name;
  return usable.find((s) => s.status === 'Paused')?.name ?? null;
}

/**
 * Traduce un snapshot del reproductor seguido a eventos SMTC. Pura: devuelve
 * los eventos y el tracker actualizado.
 *   - 'track' cuando cambia la identidad (título/artista/álbum), con dedupe
 *     igual que el sidecar SMTC (los navegadores repiten metadata).
 *   - 'playback' cuando cambia play/pausa.
 *   - 'position' en cada tick si el reproductor la expone.
 */
export function mprisEvents(
  snap: MprisSnapshot,
  tracker: MprisTracker,
): { events: SmtcEvent[]; tracker: MprisTracker } {
  const playing = snap.status === 'Playing';
  const events: SmtcEvent[] = [];
  let positionMs = snap.positionMs;
  if (positionMs != null && snap.durationMs != null && positionMs > snap.durationMs) {
    positionMs = snap.durationMs;
  }

  // ¿La posición leída continúa la de la pista anterior? (timeline viejo)
  const continuesPrevious = (pos: number): boolean => {
    if (tracker.lastPositionMs == null || !tracker.playing || pos < MPRIS_STALE_MIN_MS) return false;
    const projected = tracker.lastPositionMs + (snap.at - tracker.lastAt);
    return Math.abs(pos - projected) <= MPRIS_STALE_TOLERANCE_MS;
  };

  const next: MprisTracker = { ...tracker, playing, lastPositionMs: positionMs, lastAt: snap.at };
  const sig = `${snap.title}${snap.artist}${snap.album ?? ''}`;

  if (sig !== tracker.trackSig) {
    next.trackSig = sig;
    const stale = positionMs != null && continuesPrevious(positionMs);
    next.staleUntil = stale ? snap.at + MPRIS_STALE_GRACE_MS : 0;
    // Pista sin identidad útil (metadata aún no cargada): no emitir.
    if (snap.title || snap.artist) {
      events.push({
        type: 'track',
        title: snap.title,
        artist: snap.artist,
        album: snap.album,
        durationMs: snap.durationMs,
        // Una pista que acaba de cambiar está en 0; el canal 'position'
        // corrige en ≤1 s ya con el timeline fresco.
        positionMs: stale ? 0 : (positionMs ?? 0),
        playing,
      });
    }
    return { events, tracker: next };
  }

  if (tracker.playing != null && playing !== tracker.playing) {
    events.push({ type: 'playback', playing });
  }
  if (positionMs != null) {
    const stillStale = tracker.staleUntil > 0 && snap.at < tracker.staleUntil && continuesPrevious(positionMs);
    if (stillStale) {
      // Posición de la canción ANTERIOR: callar hasta que el reproductor la
      // refresque (o venza el plazo de gracia).
      return { events, tracker: next };
    }
    next.staleUntil = 0;
    events.push({ type: 'position', positionMs, playing });
  }
  return { events, tracker: next };
}

/** Ejecuta busctl sobre el bus de sesión y devuelve su stdout. Inyectable para tests. */
export type BusctlRunner = (args: string[]) => Promise<string>;

const defaultRunner: BusctlRunner = (args) =>
  new Promise((resolve, reject) => {
    execFile(
      'busctl',
      ['--user', '--json=short', '--timeout=1', ...args],
      { timeout: 2500, maxBuffer: 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(stdout)),
    );
  });

/**
 * Sigue al reproductor MPRIS activo y enruta sus eventos al sink (StateStore).
 * No-op fuera de Linux.
 */
export class MprisReader {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private stopped = false;
  private ticks = 0;
  private current: string | null = null;
  private tracker: MprisTracker = emptyMprisTracker();
  /** Última posición reenviada (mismo filtro de congelados que SMTC). */
  private lastForwardedMs: number | null = null;
  /** Último aviso de error del bus: sin esto, un bus caído loguea cada segundo. */
  private lastWarnAt = 0;

  constructor(
    private readonly sink: SmtcSink,
    private readonly run: BusctlRunner = defaultRunner,
    private readonly ownPid: number = process.pid,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}

  start(): boolean {
    if (this.platform !== 'linux' || this.timer) return false;
    this.stopped = false;
    this.timer = setInterval(() => void this.poll(), MPRIS_POLL_MS);
    this.timer.unref?.();
    void this.poll();
    return true;
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Un tick: descubre/lee reproductores y emite los eventos del seguido. */
  async poll(): Promise<void> {
    if (this.busy || this.stopped) return;
    this.busy = true;
    try {
      const discover = this.current == null || this.ticks % MPRIS_DISCOVERY_EVERY === 0;
      this.ticks += 1;

      let snapshots: MprisSnapshot[];
      if (discover) {
        const names = parseMprisNames(
          await this.run(['call', 'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'ListNames']),
          this.ownPid,
        );
        snapshots = (await Promise.all(names.map((n) => this.read(n)))).filter(
          (s): s is MprisSnapshot => s != null,
        );
      } else {
        const snap = await this.read(this.current!);
        snapshots = snap ? [snap] : [];
      }
      if (this.stopped) return;

      const next = discover
        ? pickMprisPlayer(snapshots, this.current)
        : snapshots.length > 0
          ? this.current
          : null;
      if (next !== this.current) {
        // Sesión nueva: re-emitir el 'track' aunque la firma coincida (igual
        // que Hook() en el sidecar SMTC).
        this.current = next;
        this.tracker = emptyMprisTracker();
      }
      const snap = snapshots.find((s) => s.name === this.current);
      if (!snap) return;

      const { events, tracker } = mprisEvents(snap, this.tracker);
      this.tracker = tracker;
      for (const ev of events) {
        const { forward, lastPositionMs } = nextForwardablePosition(ev, this.lastForwardedMs);
        this.lastForwardedMs = lastPositionMs;
        if (forward) dispatchSmtcEvent(ev, this.sink, snap.at);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
        console.warn('[mpris] busctl no está instalado; reproductor del sistema deshabilitado (queda el reconocimiento por audio)');
        this.stop();
      } else {
        // Bus caído o respuesta rara: se reintenta en el próximo tick.
        const now = Date.now();
        if (now - this.lastWarnAt > 60_000) {
          this.lastWarnAt = now;
          console.warn('[mpris] error consultando el bus:', err instanceof Error ? err.message : err);
        }
      }
    } finally {
      this.busy = false;
    }
  }

  private async read(name: string): Promise<MprisSnapshot | null> {
    const startedAt = Date.now();
    try {
      const stdout = await this.run(['call', name, MPRIS_PATH, 'org.freedesktop.DBus.Properties', 'GetAll', 's', MPRIS_PLAYER_IFACE]);
      // La posición se leyó en algún punto de la llamada: el punto medio
      // acota el error a la mitad de lo que tardó busctl (unos ms).
      return parseMprisProperties(name, stdout, Math.round((startedAt + Date.now()) / 2));
    } catch (err) {
      // El reproductor se cerró entre ListNames y GetAll: ya no existe.
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') throw err;
      return null;
    }
  }
}
