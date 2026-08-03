import { describe, expect, it } from 'vitest';
import {
  buildSupportIssueUrl,
  buildSupportTicketFile,
  createSupportTicketId,
  validateSupportTicketDraft,
} from '../electron/services/supportTicket';

describe('supportTicket', () => {
  const validDraft = {
    category: 'pitch' as const,
    testerAlias: 'Profe 1',
    summary: 'El tono salta al cantar',
    actual: 'El indicador cambia una octava aunque sostengo la nota.',
    steps: 'Abrir práctica\nCantar un La3',
    expected: 'Que se mantenga cerca de La3.',
    includeDiagnostics: true,
  };

  it('normaliza y limita un reporte recibido por IPC', () => {
    const result = validateSupportTicketDraft({
      ...validDraft,
      summary: `  ${'x'.repeat(140)}\0  `,
      steps: 'uno\r\ndos',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.summary).toHaveLength(120);
    expect(result.value.summary).not.toContain('\0');
    expect(result.value.steps).toBe('uno\ndos');
  });

  it('rechaza categorías y descripciones vacías', () => {
    expect(validateSupportTicketDraft({ ...validDraft, category: 'secret' }).ok).toBe(false);
    expect(validateSupportTicketDraft({ ...validDraft, actual: ' ' }).ok).toBe(false);
  });

  it('genera un id estable y una URL sin adjuntar datos automáticamente', () => {
    const id = createSupportTicketId(new Date('2026-08-02T12:00:00Z'), 'a-1!b');
    expect(id).toBe('BETA-20260802-A1B');
    const url = new URL(
      buildSupportIssueUrl(
        'https://github.com/Grizaceo/Singevery/issues/new',
        validDraft,
        id,
        '0.2.1-beta.1',
        'win32 x64',
      ),
    );
    expect(url.hostname).toBe('github.com');
    expect(url.searchParams.get('title')).toContain(validDraft.summary);
    expect(url.searchParams.get('body')).toContain('no se subió automáticamente');
    expect(url.searchParams.get('body')).not.toContain(validDraft.testerAlias);
  });

  it('marca explícitamente si el archivo incluye diagnósticos', () => {
    const file = buildSupportTicketFile(
      validDraft,
      'BETA-20260802-1234',
      '2026-08-02T12:00:00.000Z',
      null,
    );
    expect(file.diagnostics).toBeNull();
    expect(file.privacy).toMatchObject({ uploadedAutomatically: false, includesDiagnostics: false });
  });
});
