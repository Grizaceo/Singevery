import type { Session } from 'electron';

/** CSP estricta para builds empaquetados (file://). */
export const PRODUCTION_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; media-src blob: mediastream:; img-src 'self' data:;";

/** Refuerza CSP en respuestas file:// (el meta tag en index.html también aplica). */
export function setupContentSecurityPolicy(session: Session): void {
  session.webRequest.onHeadersReceived((details, callback) => {
    if (!details.url.startsWith('file://')) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }

    const headers = { ...details.responseHeaders };
    headers['Content-Security-Policy'] = [PRODUCTION_CSP];
    callback({ responseHeaders: headers });
  });
}
