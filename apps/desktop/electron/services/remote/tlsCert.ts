import * as fs from 'fs';
import * as path from 'path';
import selfsigned from 'selfsigned';
import { getLocalIpv4Addresses } from './localIp';

export interface TlsMaterial {
  key: string;
  cert: string;
}

const CERT_FILE = 'remote-server.crt';
const KEY_FILE = 'remote-server.key';

function buildSanAltNames(): Array<{ type: 2 | 7; value?: string; ip?: string }> {
  const altNames: Array<{ type: 2 | 7; value?: string; ip?: string }> = [
    { type: 2, value: 'localhost' },
    { type: 2, value: 'singevery.local' },
  ];
  for (const ip of getLocalIpv4Addresses()) {
    altNames.push({ type: 7, ip });
  }
  return altNames;
}

async function generateCert(): Promise<TlsMaterial> {
  const attrs = [{ name: 'commonName', value: 'Singevery Remote' }];
  const pems = await selfsigned.generate(attrs, {
    notAfterDate: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000),
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      {
        name: 'subjectAltName',
        altNames: buildSanAltNames(),
      },
    ],
  });
  return { key: pems.private, cert: pems.cert };
}

/**
 * Certificado TLS autofirmado persistido en userData.
 * Se regenera si faltan archivos o si cambian las IPs locales (SAN).
 */
export async function loadOrCreateTlsCert(certDir: string): Promise<TlsMaterial> {
  fs.mkdirSync(certDir, { recursive: true });
  const certPath = path.join(certDir, CERT_FILE);
  const keyPath = path.join(certDir, KEY_FILE);
  const metaPath = path.join(certDir, 'remote-server-san.json');

  const currentIps = getLocalIpv4Addresses().sort().join(',');
  let cachedIps = '';
  try {
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as { ips?: string };
      cachedIps = meta.ips ?? '';
    }
  } catch {
    cachedIps = '';
  }

  const filesExist = fs.existsSync(certPath) && fs.existsSync(keyPath);
  if (filesExist && cachedIps === currentIps) {
    return {
      key: fs.readFileSync(keyPath, 'utf8'),
      cert: fs.readFileSync(certPath, 'utf8'),
    };
  }

  const material = await generateCert();
  fs.writeFileSync(keyPath, material.key, 'utf8');
  fs.writeFileSync(certPath, material.cert, 'utf8');
  fs.writeFileSync(metaPath, JSON.stringify({ ips: currentIps, generatedAt: Date.now() }), 'utf8');
  return material;
}
