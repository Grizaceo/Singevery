import { afterEach, expect, it, vi } from 'vitest';
const env = vi.hoisted(() => ({token: 'test-invalid'}));
vi.mock('../electron/services/env', () => ({ getAuddToken: () => env.token }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); env.token = 'test-invalid'; });
it('caches only #900 for the current token and retries after token change', async () => {
 const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({status:'error', error:{error_code:900,error_message:'invalid'}})));
 vi.stubGlobal('fetch',fetcher);
 const { identifyFromAudd } = await import('../electron/services/recognition/auddProvider');
 await expect(identifyFromAudd(Buffer.alloc(4))).rejects.toThrow('#900');
 await expect(identifyFromAudd(Buffer.alloc(4))).rejects.toThrow('#900');
 expect(fetcher).toHaveBeenCalledTimes(1);
 env.token = 'test-replacement'; fetcher.mockResolvedValue(new Response(JSON.stringify({status:'success',result:null})));
 await expect(identifyFromAudd(Buffer.alloc(4))).resolves.toBeNull();
 expect(fetcher).toHaveBeenCalledTimes(2);
});
it('does not cache transient provider errors', async () => {
 const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({status:'error',error:{error_code:500,error_message:'temporary'}})));
 vi.stubGlobal('fetch',fetcher);
 const { identifyFromAudd } = await import('../electron/services/recognition/auddProvider');
 for(let i=0;i<2;i++) await expect(identifyFromAudd(Buffer.alloc(4))).rejects.toThrow('#500');
 expect(fetcher).toHaveBeenCalledTimes(2);
});
