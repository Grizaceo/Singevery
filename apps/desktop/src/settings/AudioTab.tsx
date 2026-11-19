// ============================================================================
// AudioTab.tsx — ajustes de audio (Al abrir + Micrófono + Motor).
// Extraído de SettingsPanel.tsx (modularización god file, 2026-08-03).
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import type { RecognitionProviderMode } from '../types';
import type { MicrophonePrefs } from '../audio/micPrefs';
import type { MessageKey } from '../i18n';
import { useT } from '../i18n/useT';

export interface AudioTabProps {
  autoStart: boolean;
  onAutoStartChange: (enabled: boolean) => void;
  provider: RecognitionProviderMode;
  changeProvider: (value: RecognitionProviderMode) => void;
  micPrefs: MicrophonePrefs;
  patchMicPrefs: (partial: Partial<MicrophonePrefs>) => void;
}

const PROVIDER_OPTIONS: { value: RecognitionProviderMode; label: string; hint: MessageKey }[] = [
  { value: 'auto', label: 'Auto', hint: 'settingsMore.providerAutoHint' },
  { value: 'shazam', label: 'Shazam', hint: 'settingsMore.providerShazamHint' },
  { value: 'audd', label: 'AudD', hint: 'settingsMore.providerAuddHint' },
];

export function AudioTab({
  autoStart,
  onAutoStartChange,
  provider,
  changeProvider,
  micPrefs,
  patchMicPrefs,
}: AudioTabProps) {
  const t = useT();
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
            ? window.api?.platform === 'linux'
              ? t('settingsMore.micErrorLinuxDenied')
              : t('settingsMore.micErrorDenied')
            : t('settingsMore.micErrorOpen'),
        );
      }
    };

    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [micPrefs, t]);

  return (
    <>
      {/* ---------------- Al abrir ---------------- */}
      <section className="settings-section">
        <span className="settings-label settings-group-title">{t('settingsMore.onOpen')}</span>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={autoStart}
            onChange={(e) => onAutoStartChange(e.target.checked)}
          />
          {t('settingsMore.autoStartLabel')}
        </label>
        <p className="settings-hint">{t('settingsMore.autoStartHint')}</p>
      </section>

      {/* ---------------- Micrófono (F4) ---------------- */}
      <section className="settings-section">
        <span className="settings-label settings-group-title">{t('settingsMore.micSection')}</span>
        <p className="settings-hint">{t('settingsMore.micHint')}</p>

        <label className="settings-label" htmlFor="mic-device">
          {t('settingsMore.micDevice')}
        </label>
        <select
          id="mic-device"
          className="settings-text-input"
          value={micPrefs.deviceId ?? ''}
          onChange={(e) => patchMicPrefs({ deviceId: e.target.value || undefined })}
        >
          <option value="">{t('settingsMore.micDefault')}</option>
          {micDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || t('settingsMore.micFallback', { value: d.deviceId.slice(0, 8) })}
            </option>
          ))}
        </select>
        {micDevices.length === 0 && (
          <p className="settings-hint">{t('settingsMore.micNoDevices')}</p>
        )}

        <span className="settings-label">{t('settingsMore.micNoiseGroup')}</span>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={micPrefs.noiseSuppression}
            onChange={(e) => patchMicPrefs({ noiseSuppression: e.target.checked })}
          />
          {t('settingsMore.micNoiseReduction')}
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={micPrefs.echoCancellation}
            onChange={(e) => patchMicPrefs({ echoCancellation: e.target.checked })}
          />
          {t('settingsMore.micEchoCancellation')}
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={micPrefs.autoGainControl}
            onChange={(e) => patchMicPrefs({ autoGainControl: e.target.checked })}
          />
          {t('settingsMore.micAutoGain')}
        </label>

        <span className="settings-label">{t('settingsMore.micLiveLevel')}</span>
        <div className="settings-mic-meter" role="meter" aria-label={t('settingsMore.micLevelAria')}>
          <div
            className="settings-mic-meter-fill"
            style={{ width: `${Math.min(100, Math.round(micLevel * 100))}%` }}
          />
        </div>
        {micError && <p className="settings-hint settings-error-text">{micError}</p>}
      </section>

      {/* ---------------- Motor de reconocimiento ---------------- */}
      <section className="settings-section">
        <span className="settings-label settings-group-title">{t('settingsMore.engine')}</span>
        <div className="settings-provider-list">
          {PROVIDER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`settings-provider-btn${provider === opt.value ? ' active' : ''}`}
              title={t(opt.hint)}
              onClick={() => changeProvider(opt.value)}
            >
              <strong>{opt.label}</strong>
              <span>{t(opt.hint)}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
