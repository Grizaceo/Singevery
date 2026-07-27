import React from 'react';
import type { RenderModel } from '../types';
import { STATUS_LABEL } from './teleprompterHelpers';

interface TrackHeaderProps {
  model: RenderModel;
  chromeHidden?: boolean;
}

/**
 * Título / artista / estado de la pista.
 *
 * Vive DENTRO de la barra superior como elemento central del flex, no flotando
 * en absoluto sobre ella: así el layout reparte el ancho entre los controles
 * de ventana (izquierda), este bloque (centro) y los de lectura (derecha), y
 * es imposible que se solapen por muy angosta que quede la ventana o por muy
 * largo que sea el título. El texto se trunca con elipsis antes que empujar a
 * los botones.
 */
export const TrackHeader = React.memo(function TrackHeader({
  model,
  chromeHidden = false,
}: TrackHeaderProps) {
  const title = model.track_title?.trim();
  const artist = model.track_artist?.trim();
  const statusLabel = STATUS_LABEL[model.status] ?? model.status;
  const hasTrack = !!(title || artist);

  if (!hasTrack && !statusLabel) return null;

  // Título y artista en una sola línea: en una barra, dos líneas la engordan
  // y roban altura a la letra.
  const line = hasTrack ? [title, artist].filter(Boolean).join(' — ') : '';

  return (
    <div
      className={`track-header${chromeHidden ? ' is-hidden' : ''}`}
      title={hasTrack ? `${line}${statusLabel ? ` · ${statusLabel}` : ''}` : statusLabel}
    >
      {hasTrack && <span className="track-header-title">{line}</span>}
      {statusLabel && <span className="track-header-status">{statusLabel}</span>}
    </div>
  );
});
