import { useMemo, useState } from 'react';
import type { DesktopApi, RenderModel } from './types';
import { savedLineFromModel, savedLinesToCsv, useSavedLines } from './useSavedLines';
import { useT } from './i18n/useT';

interface PracticeControlsProps {
  api: DesktopApi | undefined;
  model: RenderModel;
  recallHidden: boolean;
  onRecallHiddenChange: (hidden: boolean) => void;
}

function formatPosition(positionMs: number): string {
  const totalSeconds = Math.floor(positionMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function PracticeControls({
  api,
  model,
  recallHidden,
  onRecallHiddenChange,
}: PracticeControlsProps) {
  const t = useT();
  const { lines, toggle, remove } = useSavedLines();
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const current = useMemo(() => savedLineFromModel(model), [model]);
  const currentSaved = current ? lines.some((line) => line.id === current.id) : false;

  const exportCsv = async () => {
    if (!api || lines.length === 0 || exporting) return;
    setExporting(true);
    setStatus(null);
    try {
      const result = await api.exportPracticeCsv(savedLinesToCsv(lines));
      if (!result.canceled) setStatus(result.ok ? t('practice.csvExported') : result.error ?? t('practice.exportError'));
    } catch {
      setStatus(t('practice.exportError'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="practice-controls">
      <button
        type="button"
        className={`chrome-button${recallHidden ? ' active' : ''}`}
        disabled={model.status !== 'DISPLAYING'}
        onClick={() => onRecallHiddenChange(!recallHidden)}
        title={recallHidden ? t('practice.revealLyrics') : t('practice.hideLyricsForEar')}
        aria-label={recallHidden ? t('practice.revealLyrics') : t('practice.hideLyricsForEar')}
      >
        {recallHidden ? '◉' : '◌'}
      </button>
      <button
        type="button"
        className={`chrome-button${currentSaved ? ' active' : ''}`}
        disabled={!current}
        onClick={() => current && toggle(current)}
        title={currentSaved ? t('practice.removeLineFromReview') : t('practice.saveLineForReview')}
        aria-label={currentSaved ? t('practice.removeLineFromReview') : t('practice.saveLineForReview')}
      >
        {currentSaved ? '★' : '☆'}
      </button>
      <button
        type="button"
        className={`chrome-button practice-review-button${open ? ' active' : ''}`}
        disabled={lines.length === 0}
        onClick={() => setOpen((value) => !value)}
        title={t('practice.reviewSavedLines')}
        aria-label={t('practice.reviewSavedLinesAria', { count: lines.length })}
      >
        {t('practice.reviewCount', { count: lines.length })}
      </button>

      {open && (
        <section className="practice-panel" aria-label={t('practice.savedLinesAria')}>
          <header className="practice-panel-header">
            <div>
              <strong>{t('practice.localReview')}</strong>
              <span>{t('practice.lineCountOf200', { count: lines.length })}</span>
            </div>
            <div className="practice-panel-actions">
              <button type="button" onClick={() => void exportCsv()} disabled={!api || exporting}>
                {exporting ? t('practice.exporting') : t('practice.exportCsv')}
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label={t('practice.closeReview')}>
                ×
              </button>
            </div>
          </header>
          {status && <p className="practice-status" role="status">{status}</p>}
          <div className="practice-list">
            {lines.map((line) => (
              <article className="practice-card" key={line.id}>
                <button
                  type="button"
                  className="practice-remove"
                  onClick={() => remove(line.id)}
                  aria-label={t('practice.removeLineAria', { text: line.text })}
                  title={t('practice.removeFromReview')}
                >
                  ×
                </button>
                <p className="practice-line">{line.text}</p>
                {line.reading && <p className="practice-reading">{line.reading}</p>}
                {line.ipa && <p className="practice-ipa">{line.ipa}</p>}
                {line.translation && <p className="practice-translation">{line.translation}</p>}
                <small>
                  {line.trackArtist} · {line.trackTitle} · {formatPosition(line.positionMs)}
                </small>
              </article>
            ))}
          </div>
          <p className="practice-privacy">{t('practice.localOnly')}</p>
        </section>
      )}
    </div>
  );
}
