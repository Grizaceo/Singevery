import React from 'react';
import { RenderModel } from './types';
import './Teleprompter.css';

interface Props {
    model: RenderModel;
}

export const Teleprompter: React.FC<Props> = ({ model }) => {
    const containerStyle: React.CSSProperties = {
        transform: model.mirror_mode ? 'scaleX(-1)' : 'none',
        opacity: model.opacity,
        textAlign: model.alignment,
    };

    const fontSize = `${4 * model.font_scale}rem`;

    return (
        <div className="teleprompter-container" style={containerStyle}>
            <div className="status-indicator">{model.status}</div>

            <div className="lyrics-display">
                <div className="lyrics-previous">
                    {model.previous_lines.map((line, i) => (
                        <p key={`prev-${i}`}>{line}</p>
                    ))}
                </div>

                <div className="lyrics-current" style={{ fontSize }}>
                    <p>{model.current_line}</p>
                </div>

                <div className="lyrics-next">
                    {model.next_lines.map((line, i) => (
                        <p key={`next-${i}`}>{line}</p>
                    ))}
                </div>
            </div>

            {(model.track_title || model.track_artist) && (
                <div className="track-info">
                    <h2>{model.track_title}</h2>
                    <h3>{model.track_artist}</h3>
                </div>
            )}
        </div>
    );
};
