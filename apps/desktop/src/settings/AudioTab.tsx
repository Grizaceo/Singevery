// ============================================================================
// AudioTab.tsx — ajustes de audio (Al abrir + Micrófono + Motor).
// Extraído de SettingsPanel.tsx (modularización god file, 2026-08-03).
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import type { RecognitionProviderMode } from '../types';
import type { MicrophonePrefs } from '../audio/micPrefs';

export interface AudioTabProps {
  autoStart: boolean;
  onAutoStartChange: (enabled: boolean) => void;
  provider: RecognitionProviderMode;
  changeProvider: (value: RecognitionProviderMode) => void;
  micPrefs: MicrophonePrefs;
  patchMicPrefs: (partial: Partial<MicrophonePrefs>) => void;
}

const PROVIDER_OPTIONS: { value: RecognitionProviderMode; label: string; hint: string }[] = [
  { value: 'auto', label: 'Auto', hint: 'Shazam gratis primero, AudD como respaldo' },
  { value: 'shazam', label: 'Shazam', hint: 'Cliente no oficial, sin API key' },
  { value: 'audd', label: 'AudD', hint: 'Requiere AUDD_API_TOKEN' },
];

export function AudioTab({
  autoStart,
  onAutoStartChange,
  provider,
  changeProvider,
  micPrefs,
  patchMicPrefs,
}: AudioTabProps) {
  // F4: dispositivos de micrófono disponibles.
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [micLevel, setMicLevel] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const micRafRef = useRef<number | undefined>(undefined);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAudioCtxRef = useRef<AudioContext | null>(null);

  // Listar los micrófonos al montar (F4). El selector solo se rellena con
  // permiso de micro concedido (enumerateDevices devuelve labels vacías si no).
  useEffect(() => {
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((devices) => setMicDevices(devices.filter((d) => d.kind === 'audioinput')))
      .catch(() => setMicDevices([]));
  }, []);

  // Medidor de nivel en vivo (F4). Usa las constraints elegidas, así que
  // sirve para probar el ajuste antes de cerrar el panel.
  useEffect(() => {
    let cancelled = false;

    const stop = () => {
      if (micRafRef.current !== undefined) cancelAnimationFrame(micRafRef.current);
      micRafRef.current = undefined;
      void micAudioCtxRef.current?.close().catch(() => undefined);
      micAudioCtxRef.current = null;
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      setMicLevel(0);
    };

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: micPrefs.deviceId ?? undefined,
            noiseSuppression: micPrefs.noiseSuppression,
            echoCancellation: micPrefs.echoCancellation,
            autoGainControl: micPrefs.autoGainControl,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        micStreamRef.current = stream;
        setMicError(null);
        const ctx = new AudioContext();
        micAudioCtxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (cancelled) return;
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (let i = 0; i < data.length; i += 1) {
            const v = Math.abs(data[i] - 128) / 128;
            if (v > peak) peak = v;
          }
          // Curva suave: el RMS de pico crudo parpadea mucho.
          setMicLevel((prev) => prev * 0.7 + peak * 0.3);
          micRafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch (err) {
        if (cancelled) return;
        setMicError(
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Permiso de micrófono denegado. Concede acceso en Ajustes de Windows.'
            : 'No se pudo abrir el micrófono. Revisa que no esté en uso por otra app.',
        );
      }
    };

    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [micPrefs]);

  return (
    <>
      {/* ---------------- Al abrir ---------------- */}
      <section className="settings-section">
        <span className="settings-label settings-group-title">Al abrir</span>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={autoStart}
            onChange={(e) => onAutoStartChange(e.target.checked)}
          />
          Empezar a escuchar el audio del sistema
        </label>
        <p className="settings-hint">
          Si lo desactivas, tendrás que pulsar SING (o Ctrl+Alt+S) cada vez. El micrófono nunca
          se activa solo. En una instalación nueva esta opción viene desactivada.
        </p>
      </section>

      {/* ---------------- Micrófono (F4) ---------------- */}
      <section className="settings-section">
        <span className="settings-label settings-group-title">Micrófono</span>
        <p className="settings-hint">
          El dispositivo elegido se usa para la práctica con micrófono y el medidor de tono. El
          reconocimiento de canciones usa el audio del sistema, no este micrófono.
        </p>

        <label className="settings-label" htmlFor="mic-device">
          Dispositivo
        </label>
        <select
          id="mic-device"
          className="settings-text-input"
          value={micPrefs.deviceId ?? ''}
          onChange={(e) => patchMicPrefs({ deviceId: e.target.value || undefined })}
        >
          <option value="">Predeterminado del sistema</option>
          {micDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Micrófono ${d.deviceId.slice(0, 8)}`}
            </option>
          ))}
        </select>
        {micDevices.length === 0 && (
          <p className="settings-hint">
            No se ven dispositivos: el listado requiere permiso de micrófono (se pide al usar la
            práctica por primera vez).
          </p>
        )}

        <span className="settings-label">Ajustes de oclusión ambiental</span>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={micPrefs.noiseSuppression}
            onChange={(e) => patchMicPrefs({ noiseSuppression: e.target.checked })}
          />
          Reducción de ruido
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={micPrefs.echoCancellation}
            onChange={(e) => patchMicPrefs({ echoCancellation: e.target.checked })}
          />
          Cancelación de eco
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={micPrefs.autoGainControl}
            onChange={(e) => patchMicPrefs({ autoGainControl: e.target.checked })}
          />
          Ganancia automática
        </label>

        <span className="settings-label">Nivel en vivo</span>
        <div className="settings-mic-meter" role="meter" aria-label="Nivel de micrófono">
          <div
            className="settings-mic-meter-fill"
            style={{ width: `${Math.min(100, Math.round(micLevel * 100))}%` }}
          />
        </div>
        {micError && <p className="settings-hint settings-error-text">{micError}</p>}
      </section>

      {/* ---------------- Motor de reconocimiento ---------------- */}
      <section className="settings-section">
        <span className="settings-label settings-group-title">Motor de reconocimiento</span>
        <div className="settings-provider-list">
          {PROVIDER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`settings-provider-btn${provider === opt.value ? ' active' : ''}`}
              title={opt.hint}
              onClick={() => changeProvider(opt.value)}
            >
              <strong>{opt.label}</strong>
              <span>{opt.hint}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
