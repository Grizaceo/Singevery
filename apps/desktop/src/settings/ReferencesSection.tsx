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
  type TeacherReferenceApi,
} from '../useTeacherReference';
import type { ReferenceInstrumentDto } from '../types';
import type { MessageKey } from '../i18n';
import { useT } from '../i18n/useT';

interface ReferencesSectionProps {
  teacherRef: TeacherReferenceApi;
  /** Pista sonando ahora, para etiquetar la toma. */
  trackTitle?: string;
  trackArtist?: string;
  hasTrack: boolean;
}

const INSTRUMENTS: ReferenceInstrumentDto[] = ['voz', 'bajo', 'guitarra', 'teclado', 'otro'];

const INSTRUMENT_LABEL_KEYS: Record<ReferenceInstrumentDto, MessageKey> = {
  voz: 'settingsMore.instrumentVoice',
  bajo: 'settingsMore.instrumentBass',
  guitarra: 'settingsMore.instrumentGuitar',
  teclado: 'settingsMore.instrumentKeyboard',
  otro: 'settingsMore.instrumentOther',
};

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
  const t = useT();
  const [label, setLabel] = useState('');
  const [instrument, setInstrument] = useState<ReferenceInstrumentDto>('voz');
  const [author, setAuthor] = useState('');
  const [seconds, setSeconds] = useState(DEFAULT_TAKE_SECONDS);

  const { status, error, remainingSeconds, all, reference } = teacherRef;
  const recording = status === 'recording' || status === 'analyzing';

  const startTake = (): void => {
    void teacherRef.record({
      label: label.trim() || t('settingsMore.defaultRefName'),
      instrument,
      author: author.trim() || undefined,
      seconds,
      title: trackTitle,
      artist: trackArtist,
    });
  };

  return (
    <section className="settings-section">
      <h3>{t('settingsMore.refTitle')}</h3>
      <p className="settings-hint">
        {t('settingsMore.refHintPre')}
        <strong>{t('settingsMore.refHintStrong')}</strong>
        {t('settingsMore.refHintPost')}
      </p>

      <label className="settings-row">
        <span>{t('settingsMore.takeName')}</span>
        <input
          type="text"
          value={label}
          maxLength={60}
          placeholder={t('settingsMore.takeNamePlaceholder')}
          onChange={(e) => setLabel(e.target.value)}
          disabled={recording}
        />
      </label>

      <label className="settings-row">
        <span>{t('settingsMore.instrument')}</span>
        <select
          value={instrument}
          onChange={(e) => setInstrument(e.target.value as ReferenceInstrumentDto)}
          disabled={recording}
        >
          {INSTRUMENTS.map((key) => (
            <option key={key} value={key}>
              {t(INSTRUMENT_LABEL_KEYS[key])}
            </option>
          ))}
        </select>
      </label>

      <label className="settings-row">
        <span>{t('settingsMore.recordedBy')}</span>
        <input
          type="text"
          value={author}
          maxLength={60}
          placeholder={t('settingsMore.authorPlaceholder')}
          onChange={(e) => setAuthor(e.target.value)}
          disabled={recording}
        />
      </label>

      <label className="settings-row">
        <span>{t('settingsMore.takeDuration')}</span>
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
            ? t('settingsMore.recording', { seconds: remainingSeconds })
            : status === 'analyzing'
              ? t('settingsMore.analyzing')
              : t('settingsMore.recordRef')}
        </button>
        <button type="button" onClick={() => void teacherRef.importOne()} disabled={recording}>
          {t('settingsMore.importFile')}
        </button>
      </div>

      {!hasTrack && (
        <p className="settings-hint">{t('settingsMore.noTrackHint')}</p>
      )}
      {status === 'saved' && !error && <p className="settings-ok">{t('settingsMore.refSaved')}</p>}
      {error && <p className="settings-error">{error}</p>}

      {reference && (
        <p className="settings-hint">
          {t('settingsMore.refActivePre')}
          <strong>{reference.label}</strong>
          {reference.author ? ` (${reference.author})` : ''}
          {t('settingsMore.refActivePost')}
        </p>
      )}

      <h4>{t('settingsMore.savedOnDevice', { count: all.length })}</h4>
      <div className="settings-actions">
        <button
          type="button"
          onClick={() => void window.api?.openReferencesFolder()}
          title={t('settingsMore.openFolderTitle')}
        >
          {t('settingsMore.openFolder')}
        </button>
      </div>
      {all.length === 0 ? (
        <p className="settings-hint">{t('settingsMore.noneYet')}</p>
      ) : (
        <ul className="reference-list">
          {all.map((item) => (
            <li key={item.id} className="reference-item">
              <div className="reference-info">
                <strong>{item.label}</strong>
                <span>
                  {t(INSTRUMENT_LABEL_KEYS[item.instrument])}
                  {item.title
                    ? ` · ${item.artist ? `${item.artist} — ` : ''}${item.title}`
                    : t('settingsMore.standaloneExercise')}
                  {' · '}
                  {formatRange(item.startMs, item.endMs)}
                  {item.author ? ` · ${item.author}` : ''}
                </span>
              </div>
              <div className="reference-buttons">
                <button type="button" onClick={() => void teacherRef.exportOne(item.id)}>
                  {t('settingsMore.export')}
                </button>
                <button type="button" onClick={() => void teacherRef.remove(item.id)}>
                  {t('settingsMore.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
