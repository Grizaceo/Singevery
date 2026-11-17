// HISTORICAL: reproduces dd0adaa before the fixes. Current regression tests:
// apps/desktop/tests/{windowResize,modelDownloader}.test.ts.
// Run after `npm run build` in apps/desktop. No network or GUI required.
// The window mock models Electron 43.2.0 NativeWindowViews::SetBounds:
// a non-resizable window updates its native minimum to the requested size.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const appRoot = path.resolve(__dirname, '../../../apps/desktop');

async function main() {
  const source = fs.readFileSync(path.join(appRoot, 'dist-electron/electron/main.js'), 'utf8');
  const start = source.indexOf("electron_1.ipcMain.handle('window:setSize',");
  const end = source.indexOf("electron_1.ipcMain.handle('window:getSize',", start);
  assert(start >= 0 && end > start, 'Compiled handler boundaries changed');
  let handler;
  let size = [760, 560];
  let minimum = [760, 560];
  vm.runInNewContext(source.slice(start, end), {
    electron_1: { ipcMain: { handle: (_name, fn) => { handler = fn; } } },
    mainWindow: {
      getMinimumSize: () => minimum,
      setSize: (w, h) => { size = [w, h]; minimum = [...size]; },
    },
  });
  handler({}, 1000, 800);
  const expanded = [...size];
  handler({}, 600, 400);
  console.log(JSON.stringify({ case: 'native-minimum-ratchet', requested: [600, 400], actual: size, expanded }));
  assert.deepEqual(size, expanded, 'Bug behavior changed: review and replace reproducer with regression test');

  const { downloadModel } = require(path.join(appRoot, 'dist-electron/electron/services/llm/modelDownloader.js'));
  const dir = fs.mkdtempSync('/tmp/singevery-audit-repro-');
  const originalFetch = global.fetch;
  try {
    const file = path.join(dir, 'model.gguf');
    fs.writeFileSync(file + '.part', 'GGUFpartial');
    global.fetch = async (_url, options) => {
      assert.equal(options.headers.Range, 'bytes=11-');
      return new Response('GGUFcomplete', { status: 200, headers: { 'content-length': '12' } });
    };
    const result = await downloadModel('https://example.invalid/model', file);
    const content = fs.readFileSync(file, 'utf8');
    console.log(JSON.stringify({ case: 'range-ignored-200', ok: result.ok, content, bytes: result.totalBytes }));
    assert.equal(result.ok, true);
    assert.equal(content, 'GGUFpartialGGUFcomplete');

    const truncated = path.join(dir, 'truncated.gguf');
    global.fetch = async () => new Response('GGUF', { status: 200, headers: { 'content-length': '100' } });
    const short = await downloadModel('https://example.invalid/model', truncated);
    console.log(JSON.stringify({ case: 'declared-length-not-validated', ok: short.ok, bytes: short.totalBytes }));
    assert.equal(short.ok, true);
    assert.equal(short.totalBytes, 4);
  } finally {
    global.fetch = originalFetch;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
