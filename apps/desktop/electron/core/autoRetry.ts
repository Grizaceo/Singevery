// ============================================================================
// AutoRetry — reintento automático de búsqueda de letra con backoff.
// Extraído de stateStore.ts (modularización god file, 2026-08-03).
// ============================================================================

/**
 * Reintentos automáticos de búsqueda de letra. Si una búsqueda termina en
 * NO_LYRICS o ERROR, se reintenta solo (limpiando la caché negativa) con
 * backoff, sin panel de rescate. Acotado por pista para no martillar a los
 * proveedores.
 */
export class AutoRetry {
  private static readonly DELAYS_MS = [4000, 15000];

  private timer: NodeJS.Timeout | null = null;
  private attempt = 0;
  private pending = false;

  get attemptCount(): number {
    return this.attempt;
  }

  get isPending(): boolean {
    return this.pending;
  }

  /** Reinicia el contador de intentos (pista nueva / búsqueda con éxito). */
  reset(): void {
    this.attempt = 0;
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending = false;
  }

  /**
   * Programa un reintento automático de la búsqueda que acaba de fallar.
   * `trackKey` identifica la pista: si cambió cuando el timer dispare, el
   * reintento ya no aplica. `run` dispara la búsqueda; se invoca con try/catch
   * por el llamador.
   */
  schedule(
    trackKey: string,
    currentTrackKey: () => string | null,
    run: () => Promise<void>,
  ): void {
    if (this.attempt >= AutoRetry.DELAYS_MS.length) return;
    const delay = AutoRetry.DELAYS_MS[this.attempt];
    this.pending = true;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.pending = false;
      // La pista cambió mientras esperábamos: el reintento ya no aplica.
      if (currentTrackKey() !== trackKey) return;
      this.attempt += 1;
      run().catch(() => {
        /* el estado ERROR ya quedó reflejado por loadLyricsByMetadata */
      });
    }, delay);
    // No retener el proceso vivo por un reintento pendiente.
    this.timer.unref?.();
  }
}
