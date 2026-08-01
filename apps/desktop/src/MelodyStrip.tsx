import React, { useMemo } from 'react';
import type { MelodyPoint } from './audio/melody';
import './MelodyStrip.css';

/**
 * MelodyStrip — mini-curva de entonación de una línea (P1-P2 de
 * SWAP-PITCH-001).
 *
 * Muestra la melodía de referencia de la línea como una tira de puntos
 * verticales (piano roll minimalista): la altura del punto = frecuencia
 * (arriba = agudo, abajo = grave), el punto actual se ilumina según el
 * progress de la línea, y la nota del momento se muestra como etiqueta.
 *
 * La referencia es una interpretación automática de la app, no la partitura
 * oficial (ver SWAP).
 */

/** Rango visual: 150-800 Hz (mismo rango que la extracción de melodía). */
const VIS_MIN_FREQ = 150;
const VIS_MAX_FREQ = 800;

interface MelodyStripProps {
  /** Puntos de la melodía completa de la canción. */
  melody: MelodyPoint[];
  /** Inicio de la línea en ms (tiempo de canción). */
  startMs: number;
  /** Fin de la línea en ms (opcional). */
  endMs?: number | null;
  /** Avance 0..1 dentro de la línea actual. */
  progress?: number;
  /** La línea es la actual (ilumina el punto). */
  current?: boolean;
}

export const MelodyStrip = React.memo(function MelodyStrip({
  melody,
  startMs,
  endMs,
  progress = 0,
  current = false,
}: MelodyStripProps) {
  // Puntos de la melodía que caen dentro de la línea.
  const points = useMemo(() => {
    const end = endMs ?? startMs + 8000; // sin end: ventana de 8 s
    return melody.filter((p) => p.freq != null && p.timeMs >= startMs - 50 && p.timeMs <= end + 50);
  }, [melody, startMs, endMs]);

  if (points.length < 2) {
    return (
      <div className={`melody-strip melody-empty${current ? ' melody-current' : ''}`}>
        <span>—</span>
      </div>
    );
  }

  // Altura normalizada (0..1): 1 = agudo (arriba).
  const heightFor = (freq: number): number => {
    const clamped = Math.max(VIS_MIN_FREQ, Math.min(VIS_MAX_FREQ, freq));
    return (clamped - VIS_MIN_FREQ) / (VIS_MAX_FREQ - VIS_MIN_FREQ);
  };

  const noteFor = (freq: number): string => {
    const midiFloat = 69 + 12 * Math.log2(freq / 440);
    const midi = Math.round(midiFloat);
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return names[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
  };

  // Índice del punto "actual" según el progress de la línea.
  const spanMs = (endMs ?? startMs + 8000) - startMs;
  const targetTime = startMs + spanMs * Math.max(0, Math.min(1, progress));
  let currentIdx = -1;
  let bestDist = Infinity;
  points.forEach((p, i) => {
    const d = Math.abs(p.timeMs - targetTime);
    if (d < bestDist) {
      bestDist = d;
      currentIdx = i;
    }
  });

  const currentFreq = current && currentIdx >= 0 ? points[currentIdx].freq! : null;
  const currentNote = currentFreq != null ? noteFor(currentFreq) : null;

  return (
    <div className={`melody-strip${current ? ' melody-current' : ''}`} aria-hidden="true">
      <div className="melody-bars">
        {points.map((p, i) => {
          const h = heightFor(p.freq!);
          const isCurrent = current && i === currentIdx;
          return (
            <span
              key={i}
              className={`melody-bar${isCurrent ? ' melody-bar-current' : ''}`}
              style={{ height: `${Math.max(8, Math.round(h * 100))}%` }}
            />
          );
        })}
      </div>
      {current && currentNote && <span className="melody-note">{currentNote}</span>}
    </div>
  );
});
