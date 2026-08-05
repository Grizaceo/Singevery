import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ReferenceStore,
  ReferenceValidationError,
  buildReferenceFile,
  parseReferenceFile,
  sanitizeCurve,
  suggestedFileName,
} from '../electron/services/references/referenceStore';
import {
  MAX_REFERENCE_POINTS,
  REFERENCE_FORMAT,
  type ReferenceCurve,
} from '../electron/services/references/referenceTypes';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refstore-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Curva sencilla: sube de 220 a 260 Hz en pasos de 50 ms. */
function curve(points = 20, startMs = 0): ReferenceCurve {
  const t: number[] = [];
  const f: number[] = [];
  for (let i = 0; i < points; i += 1) {
    t.push(startMs + i * 50);
    f.push(220 + i * 2);
  }
  return { t, f };
}

describe('sanitizeCurve', () => {
  it('acepta una curva normal', () => {
    const out = sanitizeCurve(curve(5));
    expect(out.t).toHaveLength(5);
    expect(out.f[0]).toBe(220);
  });

  it('descarta puntos imposibles sin tirar la referencia entera', () => {
    const out = sanitizeCurve({
      t: [0, 50, 100, 150, 200, 250],
      f: [220, NaN, 1e9, 240, -5, 250], // solo 220, 240 y 250 son válidos
    });
    expect(out.t).toEqual([0, 150, 250]);
    expect(out.f).toEqual([220, 240, 250]);
  });

  it('descarta tiempos que van hacia atrás', () => {
    const out = sanitizeCurve({ t: [0, 100, 50, 200], f: [220, 230, 240, 250] });
    expect(out.t).toEqual([0, 100, 200]);
  });

  it('rechaza arrays de largos distintos', () => {
    expect(() => sanitizeCurve({ t: [0, 1], f: [220] })).toThrow(ReferenceValidationError);
  });

  it('rechaza curvas absurdamente grandes', () => {
    const big = MAX_REFERENCE_POINTS + 1;
    expect(() => sanitizeCurve({ t: new Array(big).fill(0), f: new Array(big).fill(220) })).toThrow(
      /máximo/,
    );
  });

  it('rechaza lo que no es una curva', () => {
    for (const bad of [null, undefined, {}, { t: 'x', f: 'y' }, 42, []]) {
      expect(() => sanitizeCurve(bad)).toThrow(ReferenceValidationError);
    }
  });

  it('rechaza una curva que queda vacía tras limpiar', () => {
    expect(() => sanitizeCurve({ t: [0, 50], f: [1e9, NaN] })).toThrow(/utilizables/);
  });
});

describe('ReferenceStore', () => {
  it('guarda, lista y recupera una referencia', () => {
    const store = new ReferenceStore(dir);
    const saved = store.save({
      trackKey: 'queen::bohemian rhapsody',
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
      label: 'Estribillo',
      instrument: 'voz',
      author: 'Profe Marcelo',
      curve: curve(),
      appVersion: '0.2.1-beta.2',
    });

    expect(saved.id).toBeTruthy();
    expect(saved.pointCount).toBe(20);
    expect(saved.startMs).toBe(0);
    expect(saved.endMs).toBe(950);

    const list = store.list();
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe('Estribillo');
    expect(list[0].author).toBe('Profe Marcelo');

    const full = store.get(saved.id);
    expect(full?.curve.t).toHaveLength(20);
  });

  it('NUNCA guarda audio: el archivo en disco solo tiene la curva', () => {
    const store = new ReferenceStore(dir);
    const saved = store.save({ label: 'X', curve: curve(), instrument: 'voz' });
    const raw = fs.readFileSync(path.join(dir, `${saved.id}.json`), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    expect(Object.keys(parsed).sort()).toEqual(
      [
        'appVersion', 'artist', 'createdAt', 'curve', 'endMs', 'id', 'instrument',
        'label', 'pointCount', 'startMs', 'title', 'trackKey',
      ].sort(),
    );
    // Ni PCM, ni base64 de audio, ni rutas a archivos de sonido.
    expect(raw).not.toMatch(/audio|wav|pcm|base64|samples/i);
  });

  it('filtra por pista y devuelve la más reciente como vigente', () => {
    const store = new ReferenceStore(dir);
    store.save({ trackKey: 'a', label: 'vieja', curve: curve(10), createdAt: 1000 });
    const nueva = store.save({ trackKey: 'a', label: 'nueva', curve: curve(30), createdAt: 2000 });
    store.save({ trackKey: 'b', label: 'otra pista', curve: curve(10), createdAt: 3000 });

    expect(store.list('a')).toHaveLength(2);
    expect(store.list('a')[0].label).toBe('nueva');
    expect(store.getForTrack('a')?.id).toBe(nueva.id);
    expect(store.getForTrack('inexistente')).toBeNull();
  });

  it('persiste entre instancias', () => {
    const saved = new ReferenceStore(dir).save({ label: 'Persistente', curve: curve() });
    const reopened = new ReferenceStore(dir);
    expect(reopened.list()).toHaveLength(1);
    expect(reopened.get(saved.id)?.label).toBe('Persistente');
  });

  it('borra referencia y payload', () => {
    const store = new ReferenceStore(dir);
    const saved = store.save({ label: 'Temporal', curve: curve() });
    expect(store.remove(saved.id)).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(store.get(saved.id)).toBeNull();
    expect(fs.existsSync(path.join(dir, `${saved.id}.json`))).toBe(false);
    expect(store.remove(saved.id)).toBe(false);
  });

  it('un id con recorrido de rutas no toca nada fuera del directorio', () => {
    const store = new ReferenceStore(dir);
    for (const evil of ['../../etc/passwd', 'a/b', '..', '', 'x'.repeat(200)]) {
      expect(store.get(evil)).toBeNull();
      expect(store.remove(evil)).toBe(false);
    }
    // Y al guardar, un id hostil se ignora y se genera uno nuevo.
    const saved = store.save({ id: '../../evil', label: 'X', curve: curve() });
    expect(saved.id).not.toContain('..');
    expect(fs.existsSync(path.join(dir, `${saved.id}.json`))).toBe(true);
  });

  it('limpia texto libre (controles, largo)', () => {
    const store = new ReferenceStore(dir);
    const saved = store.save({
      label: '  Estribillo\n\tcon saltos  ',
      author: 'x'.repeat(500),
      curve: curve(),
    });
    expect(saved.label).toBe('Estribillo con saltos');
    expect(saved.author!.length).toBeLessThanOrEqual(200);
  });

  it('un índice corrupto no impide arrancar', () => {
    fs.writeFileSync(path.join(dir, 'index.json'), 'no soy json', 'utf8');
    const store = new ReferenceStore(dir);
    expect(store.list()).toEqual([]);
    expect(() => store.save({ label: 'Nueva', curve: curve() })).not.toThrow();
  });

  it('stats cuenta lo guardado', () => {
    const store = new ReferenceStore(dir);
    store.save({ label: 'A', curve: curve() });
    store.save({ label: 'B', curve: curve() });
    const stats = store.stats();
    expect(stats.count).toBe(2);
    expect(stats.bytes).toBeGreaterThan(0);
  });
});

describe('exportar / importar', () => {
  it('ida y vuelta conserva la curva', () => {
    const store = new ReferenceStore(dir);
    const saved = store.save({
      trackKey: 'queen::bohemian rhapsody',
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
      label: 'Estribillo',
      instrument: 'bajo',
      curve: curve(),
    });

    const file = buildReferenceFile(store.get(saved.id)!);
    expect(JSON.parse(file).format).toBe(REFERENCE_FORMAT);

    const imported = parseReferenceFile(file);
    expect(imported.curve).toEqual(saved.curve);
    expect(imported.instrument).toBe('bajo');
    expect(imported.title).toBe('Bohemian Rhapsody');
  });

  it('importar en otro equipo deja la referencia utilizable', () => {
    const origen = new ReferenceStore(dir);
    const saved = origen.save({ trackKey: 'a', label: 'Del profe', curve: curve() });
    const file = buildReferenceFile(origen.get(saved.id)!);

    const otroDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refstore2-'));
    try {
      const destino = new ReferenceStore(otroDir);
      const parsed = parseReferenceFile(file);
      const stored = destino.save({ ...parsed, id: parsed.id });
      expect(destino.getForTrack('a')?.label).toBe('Del profe');
      expect(destino.fingerprint(stored.id)).toBe(origen.fingerprint(saved.id));
    } finally {
      fs.rmSync(otroDir, { recursive: true, force: true });
    }
  });

  it('rechaza archivos que no son referencias', () => {
    expect(() => parseReferenceFile('no soy json')).toThrow(/JSON/);
    expect(() => parseReferenceFile('{"hola":1}')).toThrow(/no es una referencia/);
    expect(() => parseReferenceFile(JSON.stringify({ format: 'otra-cosa' }))).toThrow();
  });

  it('rechaza un formato del futuro en vez de adivinar', () => {
    const file = JSON.stringify({
      format: REFERENCE_FORMAT,
      formatVersion: 99,
      reference: { curve: curve() },
    });
    expect(() => parseReferenceFile(file)).toThrow(/versión más nueva/);
  });

  it('un archivo hostil no logra inyectar campos raros', () => {
    const file = JSON.stringify({
      format: REFERENCE_FORMAT,
      formatVersion: 1,
      reference: {
        id: '../../../etc/passwd',
        label: 'x'.repeat(9999),
        instrument: 'lanzacohetes',
        createdAt: 'ayer',
        curve: curve(),
        audioPath: '/home/victima/secreto.wav',
      },
    });
    const parsed = parseReferenceFile(file) as Record<string, unknown>;
    expect(String(parsed.id)).not.toContain('..');
    expect((parsed.label as string).length).toBeLessThanOrEqual(200);
    expect(parsed.instrument).toBe('otro');
    expect(typeof parsed.createdAt).toBe('number');
    // El campo colado no sobrevive: se construye un objeto nuevo, no se copia.
    expect(parsed.audioPath).toBeUndefined();
  });

  it('rechaza un archivo sin curva utilizable', () => {
    const file = JSON.stringify({
      format: REFERENCE_FORMAT,
      formatVersion: 1,
      reference: { label: 'vacía', curve: { t: [], f: [] } },
    });
    expect(() => parseReferenceFile(file)).toThrow(ReferenceValidationError);
  });
});

describe('suggestedFileName', () => {
  it('arma un nombre legible y seguro', () => {
    const name = suggestedFileName({
      id: 'x', trackKey: 'k', title: 'Bohemian Rhapsody', artist: 'Queen',
      label: 'Estribillo', instrument: 'voz', createdAt: 0, startMs: 0, endMs: 1,
      pointCount: 2, appVersion: '0',
    });
    expect(name).toBe('Queen - Bohemian Rhapsody - Estribillo.singevery-ref');
  });

  it('sanea acentos y caracteres prohibidos en Windows', () => {
    const name = suggestedFileName({
      id: 'x', trackKey: '', title: 'Canción: ¿qué?', artist: 'Café/Tacvba',
      label: '', instrument: 'voz', createdAt: 0, startMs: 0, endMs: 1,
      pointCount: 2, appVersion: '0',
    });
    expect(name).not.toMatch(/[/:?]/);
    expect(name.endsWith('.singevery-ref')).toBe(true);
  });
});
