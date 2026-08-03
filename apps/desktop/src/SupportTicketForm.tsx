import { useState } from 'react';
import type { FormEvent } from 'react';
import type { SupportTicketCategory, SupportTicketDraft } from './types';

const CATEGORY_OPTIONS: { value: SupportTicketCategory; label: string }[] = [
  { value: 'installation', label: 'Instalación o actualización' },
  { value: 'startup', label: 'Inicio o ventana' },
  { value: 'recognition', label: 'Reconocimiento de canción' },
  { value: 'lyrics', label: 'Letra o sincronización' },
  { value: 'pitch', label: 'Afinación o práctica' },
  { value: 'translation', label: 'Traducción o lectura' },
  { value: 'other', label: 'Otro' },
];

const EMPTY_DRAFT: SupportTicketDraft = {
  category: 'pitch',
  testerAlias: '',
  summary: '',
  actual: '',
  steps: '',
  expected: '',
  includeDiagnostics: true,
};

interface SupportTicketFormProps {
  onStatus: (message: string | null) => void;
}

export function SupportTicketForm({ onStatus }: SupportTicketFormProps) {
  const [draft, setDraft] = useState<SupportTicketDraft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);

  const patch = <K extends keyof SupportTicketDraft>(
    key: K,
    value: SupportTicketDraft[K],
  ): void => setDraft((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!window.api || submitting) return;
    setSubmitting(true);
    onStatus('Preparando ticket…');
    try {
      const result = await window.api.createSupportTicket(draft);
      if (result.canceled) {
        onStatus(null);
      } else if (!result.ok) {
        onStatus(result.error ?? 'No se pudo preparar el ticket');
      } else if (result.issueOpened) {
        onStatus(
          `Ticket ${result.ticketId ?? ''} guardado. GitHub y la carpeta del archivo están abiertos: revisa el JSON y adjúntalo sólo si estás de acuerdo.`,
        );
      } else {
        onStatus(
          `Ticket ${result.ticketId ?? ''} guardado en ${result.path ?? 'el archivo elegido'}. ${result.warning ?? 'No se pudo abrir GitHub; puedes enviarlo manualmente.'}`,
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const ready = draft.summary.trim().length >= 5 && draft.actual.trim().length >= 3;

  return (
    <details className="support-ticket-form">
      <summary>Reportar un problema</summary>
      <p className="settings-hint">
        Crea un JSON local y abre un issue prellenado en GitHub. Nada se adjunta por sí solo: revisa
        el archivo antes de compartirlo. El issue será público si el repositorio es público.
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <label className="settings-label" htmlFor="support-tester">
          Nombre o alias del tester (sólo en el archivo)
        </label>
        <input
          id="support-tester"
          className="settings-text-input"
          type="text"
          maxLength={60}
          value={draft.testerAlias}
          placeholder="Ej. Profe Ana"
          onChange={(event) => patch('testerAlias', event.target.value)}
        />

        <label className="settings-label" htmlFor="support-category">
          Categoría
        </label>
        <select
          id="support-category"
          className="settings-text-input"
          value={draft.category}
          onChange={(event) => patch('category', event.target.value as SupportTicketCategory)}
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label className="settings-label" htmlFor="support-summary">
          Resumen
        </label>
        <input
          id="support-summary"
          className="settings-text-input"
          type="text"
          required
          minLength={5}
          maxLength={120}
          value={draft.summary}
          placeholder="Ej. El afinador salta una octava"
          onChange={(event) => patch('summary', event.target.value)}
        />

        <label className="settings-label" htmlFor="support-actual">
          ¿Qué ocurrió?
        </label>
        <textarea
          id="support-actual"
          className="settings-text-input settings-textarea"
          required
          minLength={3}
          maxLength={2_000}
          rows={3}
          value={draft.actual}
          onChange={(event) => patch('actual', event.target.value)}
        />

        <label className="settings-label" htmlFor="support-steps">
          Pasos para repetirlo (opcional)
        </label>
        <textarea
          id="support-steps"
          className="settings-text-input settings-textarea"
          maxLength={4_000}
          rows={3}
          value={draft.steps}
          placeholder={'1. Abrí…\n2. Pulsé…\n3. Ocurrió…'}
          onChange={(event) => patch('steps', event.target.value)}
        />

        <label className="settings-label" htmlFor="support-expected">
          ¿Qué esperabas? (opcional)
        </label>
        <textarea
          id="support-expected"
          className="settings-text-input settings-textarea"
          maxLength={2_000}
          rows={2}
          value={draft.expected}
          onChange={(event) => patch('expected', event.target.value)}
        />

        <label className="settings-check support-diagnostics-check">
          <input
            type="checkbox"
            checked={draft.includeDiagnostics}
            onChange={(event) => patch('includeDiagnostics', event.target.checked)}
          />
          Incluir diagnóstico y logs recientes redactados en el JSON
        </label>
        <p className="settings-hint">
          Puede incluir metadatos de canciones, nunca audio ni letras completas.
        </p>

        <button type="submit" className="chrome-button" disabled={!ready || submitting}>
          {submitting ? 'Preparando…' : 'Guardar ticket y abrir GitHub'}
        </button>
      </form>
    </details>
  );
}
