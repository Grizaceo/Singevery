import { useState } from 'react';
import type { FormEvent } from 'react';
import type { SupportTicketCategory, SupportTicketDraft } from './types';
import type { MessageKey } from './i18n';
import { useT } from './i18n/useT';

const CATEGORY_OPTIONS: { value: SupportTicketCategory; label: MessageKey }[] = [
  { value: 'installation', label: 'practice.cat.installation' },
  { value: 'startup', label: 'practice.cat.startup' },
  { value: 'recognition', label: 'practice.cat.recognition' },
  { value: 'lyrics', label: 'practice.cat.lyrics' },
  { value: 'pitch', label: 'practice.cat.pitch' },
  { value: 'translation', label: 'practice.cat.translation' },
  { value: 'other', label: 'practice.cat.other' },
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
  const t = useT();
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
    onStatus(t('practice.preparingTicket'));
    try {
      const result = await window.api.createSupportTicket(draft);
      if (result.canceled) {
        onStatus(null);
      } else if (!result.ok) {
        onStatus(result.error ?? t('practice.ticketFailed'));
      } else if (result.issueOpened) {
        onStatus(
          t('practice.ticketSavedOpened', { id: result.ticketId ?? '' }),
        );
      } else {
        onStatus(
          t('practice.ticketSavedPath', {
            id: result.ticketId ?? '',
            path: result.path ?? t('practice.chosenFile'),
            warning: result.warning ?? t('practice.githubOpenFailed'),
          }),
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const ready = draft.summary.trim().length >= 5 && draft.actual.trim().length >= 3;

  return (
    <details className="support-ticket-form">
      <summary>{t('practice.reportProblem')}</summary>
      <p className="settings-hint">
        {t('practice.formHint')}
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <label className="settings-label" htmlFor="support-tester">
          {t('practice.testerLabel')}
        </label>
        <input
          id="support-tester"
          className="settings-text-input"
          type="text"
          maxLength={60}
          value={draft.testerAlias}
          placeholder={t('practice.testerPlaceholder')}
          onChange={(event) => patch('testerAlias', event.target.value)}
        />

        <label className="settings-label" htmlFor="support-category">
          {t('practice.categoryLabel')}
        </label>
        <select
          id="support-category"
          className="settings-text-input"
          value={draft.category}
          onChange={(event) => patch('category', event.target.value as SupportTicketCategory)}
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </select>

        <label className="settings-label" htmlFor="support-summary">
          {t('practice.summaryLabel')}
        </label>
        <input
          id="support-summary"
          className="settings-text-input"
          type="text"
          required
          minLength={5}
          maxLength={120}
          value={draft.summary}
          placeholder={t('practice.summaryPlaceholder')}
          onChange={(event) => patch('summary', event.target.value)}
        />

        <label className="settings-label" htmlFor="support-actual">
          {t('practice.actualLabel')}
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
          {t('practice.stepsLabel')}
        </label>
        <textarea
          id="support-steps"
          className="settings-text-input settings-textarea"
          maxLength={4_000}
          rows={3}
          value={draft.steps}
          placeholder={t('practice.stepsPlaceholder')}
          onChange={(event) => patch('steps', event.target.value)}
        />

        <label className="settings-label" htmlFor="support-expected">
          {t('practice.expectedLabel')}
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
          {t('practice.diagnosticsLabel')}
        </label>
        <p className="settings-hint">
          {t('practice.diagnosticsHint')}
        </p>

        <button type="submit" className="chrome-button" disabled={!ready || submitting}>
          {submitting ? t('practice.preparing') : t('practice.submitTicket')}
        </button>
      </form>
    </details>
  );
}
