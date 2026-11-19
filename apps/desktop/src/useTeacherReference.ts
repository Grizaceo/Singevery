// ============================================================================
// useTeacherReference — melodías de referencia grabadas por el profesor.
//
// Por qué existe: la referencia automática (useMelodyReference) extrae la
// melodía de la propia canción tomando la frecuencia dominante en rango vocal.
// Es una heurística y se degrada en arreglos densos. Un profesor no necesita
// heurística: toca o canta la línea BIEN una vez, y esa es la referencia
// correcta por definición. Es además lo que hace en clase de todas formas.
//
// Qué se guarda: SOLO la curva de tono. El audio se analiza en memoria y se
// descarta; nunca toca el disco ni sale del equipo. Compartirla con el alumno
// es exportar un archivo y mandarlo por donde el profesor quiera.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { recordChunk } from './audio/capture';
import { extractMelody, smoothMelody, type MelodyPoint } from './audio/melody';
import type {
  ReferenceCurveDto,
  ReferenceInstrumentDto,
  ReferenceMelodyDto,
  ReferenceMetaDto,
} from './types';
import { t, type MessageKey } from './i18n';

/** Rango de análisis por instrumento (Hz). Debe coincidir con el del main. */
export const INSTRUMENT_RANGE: Record<ReferenceInstrumentDto, { min: number; max: number }> = {
  voz: { min: 80, max: 1200 },
  bajo: { min: 38, max: 400 },
  guitarra: { min: 75, max: 1400 },
  teclado: { min: 55, max: 2100 },
  otro: { min: 38, max: 2100 },
};

export const INSTRUMENT_LABELS: Record<ReferenceInstrumentDto, MessageKey> = {
  voz: 'hooks.instrument.voice',
  bajo: 'hooks.instrument.bass',
  guitarra: 'hooks.instrument.guitar',
  teclado: 'hooks.instrument.keyboard',
  otro: 'hooks.instrument.other',
};

/** Duración por defecto de la toma. Suficiente para una frase o dos compases. */
export const DEFAULT_TAKE_SECONDS = 12;
/** Mínimo de puntos para que una toma valga: menos es ruido o silencio. */
const MIN_POINTS = 8;

export type TeacherRecordStatus = 'idle' | 'recording' | 'analyzing' | 'saved' | 'error';

/** Curva compacta → puntos que consume la tira de melodía. */
export function curveToPoints(curve: ReferenceCurveDto): MelodyPoint[] {
  const out: MelodyPoint[] = [];
  for (let i = 0; i < curve.t.length; i += 1) {
    out.push({ timeMs: curve.t[i], freq: curve.f[i] });
  }
  return out;
}

/** Puntos con frecuencia válida → curva compacta para guardar. */
export function pointsToCurve(points: MelodyPoint[]): ReferenceCurveDto {
  const t: number[] = [];
  const f: number[] = [];
  for (const p of points) {
    if (p.freq == null || !Number.isFinite(p.freq)) continue;
    t.push(Math.round(p.timeMs));
    f.push(p.freq);
  }
  return { t, f };
}

export interface RecordReferenceOptions {
  label: string;
  instrument: ReferenceInstrumentDto;
  author?: string;
  seconds?: number;
  title?: string;
  artist?: string;
}

export interface TeacherReferenceApi {
  /** Referencia vigente para la pista actual (la más reciente), o null. */
  reference: ReferenceMelodyDto | null;
  /** La misma, ya convertida para la tira de melodía. */
  points: MelodyPoint[] | null;
  /** Todas las referencias guardadas en este PC. */
  all: ReferenceMetaDto[];
  status: TeacherRecordStatus;
  error: string | null;
  /** Segundos restantes mientras graba (para la cuenta atrás de la UI). */
  remainingSeconds: number;
  record: (options: RecordReferenceOptions) => Promise<void>;
  remove: (id: string) => Promise<void>;
  exportOne: (id: string) => Promise<void>;
  importOne: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useTeacherReference(
  trackKey: string | null,
  getPositionMs: () => number | null = () => null,
): TeacherReferenceApi {
  const [reference, setReference] = useState<ReferenceMelodyDto | null>(null);
  const [all, setAll] = useState<ReferenceMetaDto[]>([]);
  const [status, setStatus] = useState<TeacherRecordStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    const api = window.api;
    if (!api) return;
    try {
      const list = await api.listReferences();
      setAll(list.ok ? list.items : []);
      if (trackKey) {
        const current = await api.getReferenceForTrack(trackKey);
        setReference(current.ok ? current.reference : null);
      } else {
        setReference(null);
      }
    } catch {
      // El almacén es opcional: sin él la app sigue con la referencia automática.
    }
  }, [trackKey]);

  // La carga inicial se difiere a un microtask: `refresh` hace setState y
  // llamarla síncronamente desde el efecto dispara renders en cascada (es el
  // mismo patrón que usa useMelodyReference para su captura diferida).
  // El flag de cancelación evita escribir estado tras desmontar o tras un
  // cambio de pista que ya disparó otro refresh.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const record = useCallback(
    async (options: RecordReferenceOptions) => {
      const api = window.api;
      if (!api || busyRef.current) return;
      busyRef.current = true;
      setStatus('recording');
      setError(null);

      const seconds = Math.max(3, Math.min(60, options.seconds ?? DEFAULT_TAKE_SECONDS));
      setRemainingSeconds(seconds);
      const ticker = window.setInterval(() => {
        setRemainingSeconds((s) => (s > 0 ? s - 1 : 0));
      }, 1000);

      // Ancla: posición de la canción al empezar la toma, para que la curva
      // quede en tiempo absoluto de la canción y no relativa a la grabación.
      const anchorMs = getPositionMs() ?? 0;

      try {
        const { blob } = await recordChunk('microphone', seconds * 1000);
        setStatus('analyzing');
        window.clearInterval(ticker);
        setRemainingSeconds(0);

        const AudioCtx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        let samples: Float32Array;
        let sampleRate: number;
        try {
          const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
          samples = decoded.getChannelData(0);
          sampleRate = decoded.sampleRate;
        } finally {
          await ctx.close().catch(() => {});
        }

        const range = INSTRUMENT_RANGE[options.instrument] ?? INSTRUMENT_RANGE.otro;
        // Ventana más larga para instrumentos graves: a 41 Hz un solo periodo
        // dura 24 ms, y el detector necesita varios para decidir.
        const windowMs = range.min < 70 ? 110 : 43;
        const melody = smoothMelody(
          extractMelody(samples, sampleRate, {
            minFreq: range.min,
            maxFreq: range.max,
            windowMs,
          }),
        ).map((p) => ({ ...p, timeMs: p.timeMs + anchorMs }));

        const curve = pointsToCurve(melody);
        if (curve.t.length < MIN_POINTS) {
          setStatus('error');
          setError(t('hooks.teacherNoMelody'));
          return;
        }

        const saved = await api.saveReference({
          trackKey: trackKey ?? '',
          title: options.title,
          artist: options.artist,
          label: options.label,
          instrument: options.instrument,
          author: options.author,
          curve,
        });
        if (!saved.ok) {
          setStatus('error');
          setError(saved.error ?? t('hooks.referenceSaveError'));
          return;
        }
        setStatus('saved');
        await refresh();
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : t('hooks.referenceRecordError'));
      } finally {
        window.clearInterval(ticker);
        setRemainingSeconds(0);
        busyRef.current = false;
      }
    },
    [trackKey, getPositionMs, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await window.api?.deleteReference(id);
      await refresh();
    },
    [refresh],
  );

  const exportOne = useCallback(async (id: string) => {
    const result = await window.api?.exportReference(id);
    if (result && !result.ok && !result.canceled) {
      setStatus('error');
      setError(result.error ?? t('hooks.referenceExportError'));
    }
  }, []);

  const importOne = useCallback(async () => {
    const result = await window.api?.importReference();
    if (result && !result.ok && !result.canceled) {
      setStatus('error');
      setError(result.error ?? t('hooks.referenceImportError'));
      return;
    }
    if (result?.ok) {
      setStatus('saved');
      setError(null);
      await refresh();
    }
  }, [refresh]);

  return {
    reference,
    points: reference ? curveToPoints(reference.curve) : null,
    all,
    status,
    error,
    remainingSeconds,
    record,
    remove,
    exportOne,
    importOne,
    refresh,
  };
}
