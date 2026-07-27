import { describe, it, expect, vi, afterEach } from 'vitest';
import { deadline, isAbortError, seconds } from '../electron/services/http';

afterEach(() => {
  vi.useRealTimers();
});

describe('deadline', () => {
  it('no aborta antes de que venza el plazo', () => {
    vi.useFakeTimers();
    const dl = deadline(1000);

    vi.advanceTimersByTime(999);

    expect(dl.signal.aborted).toBe(false);
    expect(dl.timedOut).toBe(false);
    dl.dispose();
  });

  it('aborta al vencer el plazo y lo marca como timeout', () => {
    vi.useFakeTimers();
    const dl = deadline(1000);

    vi.advanceTimersByTime(1000);

    expect(dl.signal.aborted).toBe(true);
    expect(dl.timedOut).toBe(true);
    dl.dispose();
  });

  it('propaga el abort del signal externo SIN marcarlo como timeout', () => {
    vi.useFakeTimers();
    const external = new AbortController();
    const dl = deadline(1000, external.signal);

    external.abort();

    expect(dl.signal.aborted).toBe(true);
    // Distinguir las dos causas es lo que permite decir "el servicio no
    // respondió" frente a "lo cancelaste tú".
    expect(dl.timedOut).toBe(false);
    dl.dispose();
  });

  it('nace abortado si el signal externo ya venía abortado', () => {
    const external = new AbortController();
    external.abort();

    const dl = deadline(1000, external.signal);

    expect(dl.signal.aborted).toBe(true);
    expect(dl.timedOut).toBe(false);
    dl.dispose();
  });

  it('dispose cancela el temporizador (no aborta después)', () => {
    vi.useFakeTimers();
    const dl = deadline(1000);

    dl.dispose();
    vi.advanceTimersByTime(5000);

    expect(dl.signal.aborted).toBe(false);
    expect(dl.timedOut).toBe(false);
  });

  it('dispose suelta el listener del signal externo', () => {
    const external = new AbortController();
    const remove = vi.spyOn(external.signal, 'removeEventListener');

    const dl = deadline(1000, external.signal);
    dl.dispose();

    expect(remove).toHaveBeenCalled();
  });
});

describe('isAbortError', () => {
  it('reconoce AbortError y TimeoutError', () => {
    expect(isAbortError(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true);
    expect(isAbortError(Object.assign(new Error('x'), { name: 'TimeoutError' }))).toBe(true);
  });

  it('no confunde otros errores', () => {
    expect(isAbortError(new Error('ECONNREFUSED'))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError('AbortError')).toBe(false);
  });
});

describe('seconds', () => {
  it('formatea milisegundos como segundos enteros', () => {
    expect(seconds(15_000)).toBe('15');
    expect(seconds(20_500)).toBe('21');
  });
});
