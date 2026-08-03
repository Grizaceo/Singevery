import { useMemo, useState } from 'react';
import type { DesktopApi, RenderModel } from './types';
import { savedLineFromModel, savedLinesToCsv, useSavedLines } from './useSavedLines';

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
      if (!result.canceled) setStatus(result.ok ? 'CSV exportado' : result.error ?? 'Error al exportar');
    } catch {
      setStatus('Error al exportar');
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
        title={recallHidden ? 'Revelar letra actual' : 'Ocultar letra para practicar de oído'}
        aria-label={recallHidden ? 'Revelar letra actual' : 'Ocultar letra para practicar de oído'}
      >
        {recallHidden ? '◉' : '◌'}
      </button>
      <button
        type="button"
        className={`chrome-button${currentSaved ? ' active' : ''}`}
        disabled={!current}
        onClick={() => current && toggle(current)}
        title={currentSaved ? 'Quitar línea de repaso' : 'Guardar línea para repasar'}
        aria-label={currentSaved ? 'Quitar línea de repaso' : 'Guardar línea para repasar'}
      >
        {currentSaved ? '★' : '☆'}
      </button>
      <button
        type="button"
        className={`chrome-button practice-review-button${open ? ' active' : ''}`}
        disabled={lines.length === 0}
        onClick={() => setOpen((value) => !value)}
        title="Repasar líneas guardadas"
        aria-label={`Repasar ${lines.length} líneas guardadas`}
      >
        Repaso {lines.length}
      </button>

      {open && (
        <section className="practice-panel" aria-label="Líneas guardadas para repaso">
          <header className="practice-panel-header">
            <div>
              <strong>Repaso local</strong>
              <span>{lines.length} de 200 líneas</span>
            </div>
            <div className="practice-panel-actions">
              <button type="button" onClick={() => void exportCsv()} disabled={!api || exporting}>
                {exporting ? 'Exportando…' : 'Exportar CSV'}
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar repaso">
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
                  aria-label={`Quitar ${line.text}`}
                  title="Quitar del repaso"
                >
                  ×
                </button>
                <p className="practice-line">{line.text}</p>
                {line.reading && <p className="practice-reading">{line.reading}</p>}
                {line.translation && <p className="practice-translation">{line.translation}</p>}
                <small>
                  {line.trackArtist} · {line.trackTitle} · {formatPosition(line.positionMs)}
                </small>
              </article>
            ))}
          </div>
          <p className="practice-privacy">Se guarda sólo en este equipo.</p>
        </section>
      )}
    </div>
  );
}
