import { describe, it, expect } from 'vitest';
import { getLocalIpv4Addresses, getPrimaryLocalIp } from '../electron/services/remote/localIp';

describe('localIp', () => {
  it('getPrimaryLocalIp devuelve una IPv4 o localhost', () => {
    const ip = getPrimaryLocalIp();
    expect(typeof ip).toBe('string');
    expect(ip.length).toBeGreaterThan(0);
  });

  it('getLocalIpv4Addresses no incluye loopback', () => {
    const ips = getLocalIpv4Addresses();
    expect(ips.every((ip) => ip !== '127.0.0.1')).toBe(true);
  });
});
