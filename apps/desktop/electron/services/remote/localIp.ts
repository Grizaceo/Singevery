import * as os from 'os';

/** Direcciones IPv4 locales (no loopback) en interfaces activas. */
export function getLocalIpv4Addresses(): string[] {
  const ips: string[] = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

/** Primera IPv4 LAN útil; fallback a localhost. */
export function getPrimaryLocalIp(): string {
  return getLocalIpv4Addresses()[0] ?? '127.0.0.1';
}
