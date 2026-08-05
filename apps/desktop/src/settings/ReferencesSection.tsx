// ============================================================================
// ReferencesSection — melodías de referencia del profesor (funciones avanzadas).
//
// El profesor toca o canta la línea bien una vez y queda guardada como
// referencia para el alumno. Se guarda SOLO la curva de tono, en este equipo, y
// se comparte exportando un archivo: la app nunca sube nada a ninguna parte.
// ============================================================================

import { useState } from 'react';
import {
  DEFAULT_TAKE_SECONDS,
  INSTRUMENT_LABELS,
  type TeacherReferenceApi,
} from '../useTeacherReference';
import type { ReferenceInstrumentDto } from '../types';

interface ReferencesSectionProps {
  teacherRef: TeacherReferenceApi;
  /** Pista sonando ahora, para etiquetar la toma. */
  trackTitle?: string;
  trackArtist?: string;
  hasTrack: boolean;
}

const INSTRUMENTS: ReferenceInstrumentDto[] = ['voz', 'bajo', 'guitarra', 'teclado', 'otro'];

function formatRange(startMs: number, endMs: number): string {
  const mmss = (ms: number): string => {
    const total = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  };
  return `${mmss(startMs)}–${mmss(endMs)}`;
}

export function ReferencesSection({
  teacherRef,
  trackTitle,
  trackArtist,
  hasTrack,
}: ReferencesSectionProps) {
  const [label, setLabel] = useState('');
  const [instrument, setInstrument] = useState<ReferenceInstrumentDto>('voz');
  const [author, setAuthor] = useState('');
  const [seconds, setSeconds] = useState(DEFAULT_TAKE_SECONDS);

  const { status, error, remainingSeconds, all, reference } = teacherRef;
  const recording = status === 'recording' || status === 'analyzing';

  const startTake = (): void => {
    void teacherRef.record({
      label: label.trim() || 'Referencia',
      instrument,
      author: author.trim() || undefined,
      seconds,
      title: trackTitle,
      artist: trackArtist,
    });
  };

  return (
    <section className="settings-section">
      <h3>Melodías de referencia</h3>
      <p className="settings-hint">
        Graba la línea tocada o cantada bien una vez y queda como referencia del alumno, en
        lugar de la melodía que la app deduce sola. <strong>Se guarda solo la curva de
        notas, nunca el audio</strong>, y no sale de este computador: para pasársela a alguien,
        expórtala y mándale el archivo.
      </p>

      <label className="settings-row">
        <span>Nombre de la toma</span>
        <input
          type="text"
          value={label}
          maxLength={60}
          placeholder="Estribillo, compases 12-20…"
          onChange={(e) => setLabel(e.target.value)}
          disabled={recording}
        />
      </label>

      <label className="settings-row">
        <span>Instrumento</span>
        <select
          value={instrument}
          onChange={(e) => setInstrument(e.target.value as ReferenceInstrumentDto)}
          disabled={recording}
        >
          {INSTRUMENTS.map((key) => (
            <option key={key} value={key}>
              {INSTRUMENT_LABELS[key]}
            </option>
          ))}
        </select>
      </label>

      <label className="settings-row">
        <span>Quién graba (opcional)</span>
        <input
          type="text"
          value={author}
          maxLength={60}
          placeholder="Profe Marcelo"
          onChange={(e) => setAuthor(e.target.value)}
          disabled={recording}
        />
      </label>

      <label className="settings-row">
        <span>Duración de la toma</span>
        <input
          type="range"
          min={3}
          max={45}
          step={1}
          value={seconds}
          onChange={(e) => setSeconds(Number(e.target.value))}
          disabled={recording}
        />
        <span className="settings-value">{seconds}s</span>
      </label>

      <div className="settings-actions">
        <button type="button" onClick={startTake} disabled={recording}>
          {status === 'recording'
            ? `Grabando… ${remainingSeconds}s`
            : status === 'analyzing'
              ? 'Analizando…'
              : 'Grabar referencia'}
        </button>
        <button type="button" onClick={() => void teacherRef.importOne()} disabled={recording}>
          Importar archivo
        </button>
      </div>

      {!hasTrack && (
        <p className="settings-hint">
          Sin canción reconocida la toma se guarda como ejercicio suelto, sin quedar asociada a
          ningún tema.
        </p>
      )}
      {status === 'saved' && !error && <p className="settings-ok">Referencia guardada.</p>}
      {error && <p className="settings-error">{error}</p>}

      {reference && (
        <p className="settings-hint">
          Para esta canción está activa <strong>{reference.label}</strong>
          {reference.author ? ` (${reference.author})` : ''}. Reemplaza a la melodía automática.
        </p>
      )}

      <h4>Guardadas en este equipo ({all.length})</h4>
      {all.length === 0 ? (
        <p className="settings-hint">Todavía no hay ninguna.</p>
      ) : (
        <ul className="reference-list">
          {all.map((item) => (
            <li key={item.id} className="reference-item">
              <div className="reference-info">
                <strong>{item.label}</strong>
                <span>
                  {INSTRUMENT_LABELS[item.instrument]}
                  {item.title ? ` · ${item.artist ? `${item.artist} — ` : ''}${item.title}` : ' · ejercicio suelto'}
                  {' · '}
                  {formatRange(item.startMs, item.endMs)}
                  {item.author ? ` · ${item.author}` : ''}
                </span>
              </div>
              <div className="reference-buttons">
                <button type="button" onClick={() => void teacherRef.exportOne(item.id)}>
                  Exportar
                </button>
                <button type="button" onClick={() => void teacherRef.remove(item.id)}>
                  Borrar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
