import { randomBytes } from 'node:crypto';
import type { SupportTicketCategory, SupportTicketDraft } from '../../src/types';

const CATEGORIES: Record<SupportTicketCategory, string> = {
  installation: 'Instalación o actualización',
  startup: 'Inicio o ventana',
  recognition: 'Reconocimiento de canción',
  lyrics: 'Letra o sincronización',
  pitch: 'Afinación o práctica',
  translation: 'Traducción o lectura',
  other: 'Otro',
};

const LIMITS = {
  testerAlias: 60,
  summary: 120,
  actual: 2_000,
  steps: 4_000,
  expected: 2_000,
} as const;

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\0/g, '').replace(/\r\n?/g, '\n').trim().slice(0, maxLength);
}

export function validateSupportTicketDraft(
  input: unknown,
): { ok: true; value: SupportTicketDraft } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'El reporte no tiene un formato válido' };
  }

  const raw = input as Record<string, unknown>;
  const category = raw.category as SupportTicketCategory;
  if (!Object.hasOwn(CATEGORIES, category)) {
    return { ok: false, error: 'Selecciona una categoría válida' };
  }

  const value: SupportTicketDraft = {
    category,
    testerAlias: cleanText(raw.testerAlias, LIMITS.testerAlias),
    summary: cleanText(raw.summary, LIMITS.summary),
    actual: cleanText(raw.actual, LIMITS.actual),
    steps: cleanText(raw.steps, LIMITS.steps),
    expected: cleanText(raw.expected, LIMITS.expected),
    includeDiagnostics: raw.includeDiagnostics !== false,
  };

  if (value.summary.length < 5) {
    return { ok: false, error: 'Resume el problema en al menos 5 caracteres' };
  }
  if (value.actual.length < 3) {
    return { ok: false, error: 'Describe qué ocurrió' };
  }
  return { ok: true, value };
}

export function createSupportTicketId(
  now = new Date(),
  suffix = randomBytes(2).toString('hex').toUpperCase(),
): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const safeSuffix = suffix.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6) || '0000';
  return `BETA-${date}-${safeSuffix}`;
}

export function supportCategoryLabel(category: SupportTicketCategory): string {
  return CATEGORIES[category];
}

export function buildSupportIssueUrl(
  baseUrl: string,
  draft: SupportTicketDraft,
  ticketId: string,
  appVersion: string,
  platformLabel: string,
): string {
  const url = new URL(baseUrl);
  const excerpt = (value: string, length: number): string =>
    value.length > length ? `${value.slice(0, length - 1)}…` : value;
  const optional = (label: string, value: string, length: number): string =>
    value ? `\n### ${label}\n${excerpt(value, length)}\n` : '';

  url.searchParams.set('title', `[Beta][${supportCategoryLabel(draft.category)}] ${draft.summary}`);
  url.searchParams.set(
    'body',
    `### Ticket\n${ticketId}\n\n` +
      `### Versión\nSingevery ${appVersion} · ${platformLabel}\n\n` +
      `### Qué ocurrió\n${excerpt(draft.actual, 500)}\n` +
      optional('Pasos para reproducirlo', draft.steps, 600) +
      optional('Qué esperaba', draft.expected, 400) +
      '\n### Archivo de diagnóstico\n' +
      `Adjuntar únicamente si fue revisado: Singevery-ticket-${ticketId}.json\n\n` +
      '> Este issue fue preparado por Singevery; el archivo no se subió automáticamente.',
  );
  return url.toString();
}

export function buildSupportTicketFile(
  draft: SupportTicketDraft,
  ticketId: string,
  generatedAt: string,
  diagnostics: unknown | null,
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    ticketId,
    generatedAt,
    report: {
      category: draft.category,
      categoryLabel: supportCategoryLabel(draft.category),
      testerAlias: draft.testerAlias || null,
      summary: draft.summary,
      actual: draft.actual,
      steps: draft.steps || null,
      expected: draft.expected || null,
    },
    privacy: {
      uploadedAutomatically: false,
      includesDiagnostics: diagnostics !== null,
      notice:
        'Revisa este archivo antes de adjuntarlo. Puede contener metadatos de canciones y logs técnicos redactados; nunca contiene audio.',
    },
    diagnostics,
  };
}
