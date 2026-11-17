import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { installerListing } = require('../scripts/installer-listing.cjs');

describe('installer inspection', () => {
  it('accepts the actual payload listing returned by recent 7-Zip', () => {
    const run = vi.fn(() => ({ status: 0, stdout: 'Path = resources/app.asar\nPath = GUIA_DE_USO.md\n' }));
    expect(installerListing('7za', 'setup.exe', run)).toContain('resources\\app.asar');
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('extracts and lists app-64.7z when older 7za exposes only the NSIS wrapper', () => {
    const run = vi.fn().mockReturnValueOnce({ status: 0, stdout: 'Path = $PLUGINSDIR/app-64.7z\n' })
      .mockReturnValueOnce({ status: 0, stdout: '' })
      .mockReturnValueOnce({ status: 0, stdout: 'Path = resources/app.asar\n' });
    expect(installerListing('7za', 'setup.exe', run)).toContain('resources\\app.asar');
    expect(run.mock.calls[1][1]).toContain('$PLUGINSDIR\\app-64.7z');
    expect(run.mock.calls[2][1][2]).toMatch(/app-64\.7z$/);
  });
  it('fails closed if no payload can be inspected', () => {
    expect(() => installerListing('7za', 'setup.exe', () => ({ status: 0, stdout: 'Path = other-file' }))).toThrow('payload');
  });
});
