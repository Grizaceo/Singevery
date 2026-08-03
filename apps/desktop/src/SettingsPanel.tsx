import { useCallback, useEffect, useRef, useState } from 'react';
import type { DisplaySettings, ReadingSettings, RecognitionProviderMode, TranslationSettings } from './types';
import { SupportTicketForm } from './SupportTicketForm';
import {
  type MicrophonePrefs,
  readMicrophonePrefs,
  writeMicrophonePrefs,
} from './audio/micPrefs';
import {
  type WidgetControls,
  readWidgetControls,
  writeWidgetControls,
} from './widgetPrefs';
import './SettingsPanel.css';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  /** Escuchar el audio del sistema al abrir la app (preferencia del renderer). */
  autoStart: boolean;
  onAutoStartChange: (enabled: boolean) => void;
}

const PROVIDER_OPTIONS: { value: RecognitionProviderMode; label: string; hint: string }[] = [
  { value: 'auto', label: 'Auto', hint: 'Shazam gratis primero, AudD como respaldo' },
  { value: 'shazam', label: 'Shazam', hint: 'Cliente no oficial, sin API key' },
  { value: 'audd', label: 'AudD', hint: 'Requiere AUDD_API_TOKEN' },
];

const TRANSLATION_PROVIDERS: {
  value: TranslationSettings['provider'];
  label: string;
  hint: string;
}[] = [
  { value: 'mymemory', label: 'MyMemory', hint: 'Sin clave, listo para usar' },
  { value: 'local', label: 'Modelo local', hint: 'En tu equipo, sin límites' },
  { value: 'deepl', label: 'DeepL', hint: 'Mejor calidad, con tu clave' },
  { value: 'google', label: 'Google', hint: 'Con tu clave' },
];

const TEXT_COLOR_PRESETS: { value: string; label: string }[] = [
  { value: '#ffffff', label: 'Blanco' },
  { value: '#fde047', label: 'Amarillo' },
  { value: '#22d3ee', label: 'Cian' },
  { value: '#4ade80', label: 'Verde' },
  { value: '#f472b6', label: 'Rosa' },
  { value: '#111114', label: 'Negro' },
];

const HANDLE_COLOR_PRESETS: { value: string; label: string }[] = [
  { value: '#000000', label: 'Negro' },
  { value: '#ffffff', label: 'Blanco' },
  { value: '#fde047', label: 'Amarillo' },
  { value: '#22d3ee', label: 'Cian' },
  { value: '#a78bfa', label: 'Violeta' },
  { value: '#f472b6', label: 'Rosa' },
];

const HANDLE_POSITION_PRESETS: { value: number; label: string }[] = [
  { value: 0.06, label: 'Izquierda' },
  { value: 0.5, label: 'Centro' },
  { value: 0.94, label: 'Derecha' },
];

const DEFAULT_DISPLAY: DisplaySettings = {
  opacity: 1,
  fontScale: 1,
  alignment: 'center',
  mirrorMode: false,
  textColor: '#ffffff',
  textColorMode: 'manual',
  handleColor: '#000000',
  handleScale: 1,
  handlePositionX: 0.5,
  lyricsWindowSize: 2,
};

type SettingsTab = 'display' | 'audio' | 'other';

export function SettingsPanel({
  open,
  onClose,
  autoStart,
  onAutoStartChange,
}: SettingsPanelProps) {
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('display');
  const [display, setDisplay] = useState<DisplaySettings>(DEFAULT_DISPLAY);
  const [provider, setProvider] = useState<RecognitionProviderMode>('auto');
  const [translation, setTranslation] = useState<TranslationSettings>({
    provider: 'mymemory',
    apiKey: '',
    targetLang: 'es',
    localEndpoint: 'http://localhost:11434/v1/chat/completions',
    localModel: 'translategemma:4b',
  });
  const [reading, setReading] = useState<ReadingSettings>({ pinyinToneType: 'none' });
  const [diagnosticStatus, setDiagnosticStatus] = useState<string | null>(null);

  // F4: dispositivos de micrófono disponibles + preferencias actuales.
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [micPrefs, setMicPrefs] = useState<MicrophonePrefs>(readMicrophonePrefs);
  const [micLevel, setMicLevel] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const micRafRef = useRef<number | undefined>(undefined);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAudioCtxRef = useRef<AudioContext | null>(null);

  // F5: controles del widget.
  const [widgetControls, setWidgetControls] = useState<WidgetControls>(readWidgetControls);

  useEffect(() => {
    if (!open || !window.api) return;
    void window.api.getDisplaySettings().then((r) => {
      if (r.ok) setDisplay(r.display);
    });
    void window.api.getRecognitionProvider().then((r) => {
      if (r.ok) setProvider(r.provider);
    });
    void window.api.getTranslationSettings().then((r) => {
      if (r.ok) setTranslation(r.translation);
    });
    void window.api.getReadingSettings().then((r) => {
      if (r.ok) setReading(r.reading);
    });
  }, [open]);

  // Al abrir el panel, listar los micrófonos (F4). El selector solo se
  // rellena con permiso de micro concedido (enumerateDevices devuelve
  // labels vacías si no).
  useEffect(() => {
    if (!open) return;
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((devices) => setMicDevices(devices.filter((d) => d.kind === 'audioinput')))
      .catch(() => setMicDevices([]));
  }, [open]);

  const patchMicPrefs = useCallback((partial: Partial<MicrophonePrefs>) => {
    setMicPrefs((prev) => {
      const next = { ...prev, ...partial };
      writeMicrophonePrefs(next);
      return next;
    });
  }, []);

  const patchWidgetControls = useCallback((partial: Partial<WidgetControls>) => {
    setWidgetControls((prev) => {
      const next = { ...prev, ...partial };
      writeWidgetControls(next);
      return next;
    });
  }, []);

  // Medidor de nivel en vivo mientras la pestaña Audio está abierta (F4).
  // Usa las constraints elegidas, así que sirve para probar el ajuste antes
  // de cerrar el panel.
  useEffect(() => {
    if (!open || settingsTab !== 'audio') return;
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
  }, [open, settingsTab, micPrefs]);

  const patchDisplay = useCallback(async (partial: Partial<DisplaySettings>) => {
    if (!window.api) return;
    setDisplay((prev) => ({ ...prev, ...partial }));
    const result = await window.api.setDisplaySettings(partial);
    if (result.ok) setDisplay(result.display);
  }, []);

  const changeProvider = useCallback(async (value: RecognitionProviderMode) => {
    if (!window.api) return;
    setProvider(value);
    const result = await window.api.setRecognitionProvider(value);
    if (result.ok) setProvider(result.provider);
  }, []);

  const patchTranslation = useCallback(async (partial: Partial<TranslationSettings>) => {
    if (!window.api) return;
    setTranslation((prev) => ({ ...prev, ...partial }));
    const result = await window.api.setTranslationSettings(partial);
    if (result.ok) setTranslation(result.translation);
  }, []);

  const patchReading = useCallback(async (partial: Partial<ReadingSettings>) => {
    if (!window.api) return;
    setReading((prev) => ({ ...prev, ...partial }));
    const result = await window.api.setReadingSettings(partial);
    if (result.ok) setReading(result.reading);
  }, []);

  const exportDiagnostics = useCallback(async () => {
    if (!window.api) return;
    setDiagnosticStatus('Preparando diagnóstico…');
    const result = await window.api.exportDiagnostics();
    if (result.ok) setDiagnosticStatus(`Guardado en ${result.path ?? 'el archivo elegido'}`);
    else if (result.canceled) setDiagnosticStatus(null);
    else setDiagnosticStatus(result.error ?? 'No se pudo exportar el diagnóstico');
  }, []);

  const openPrivacy = useCallback(async () => {
    if (!window.api) return;
    const result = await window.api.openPrivacyNotice();
    if (!result.ok) setDiagnosticStatus(result.error ?? 'No se pudo abrir el aviso de privacidad');
  }, []);

  const openBetaGuide = useCallback(async () => {
    if (!window.api) return;
    const result = await window.api.openBetaGuide();
    if (!result.ok) setDiagnosticStatus(result.error ?? 'No se pudo abrir la guía beta');
  }, []);

  if (!open || !window.api) return null;

  // MyMemory no pide credenciales: el campo pasa a ser un email opcional que
  // solo sirve para subir la cuota diaria.
  const isKeyless = translation.provider === 'mymemory';
  const isLocal = translation.provider === 'local';

  return (
    <div className="settings-backdrop" onClick={onClose} role="presentation">
      <div
        className="settings-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Ajustes del teleprompter"
      >
        <header className="settings-header">
          <h2>Ajustes</h2>
          <button type="button" className="chrome-button" onClick={onClose} aria-label="Cerrar ajustes">
            ×
          </button>
        </header>

        {/* F6: navegación por categorías en vez de una lista interminable. */}
        <nav className="settings-tabs" aria-label="Categorías de ajustes">
          {(
            [
              ['display', 'Display'],
              ['audio', 'Audio'],
              ['other', 'Otros'],
            ] as [SettingsTab, string][]
          ).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              className={`settings-tab${settingsTab === tab ? ' active' : ''}`}
              onClick={() => setSettingsTab(tab)}
              aria-pressed={settingsTab === tab}
            >
              {label}
            </button>
          ))}
        </nav>

        {settingsTab === 'display' && (
          <>
            {/* ---------------- Letra: lo que se toca a diario ---------------- */}
            <section className="settings-section">
              <span className="settings-label settings-group-title">Letra</span>

              <label className="settings-label" htmlFor="font-range">
                Tamaño ({display.fontScale.toFixed(1)}×)
              </label>
              <input
                id="font-range"
                type="range"
                min={0.6}
                max={2}
                step={0.1}
                value={display.fontScale}
                onChange={(e) => void patchDisplay({ fontScale: Number(e.target.value) })}
              />

              <label className="settings-label" htmlFor="opacity-range">
                Opacidad ({Math.round(display.opacity * 100)}%)
              </label>
              <input
                id="opacity-range"
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={display.opacity}
                onChange={(e) => void patchDisplay({ opacity: Number(e.target.value) })}
              />

              <span className="settings-label">Color</span>
              <div className="settings-color-row">
                {TEXT_COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className={`settings-color-swatch${display.textColor === preset.value ? ' active' : ''}`}
                    title={preset.label}
                    aria-label={preset.label}
                    onClick={() => void patchDisplay({ textColor: preset.value })}
                  >
                    <span style={{ backgroundColor: preset.value }} />
                  </button>
                ))}
                <label className="settings-color-picker" title="Color personalizado">
                  <input
                    type="color"
                    value={display.textColor}
                    onChange={(e) => void patchDisplay({ textColor: e.target.value.toLowerCase() })}
                  />
                </label>
              </div>

              <label className="settings-label" htmlFor="window-size-range">
                Líneas visibles ({display.lyricsWindowSize} arriba y abajo)
              </label>
              <input
                id="window-size-range"
                type="range"
                min={1}
                max={5}
                step={1}
                value={display.lyricsWindowSize}
                onChange={(e) => void patchDisplay({ lyricsWindowSize: Number(e.target.value) })}
              />
              <p className="settings-hint">
                Más líneas dan margen cuando la sincronía va algo corrida y terminas cantando desde la
                previsualización. El texto se achica solo para que quepa.
              </p>

              <span className="settings-label">Alineación</span>
              <div className="settings-row">
                {(['left', 'center', 'right'] as const).map((align) => (
                  <button
                    key={align}
                    type="button"
                    className={`chrome-button${display.alignment === align ? ' active' : ''}`}
                    onClick={() => void patchDisplay({ alignment: align })}
                  >
                    {align === 'left' ? '←' : align === 'right' ? '→' : '↔'}
                  </button>
                ))}
              </div>
              <p className="settings-hint">
                La letra se muestra centrada por defecto; el layout lado a lado solo se activa con la
                traducción en modo paralelo.
              </p>
            </section>

            {/* ---------------- Handle del widget + botones visibles (F5) ---------------- */}
            <section className="settings-section">
              <span className="settings-label settings-group-title">Widget</span>
              <p className="settings-hint">La pestañita para mover el overlay y qué controles se ven.</p>

              <div className="settings-color-row">
                {HANDLE_COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className={`settings-color-swatch${display.handleColor === preset.value ? ' active' : ''}`}
                    title={preset.label}
                    aria-label={`Handle ${preset.label}`}
                    onClick={() => void patchDisplay({ handleColor: preset.value })}
                  >
                    <span style={{ backgroundColor: preset.value }} />
                  </button>
                ))}
                <label className="settings-color-picker" title="Color personalizado del handle">
                  <input
                    type="color"
                    value={display.handleColor}
                    onChange={(e) => void patchDisplay({ handleColor: e.target.value.toLowerCase() })}
                  />
                </label>
              </div>
              <label className="settings-label" htmlFor="handle-scale-range">
                Tamaño ({display.handleScale.toFixed(1)}×)
              </label>
              <input
                id="handle-scale-range"
                type="range"
                min={0.6}
                max={2}
                step={0.1}
                value={display.handleScale}
                onChange={(e) => void patchDisplay({ handleScale: Number(e.target.value) })}
              />
              <label className="settings-label" htmlFor="handle-position-range">
                Posición horizontal ({Math.round(display.handlePositionX * 100)}%)
              </label>
              <input
                id="handle-position-range"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={display.handlePositionX}
                onChange={(e) => void patchDisplay({ handlePositionX: Number(e.target.value) })}
              />
              <div className="settings-row">
                {HANDLE_POSITION_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className={`chrome-button${Math.abs(display.handlePositionX - preset.value) < 0.03 ? ' active' : ''}`}
                    onClick={() => void patchDisplay({ handlePositionX: preset.value })}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <span className="settings-label">Botones visibles</span>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={widgetControls.reading}
                  onChange={(e) => patchWidgetControls({ reading: e.target.checked })}
                />
                Modos de lectura (原 か ふ A IPA…)
              </label>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={widgetControls.translate}
                  onChange={(e) => patchWidgetControls({ translate: e.target.checked })}
                />
                Traducción (T)
              </label>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={widgetControls.import}
                  onChange={(e) => patchWidgetControls({ import: e.target.checked })}
                />
                Importar letra (↥)
              </label>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={widgetControls.settings}
                  onChange={(e) => patchWidgetControls({ settings: e.target.checked })}
                />
                Ajustes (⚙)
              </label>
            </section>

            {/* ---------------- Extras de lectura ---------------- */}
            <section className="settings-section">
              <span className="settings-label settings-group-title">Extras de lectura</span>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={reading.pinyinToneType === 'symbol'}
                  onChange={(e) =>
                    void patchReading({ pinyinToneType: e.target.checked ? 'symbol' : 'none' })
                  }
                />
                Tonos en el pinyin chino (nǐ hǎo vs ni hao)
              </label>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={display.mirrorMode}
                  onChange={(e) => void patchDisplay({ mirrorMode: e.target.checked })}
                />
                Modo espejo (para proyectar sobre un cristal)
              </label>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={display.textColorMode === 'auto'}
                  onChange={(e) =>
                    void patchDisplay({ textColorMode: e.target.checked ? 'auto' : 'manual' })
                  }
                />
                Color automático según el fondo (experimental)
              </label>
              {display.textColorMode === 'auto' && (
                <p className="settings-hint">
                  Analiza el brillo de la pantalla bajo el widget cada pocos segundos; la imagen se
                  procesa localmente y se descarta. Puede producir un ligero parpadeo, y el widget no
                  aparece en grabaciones mientras esté activo.
                </p>
              )}
            </section>
          </>
        )}

        {settingsTab === 'audio' && (
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
                    onClick={() => void changeProvider(opt.value)}
                  >
                    <strong>{opt.label}</strong>
                    <span>{opt.hint}</span>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {settingsTab === 'other' && (
          <>
            {/* ---------------- Traducción ---------------- */}
            <section className="settings-section">
              <span className="settings-label settings-group-title">Traducción</span>
              <p className="settings-hint">
                Afecta solo al botón T del widget. Reconocer la canción y mostrar la letra funciona sin
                configurar nada.
              </p>
              <div className="settings-provider-list">
                {TRANSLATION_PROVIDERS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`settings-provider-btn${translation.provider === opt.value ? ' active' : ''}`}
                    title={opt.hint}
                    onClick={() => void patchTranslation({ provider: opt.value })}
                  >
                    <strong>{opt.label}</strong>
                    <span>{opt.hint}</span>
                  </button>
                ))}
              </div>

              {isLocal ? (
                <>
                  <p className="settings-hint">
                    Traduce con un modelo en tu propio equipo: sin límite diario, sin internet y sin
                    mandar las letras a nadie. Necesitas un runtime local corriendo — el más simple es{' '}
                    <strong>Ollama</strong>: instálalo y ejecuta{' '}
                    <code>ollama pull translategemma:4b</code> (unos 3 GB, especializado en traducir,
                    55 idiomas). También sirven LM Studio, llama.cpp o Jan.
                  </p>
                  <label className="settings-label" htmlFor="local-model">
                    Modelo
                  </label>
                  <input
                    id="local-model"
                    className="settings-text-input"
                    type="text"
                    value={translation.localModel}
                    placeholder="translategemma:4b"
                    onChange={(e) => void patchTranslation({ localModel: e.target.value })}
                  />
                  <label className="settings-label" htmlFor="local-endpoint">
                    Dirección del runtime
                  </label>
                  <input
                    id="local-endpoint"
                    className="settings-text-input"
                    type="text"
                    value={translation.localEndpoint}
                    placeholder="http://localhost:11434/v1/chat/completions"
                    onChange={(e) => void patchTranslation({ localEndpoint: e.target.value })}
                  />
                  <p className="settings-hint">
                    Por defecto apunta a Ollama. Con un modelo de 4B la canción tarda unos segundos en
                    CPU y es casi instantánea con GPU.
                  </p>
                </>
              ) : isKeyless ? (
                <>
                  <label className="settings-label" htmlFor="translation-key">
                    Tu email (opcional)
                  </label>
                  <input
                    id="translation-key"
                    className="settings-text-input"
                    type="email"
                    value={translation.apiKey}
                    placeholder="tucorreo@ejemplo.com"
                    onChange={(e) => void patchTranslation({ apiKey: e.target.value })}
                  />
                  <p className="settings-hint">
                    MyMemory funciona sin nada, con un tope de ~5.000 caracteres al día (unas 3
                    canciones). Poner un email válido lo sube a 50.000 (~30 canciones). No se envía a
                    ningún otro sitio.
                  </p>
                </>
              ) : (
                <>
                  <label className="settings-label" htmlFor="translation-key">
                    API key
                  </label>
                  <input
                    id="translation-key"
                    className="settings-text-input"
                    type="password"
                    value={translation.apiKey}
                    placeholder={translation.provider === 'deepl' ? 'DeepL auth key' : 'Google API key'}
                    onChange={(e) => void patchTranslation({ apiKey: e.target.value })}
                  />
                </>
              )}

              <label className="settings-label" htmlFor="translation-lang">
                Idioma destino
              </label>
              <input
                id="translation-lang"
                className="settings-text-input"
                type="text"
                value={translation.targetLang}
                placeholder="es"
                onChange={(e) => void patchTranslation({ targetLang: e.target.value })}
              />
            </section>

            {/* ---------------- Ayuda y beta ---------------- */}
            <section className="settings-section settings-support">
              <span className="settings-label settings-group-title">Ayuda y beta</span>
              <div className="settings-row settings-support-actions">
                <button type="button" className="chrome-button" onClick={() => void openBetaGuide()}>
                  Guía para testers
                </button>
                <button type="button" className="chrome-button" onClick={() => void exportDiagnostics()}>
                  Exportar diagnóstico
                </button>
                <button type="button" className="chrome-button" onClick={() => void openPrivacy()}>
                  Privacidad
                </button>
              </div>
              <p className="settings-hint">
                El diagnóstico guarda versión, estado técnico y logs redactados. No incluye audio ni
                letras completas.
              </p>
              <SupportTicketForm onStatus={setDiagnosticStatus} />
              {diagnosticStatus && (
                <p className="settings-hint settings-support-status" role="status">
                  {diagnosticStatus}
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
