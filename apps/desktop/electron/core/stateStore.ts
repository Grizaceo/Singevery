// ============================================================================
// StateStore — mantiene el estado canónico del widget y emite el RenderModel
// al renderer por IPC a ~10 Hz.
// ============================================================================

import { BrowserWindow } from 'electron';
import { SyncEngine } from './syncEngine';
import { adjustMatchPosition, projectAnchoredPosition } from './syncTiming';
import type { RecognitionPhase } from './syncTiming';
import { fetchLyricsByMetadata } from '../services/lrclib';
import { romanizeTimedLyrics } from '../services/romanize';
import type { RenderModel, Status, TimedLyrics, TrackMatch } from '../../src/types';

export type { RecognitionPhase };

const IDLE_MESSAGE = 'Esperando música...';

export class StateStore {
  private engine: SyncEngine;
  private window: BrowserWindow | null;
  private intervalHandle: NodeJS.Timeout | null = null;

  private trackTitle: string | undefined;
  private trackArtist: string | undefined;

  private overrideStatus: Status | null = null;
  private lastMatchKey: string | null = null;

  private positionMs = 0;
  private anchoredAt = Date.now();

  constructor(window: BrowserWindow | null) {
    this.window = window;
    this.engine = new SyncEngine();
  }

  attachWindow(window: BrowserWindow): void {
    this.window = window;
  }

  start(intervalMs = 100): void {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(() => this.tick(), intervalMs);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  setLyrics(lyrics: TimedLyrics | null, title?: string, artist?: string): void {
    this.engine.setLyrics(lyrics);
    this.trackTitle = title;
    this.trackArtist = artist;
  }

  anchorPosition(positionMs: number, at: number = Date.now()): void {
    this.positionMs = positionMs;
    this.anchoredAt = at;
  }

  async loadLyricsByMetadata(
    title: string,
    artist: string,
    anchorMs = 0,
    anchorAt = Date.now(),
  ): Promise<void> {
    this.overrideStatus = 'FETCHING_LYRICS';
    this.trackTitle = title;
    this.trackArtist = artist;

    try {
      const raw = await fetchLyricsByMetadata(title, artist);
      if (!raw) {
        this.setLyrics(null, title, artist);
        this.overrideStatus = 'NO_LYRICS';
        return;
      }

      const lyrics = await romanizeTimedLyrics(raw);
      const projected = projectAnchoredPosition(anchorMs, anchorAt);

      this.overrideStatus = null;
      this.setLyrics(lyrics, title, artist);
      this.anchorPosition(projected.positionMs, projected.anchorAt);
    } catch (err) {
      this.setLyrics(null, title, artist);
      this.overrideStatus = 'ERROR';
      throw err;
    }
  }

  setRecognitionPhase(phase: RecognitionPhase): void {
    if (phase) {
      this.overrideStatus = phase;
    } else if (
      this.overrideStatus === 'LISTENING' ||
      this.overrideStatus === 'IDENTIFYING'
    ) {
      this.overrideStatus = null;
    }
  }

  async applyMatch(match: TrackMatch, recordStartedAt?: number): Promise<boolean> {
    const { title, artist } = match.track;
    const matchKey = `${artist}::${title}`;

    const anchor =
      recordStartedAt != null
        ? adjustMatchPosition(match, recordStartedAt)
        : { positionMs: match.position_ms, anchorAt: match.matched_at };

    if (this.lastMatchKey === matchKey && this.engine.getLyrics()) {
      this.anchorPosition(anchor.positionMs, anchor.anchorAt);
      this.overrideStatus = null;
      return false;
    }

    this.lastMatchKey = matchKey;
    this.anchorPosition(anchor.positionMs, anchor.anchorAt);
    this.overrideStatus = 'FETCHING_LYRICS';
    await this.loadLyricsByMetadata(title, artist, anchor.positionMs, anchor.anchorAt);
    return true;
  }

  clearRecognition(): void {
    if (
      this.overrideStatus === 'LISTENING' ||
      this.overrideStatus === 'IDENTIFYING'
    ) {
      this.overrideStatus = null;
    }
  }

  private currentPosition(): number {
    const elapsed = Date.now() - this.anchoredAt;
    return this.positionMs + Math.max(0, elapsed);
  }

  private overrideMessage(status: Status): string {
    switch (status) {
      case 'LISTENING':
        return 'Escuchando...';
      case 'IDENTIFYING':
        return 'Identificando...';
      case 'FETCHING_LYRICS':
        return 'Buscando letra...';
      case 'NO_LYRICS':
        return 'Sin letra disponible';
      case 'ERROR':
        return 'Error al buscar letra';
      default:
        return IDLE_MESSAGE;
    }
  }

  private buildBaseModel(status: Status, currentLine: string): RenderModel {
    return {
      previous_lines: [],
      current_line: currentLine,
      next_lines: [],
      font_scale: 1.0,
      opacity: 1.0,
      alignment: 'center',
      mirror_mode: this.engine.renderConfig.mirrorMode,
      track_title: this.trackTitle,
      track_artist: this.trackArtist,
      status,
    };
  }

  private tick(): void {
    if (this.overrideStatus) {
      this.emit(this.buildBaseModel(this.overrideStatus, this.overrideMessage(this.overrideStatus)));
      return;
    }

    const lyrics = this.engine.getLyrics();
    if (!lyrics) {
      this.emit(this.buildBaseModel('IDLE', IDLE_MESSAGE));
      return;
    }

    const model = this.engine.getRenderModel(this.currentPosition(), 'DISPLAYING');
    const full: RenderModel = {
      ...model,
      track_title: this.trackTitle,
      track_artist: this.trackArtist,
    };
    this.emit(full);
  }

  private emit(model: RenderModel): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('render:model', model);
    }
  }
}
