import { useCallback, useEffect, useState } from 'react';
import type { RemoteStatus } from './types';

const EMPTY_STATUS: RemoteStatus = {
  enabled: false,
  running: false,
  micConnected: false,
  tvUrl: '',
  micUrl: '',
  ip: '',
  port: 5175,
};

export function useRemoteStatus(): {
  status: RemoteStatus;
  setEnabled: (enabled: boolean) => Promise<{ ok: boolean; error?: string }>;
  refresh: () => Promise<void>;
} {
  const [status, setStatus] = useState<RemoteStatus>(EMPTY_STATUS);

  const refresh = useCallback(async () => {
    if (!window.api?.getRemoteStatus) return;
    const result = await window.api.getRemoteStatus();
    if (result.ok) {
      setStatus({
        enabled: result.enabled,
        running: result.running,
        micConnected: result.micConnected,
        tvUrl: result.tvUrl,
        micUrl: result.micUrl,
        ip: result.ip,
        port: result.port,
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (!window.api?.onRemoteStatus) return;
    return window.api.onRemoteStatus((next) => setStatus(next));
  }, [refresh]);

  const setEnabled = useCallback(
    async (enabled: boolean): Promise<{ ok: boolean; error?: string }> => {
      if (!window.api?.setRemoteEnabled) {
        return { ok: false, error: 'API no disponible' };
      }
      const result = await window.api.setRemoteEnabled(enabled);
      if (result.ok) setStatus(result.status);
      return { ok: result.ok, error: result.error };
    },
    [],
  );

  return { status, setEnabled, refresh };
}
