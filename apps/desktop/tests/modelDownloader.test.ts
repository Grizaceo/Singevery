import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { downloadModel } from '../electron/services/llm/modelDownloader';

const url = 'https://example.invalid/model';
const model = 'GGUFabcdefgh';
let directory: string;
let file: string;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'singevery-download-test-'));
  file = path.join(directory, 'model.gguf');
});
afterEach(async () => { vi.unstubAllGlobals(); await fs.rm(directory, { recursive: true, force: true }); });
async function partial() {
  await fs.writeFile(file + '.part', model.slice(0, 4));
  await fs.writeFile(file + '.part.json', JSON.stringify({ url, etag: '"v1"' }));
}
describe('model download integrity and resume', () => {
  it('replaces the partial when a server ignores Range with 200', async () => {
    await partial();
    const fetch = vi.fn(async () => new Response(model, { headers: { 'content-length': '12', etag: '"v2"' } }));
    vi.stubGlobal('fetch', fetch);
    expect((await downloadModel(url, file)).ok).toBe(true);
    expect(fetch.mock.calls[0]).toBeDefined();
    expect(await fs.readFile(file, 'utf8')).toBe(model);
    expect(await fs.stat(file + '.part.json').catch(() => null)).toBeNull();
  });
  it('appends only a matching range with the same strong ETag', async () => {
    await partial();
    const fetch = vi.fn(async (_url: string, options: RequestInit) => {
      expect(options.headers).toMatchObject({ Range: 'bytes=4-', 'If-Range': '"v1"' });
      return new Response(model.slice(4), { status: 206, headers: { 'content-range': 'bytes 4-11/12', 'content-length': '8', etag: '"v1"' } });
    });
    vi.stubGlobal('fetch', fetch);
    expect((await downloadModel(url, file)).totalBytes).toBe(12);
    expect(await fs.readFile(file, 'utf8')).toBe(model);
  });
  it.each([
    ['bytes 0-7/8', '"v1"'], ['bytes 4-11/12', '"v2"'], ['bytes 4-8/12', '"v1"'],
  ])('rejects mismatched Content-Range or identity: %s %s', async (range, etag) => {
    await partial();
    vi.stubGlobal('fetch', async () => new Response(model.slice(4), { status: 206, headers: { 'content-range': range, etag } }));
    await expect(downloadModel(url, file)).rejects.toThrow();
    expect(await fs.readFile(file + '.part', 'utf8')).toBe('GGUF');
    expect(await fs.stat(file).catch(() => null)).toBeNull();
  });
  it('does not resume legacy partials lacking a validator', async () => {
    await fs.writeFile(file + '.part', 'obsolete');
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      expect(init.headers).not.toHaveProperty('Range');
      return new Response(model);
    });
    await downloadModel(url, file);
    expect(await fs.readFile(file, 'utf8')).toBe(model);
  });
  it.each([
    [model, '100', 'incompleta'], ['<html>error</html>', '18', 'GGUF'],
  ])('never promotes an invalid file', async (body, length, error) => {
    vi.stubGlobal('fetch', async () => new Response(body, { headers: { 'content-length': length } }));
    await expect(downloadModel(url, file)).rejects.toThrow(error);
    expect(await fs.stat(file).catch(() => null)).toBeNull();
  });
  it('keeps a partial on cancellation and releases the same-destination lock', async () => {
    const abort = new AbortController();
    let unblock!: (value: Response) => void;
    vi.stubGlobal('fetch', () => new Promise<Response>(resolve => { unblock = resolve; }));
    const first = downloadModel(url, file, undefined, abort.signal);
    await vi.waitFor(() => expect(unblock).toBeDefined());
    expect((await downloadModel(url, file)).ok).toBe(false);
    abort.abort();
    unblock(new Response(model));
    await expect(first).rejects.toThrow();
    vi.stubGlobal('fetch', async () => new Response(model));
    expect((await downloadModel(url, file)).ok).toBe(true);
  });
});
