import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { RenderModel } from '../../../src/types';
import { loadOrCreateTlsCert } from './tlsCert';
import { getPrimaryLocalIp } from './localIp';

export const REMOTE_PORT = 5175;

export interface RemoteMicHandlers {
  onLevel: (level: number) => void;
  onPhase: (phase: 'LISTENING' | 'IDENTIFYING' | null) => void;
  onIdentify: (
    audio: Buffer,
    mimeType: string,
    recordStartedAt: number,
  ) => Promise<{ ok: boolean; matched: boolean; error?: string }>;
  onCorrect: (
    audio: Buffer,
    mimeType: string,
    recordStartedAt: number,
  ) => Promise<{ ok: boolean; matched: boolean; changed?: boolean; error?: string }>;
  onMicConnected: (connected: boolean) => void;
}

export interface RemoteServerInfo {
  port: number;
  ip: string;
  tvUrl: string;
  micUrl: string;
}

export interface RemoteServerOptions {
  staticDir: string;
  certDir: string;
  devProxyOrigin?: string;
  micHandlers: RemoteMicHandlers;
}

interface MicAudioMessage {
  type: 'audio';
  mode: 'identify' | 'correct';
  mimeType: string;
  recordStartedAt: number;
  data: string;
}

interface MicLevelMessage {
  type: 'level';
  level: number;
}

interface MicPhaseMessage {
  type: 'phase';
  phase: 'LISTENING' | 'IDENTIFYING' | null;
}

type MicClientMessage = MicAudioMessage | MicLevelMessage | MicPhaseMessage;

const MIME_BY_EXT: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

function contentTypeFor(filePath: string): string {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

function safePath(root: string, urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const rel = normalized.startsWith('/') ? normalized.slice(1) : normalized;
  const full = path.join(root, rel);
  if (!full.startsWith(path.resolve(root))) return null;
  return full;
}

async function proxyToDev(origin: string, req: IncomingMessage, res: http.ServerResponse): Promise<void> {
  const target = new URL(req.url ?? '/', origin);
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers[key] = value;
  }
  const init: RequestInit = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    init.body = Buffer.concat(chunks);
  }
  const response = await fetch(target, init);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'transfer-encoding') return;
    res.setHeader(key, value);
  });
  const body = Buffer.from(await response.arrayBuffer());
  res.end(body);
}

function serveStatic(root: string, req: IncomingMessage, res: http.ServerResponse): void {
  let urlPath = req.url?.split('?')[0] ?? '/';
  if (urlPath === '/') urlPath = '/tv.html';
  const filePath = safePath(root, urlPath);
  if (!filePath) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  let resolved = filePath;
  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    const withHtml = `${filePath}.html`;
    if (fs.existsSync(withHtml)) {
      resolved = withHtml;
    } else {
      const indexInDir = path.join(filePath, 'index.html');
      if (fs.existsSync(indexInDir)) {
        resolved = indexInDir;
      } else {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
    }
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', contentTypeFor(resolved));
  res.setHeader('Cache-Control', 'no-cache');
  fs.createReadStream(resolved).pipe(res);
}

export class RemoteServer {
  private readonly options: RemoteServerOptions;
  private server: https.Server | null = null;
  private tvWss: WebSocketServer | null = null;
  private micWss: WebSocketServer | null = null;
  private tvClients = new Set<WebSocket>();
  private micClient: WebSocket | null = null;
  private lastModel: RenderModel | null = null;
  private running = false;

  constructor(options: RemoteServerOptions) {
    this.options = options;
  }

  getInfo(): RemoteServerInfo {
    const ip = getPrimaryLocalIp();
    const port = REMOTE_PORT;
    return {
      port,
      ip,
      tvUrl: `https://${ip}:${port}/tv.html`,
      micUrl: `https://${ip}:${port}/mic.html`,
    };
  }

  isRunning(): boolean {
    return this.running;
  }

  isMicConnected(): boolean {
    return this.micClient !== null && this.micClient.readyState === WebSocket.OPEN;
  }

  start(): Promise<void> {
    if (this.running) return Promise.resolve();

    return loadOrCreateTlsCert(this.options.certDir).then((tls) => {
      this.server = https.createServer({ key: tls.key, cert: tls.cert }, (req, res) => {
        void this.handleHttp(req, res);
      });

      this.tvWss = new WebSocketServer({ noServer: true });
      this.micWss = new WebSocketServer({ noServer: true });

      this.tvWss.on('connection', (ws) => {
        this.tvClients.add(ws);
        if (this.lastModel) {
          ws.send(JSON.stringify(this.lastModel));
        }
        ws.on('close', () => this.tvClients.delete(ws));
        ws.on('error', () => this.tvClients.delete(ws));
      });

      this.micWss.on('connection', (ws) => {
        if (this.micClient && this.micClient.readyState === WebSocket.OPEN) {
          this.micClient.close(4000, 'Replaced by new mic client');
        }
        this.micClient = ws;
        this.options.micHandlers.onMicConnected(true);
        ws.on('message', (data) => {
          void this.handleMicMessage(data);
        });
        ws.on('close', () => {
          if (this.micClient === ws) {
            this.micClient = null;
            this.options.micHandlers.onMicConnected(false);
          }
        });
        ws.on('error', () => {
          if (this.micClient === ws) {
            this.micClient = null;
            this.options.micHandlers.onMicConnected(false);
          }
        });
      });

      this.server.on('upgrade', (req, socket, head) => {
        const url = req.url?.split('?')[0] ?? '';
        if (url === '/ws') {
          this.tvWss?.handleUpgrade(req, socket, head, (ws) => {
            this.tvWss?.emit('connection', ws, req);
          });
          return;
        }
        if (url === '/ws/mic') {
          this.micWss?.handleUpgrade(req, socket, head, (ws) => {
            this.micWss?.emit('connection', ws, req);
          });
          return;
        }
        socket.destroy();
      });

      return new Promise<void>((resolve, reject) => {
        this.server!.listen(REMOTE_PORT, '0.0.0.0', () => {
          this.running = true;
          console.log(`[remote] Servidor LAN en https://0.0.0.0:${REMOTE_PORT}`);
          resolve();
        });
        this.server!.on('error', (err) => {
          this.running = false;
          reject(err);
        });
      });
    });
  }

  stop(): void {
    this.running = false;
    for (const ws of this.tvClients) {
      ws.close(1001, 'Server stopping');
    }
    this.tvClients.clear();
    if (this.micClient) {
      this.micClient.close(1001, 'Server stopping');
      this.micClient = null;
      this.options.micHandlers.onMicConnected(false);
    }
    this.tvWss?.close();
    this.micWss?.close();
    this.tvWss = null;
    this.micWss = null;
    this.server?.close();
    this.server = null;
  }

  broadcastModel(model: RenderModel): void {
    this.lastModel = model;
    if (!this.running) return;
    const payload = JSON.stringify(model);
    for (const ws of this.tvClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  private async handleHttp(req: IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      if (this.options.devProxyOrigin) {
        await proxyToDev(this.options.devProxyOrigin, req, res);
        return;
      }
      serveStatic(this.options.staticDir, req, res);
    } catch (err) {
      console.error('[remote] HTTP error:', err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal error');
      }
    }
  }

  private async handleMicMessage(data: Buffer | ArrayBuffer | Buffer[]): Promise<void> {
    const text = Buffer.isBuffer(data)
      ? data.toString()
      : Array.isArray(data)
        ? Buffer.concat(data).toString()
        : Buffer.from(data).toString();

    let parsed: MicClientMessage;
    try {
      parsed = JSON.parse(text) as MicClientMessage;
    } catch {
      return;
    }

    if (parsed.type === 'level') {
      this.options.micHandlers.onLevel(parsed.level);
      return;
    }

    if (parsed.type === 'phase') {
      this.options.micHandlers.onPhase(parsed.phase);
      return;
    }

    if (parsed.type !== 'audio') return;

    const audio = Buffer.from(parsed.data, 'base64');
    if (parsed.mode === 'correct') {
      await this.options.micHandlers.onCorrect(audio, parsed.mimeType, parsed.recordStartedAt);
    } else {
      await this.options.micHandlers.onIdentify(audio, parsed.mimeType, parsed.recordStartedAt);
    }
  }
}

export function createRemoteServer(options: RemoteServerOptions): RemoteServer {
  return new RemoteServer(options);
}
