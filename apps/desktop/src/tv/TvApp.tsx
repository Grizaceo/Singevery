import { Teleprompter } from '../teleprompter/Teleprompter';
import { useRemoteModel } from './useRemoteModel';
import './tv.css';

export function TvApp() {
  const { model, connected, error } = useRemoteModel();

  const tvModel = {
    ...model,
    font_scale: model.font_scale * 1.35,
    opacity: 1,
  };

  return (
    <div className="tv-root">
      <div className="tv-status-bar">
        <span className={`tv-status-dot${connected ? ' online' : ''}`} />
        {connected ? 'Conectado al PC' : error ?? 'Reconectando…'}
      </div>
      <div className="tv-stage">
        <Teleprompter model={tvModel} readingMode="original" showTranslation chromeHidden ghost={false} />
      </div>
    </div>
  );
}
