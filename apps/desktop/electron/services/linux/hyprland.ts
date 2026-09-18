// ============================================================================
// hyprland.ts — la ventana del widget en Hyprland (Linux / Wayland).
//
// Wayland no deja que un cliente se posicione solo: en Electron setPosition,
// center y setAlwaysOnTop son no-op, getPosition devuelve (0,0) y los atajos
// globales se registran "con éxito" pero nunca disparan. En Windows todo eso
// lo da la API de ventanas; en Hyprland lo da su IPC (hyprctl), con el que la
// app maneja SU PROPIA ventana:
//   - una regla de ventana (flotante, fijada en todos los workspaces, sin
//     borde/sombra/blur/animación, opacidad 1) = el overlay "siempre encima";
//   - mover / centrar / leer la posición real;
//   - los atajos Ctrl+Alt+S / T / flechas;
//   - el click-through (ver setPassthrough).
//
// Nada se escribe en ~/.config/hypr: regla y atajos viven en la sesión de
// Hyprland solo mientras la app corre, se retiran al salir y se re-inyectan
// si el usuario recarga la config (evento configreloaded).
//
// Requiere la config Lua de Hyprland (0.5x+, la de Omarchy). Si `hyprctl
// eval` no existe, la integración se apaga sola y la app queda como en
// cualquier compositor Wayland (el compositor decide dónde va la ventana).
// ============================================================================

import { execFile } from 'child_process';
import * as net from 'net';
import * as path from 'path';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Subconjunto de `hyprctl -j clients` que usa la app. */
export interface HyprClient {
  address: string;
  pid: number;
  at: [number, number];
  size: [number, number];
  monitor: number;
  mapped?: boolean;
}

/** Subconjunto de `hyprctl -j monitors`. `reserved` = [izq, arriba, der, abajo]. */
export interface HyprMonitor {
  id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  /** 0-7 (wl_output transform); los impares rotan 90/270°. */
  transform?: number;
  reserved: [number, number, number, number];
}

/** Un atajo que la app registra en Hyprland mientras corre. */
export interface HyprBind {
  /** Combinación en sintaxis de Hyprland: "CTRL + ALT + S". */
  keys: string;
  description: string;
  /** Expresión Lua del dispatcher (hl.dsp.*). */
  dispatcher: string;
  repeating?: boolean;
}

export type HyprctlRunner = (args: string[]) => Promise<string>;
/** Petición cruda al socket IPC de Hyprland ("j/cursorpos", "dispatch …"). */
export type HyprSocketRequest = (command: string) => Promise<string>;

/** Arrastre del handle: período del lazo y umbral para contar como arrastre. */
export const DRAG_TICK_MS = 8;
export const DRAG_THRESHOLD_PX = 4;
/** Red de seguridad: un arrastre sin pointerup nunca sigue al cursor para siempre. */
export const DRAG_MAX_MS = 30_000;

const defaultRunner: HyprctlRunner = (args) =>
  new Promise((resolve, reject) => {
    execFile('hyprctl', args, { timeout: 2000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) =>
      err ? reject(err) : resolve(stdout),
    );
  });

/**
 * El socket de peticiones de Hyprland responde en ~1-3 ms (hyprctl como
 * proceso tarda ~5-10 ms): es lo que permite seguir el cursor a 60+ Hz.
 */
const defaultSocketRequest: HyprSocketRequest = (command) =>
  new Promise((resolve, reject) => {
    const sig = process.env.HYPRLAND_INSTANCE_SIGNATURE;
    const runtime = process.env.XDG_RUNTIME_DIR;
    if (!sig || !runtime) {
      reject(new Error('sin socket de Hyprland'));
      return;
    }
    const socket = net.connect(path.join(runtime, 'hypr', sig, '.socket.sock'));
    let out = '';
    socket.setEncoding('utf8');
    socket.setTimeout(1000, () => socket.destroy(new Error('timeout del socket de Hyprland')));
    socket.on('data', (chunk: string) => {
      out += chunk;
    });
    socket.on('end', () => resolve(out));
    socket.on('error', reject);
    socket.write(command);
  });

/** ¿La app corre dentro de Hyprland con su integración habilitada? */
export function isHyprlandSession(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return (
    platform === 'linux' &&
    Boolean(env.HYPRLAND_INSTANCE_SIGNATURE) &&
    env.SINGEVERY_HYPRLAND !== '0'
  );
}

/** Cadena Lua literal a prueba de comillas y barras (corchetes largos). */
export function luaString(value: string): string {
  let level = '';
  while (value.includes(`]${level}]`)) level += '=';
  return `[${level}[${value}]${level}]`;
}

/** Comilla un argumento para /bin/sh (lo que usa exec_cmd de Hyprland). */
export function shellQuote(arg: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/** Tamaño lógico del monitor (el que usa el layout de ventanas). */
function logicalSize(m: HyprMonitor): { width: number; height: number } {
  const scale = m.scale > 0 ? m.scale : 1;
  // hyprctl da el modo en píxeles físicos; el layout (x/y, ventanas) es lógico.
  const rotated = (m.transform ?? 0) % 2 === 1;
  const w = Math.round((rotated ? m.height : m.width) / scale);
  const h = Math.round((rotated ? m.width : m.height) / scale);
  return { width: w, height: h };
}

/** Área útil de un monitor (sin la barra ni otras zonas reservadas). */
export function monitorWorkArea(m: HyprMonitor): Rect {
  const [left, top, right, bottom] = m.reserved ?? [0, 0, 0, 0];
  const { width, height } = logicalSize(m);
  return {
    x: m.x + left,
    y: m.y + top,
    width: Math.max(1, width - left - right),
    height: Math.max(1, height - top - bottom),
  };
}

/** Monitor que contiene el centro del rect (o el primero si ninguno). */
export function monitorForRect(monitors: HyprMonitor[], rect: Rect): HyprMonitor | null {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  return (
    monitors.find((m) => {
      const { width, height } = logicalSize(m);
      return cx >= m.x && cx < m.x + width && cy >= m.y && cy < m.y + height;
    }) ??
    monitors[0] ??
    null
  );
}

/** Regla de ventana del overlay (expresión Lua para `hyprctl eval`). */
export function overlayRuleLua(ruleName: string, windowClass: string): string {
  const match = `^${windowClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
  return (
    `hl.window_rule({ name = ${luaString(ruleName)}, match = { class = ${luaString(match)} }, ` +
    'float = true, pin = true, border_size = 0, no_shadow = true, no_blur = true, ' +
    'no_anim = true, opacity = "1 1" })'
  );
}

/**
 * Integración con Hyprland para la ventana de la app (identificada por pid).
 * Todos los métodos son tolerantes a fallos: si hyprctl falla, devuelven
 * null/false y la app sigue funcionando con lo que haga el compositor.
 */
export class HyprlandWindow {
  private address: string | null = null;
  private binds: HyprBind[] = [];
  private events: net.Socket | null = null;
  private disposed = false;
  /** Estado aplicado de no_focus (null = desconocido: se re-aplica). */
  private passthrough: boolean | null = null;
  /** Serializa los cambios de no_focus: el último pedido es el que queda. */
  private passthroughOps: Promise<unknown> = Promise.resolve();
  private drag: {
    start: { x: number; y: number };
    origin: { x: number; y: number };
    startedAt: number;
    moved: boolean;
    last: string;
  } | null = null;

  constructor(
    private readonly windowClass: string,
    private readonly pid: number = process.pid,
    private readonly run: HyprctlRunner = defaultRunner,
    private readonly ruleName = 'singevery-overlay',
    private readonly request: HyprSocketRequest = defaultSocketRequest,
  ) {}

  /**
   * Comprueba que hyprctl responde con la API Lua e inyecta la regla del
   * overlay. Llamar ANTES de crear la ventana para que nazca ya flotante y
   * fijada. Devuelve false si la integración no está disponible.
   * `watchReloads` escucha el socket de eventos para re-aplicar regla y
   * atajos tras un reload de la config (los tests lo apagan).
   */
  async init(watchReloads = true): Promise<boolean> {
    try {
      // Sin config Lua, `eval` no existe: hyprctl lo dice por stdout con exit 0.
      const out = await this.run(['eval', overlayRuleLua(this.ruleName, this.windowClass)]);
      if (/^(error|unknown)/im.test(out)) throw new Error(out.trim());
    } catch (err) {
      console.warn('[hyprland] integración no disponible (¿Hyprland sin config Lua?):', errorMessage(err));
      return false;
    }
    if (watchReloads) this.watchConfigReloads();
    return true;
  }

  /** Busca la ventana de este proceso; espera a que el compositor la mapee. */
  async waitForWindow(timeoutMs = 3000): Promise<HyprClient | null> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const client = await this.findClient();
      if (client || Date.now() >= deadline || this.disposed) return client;
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  private async findClient(): Promise<HyprClient | null> {
    try {
      const clients = JSON.parse(await this.run(['-j', 'clients'])) as HyprClient[];
      const own = clients.find((c) => c.pid === this.pid && c.mapped !== false) ?? null;
      this.address = own?.address ?? null;
      return own;
    } catch {
      return null;
    }
  }

  /** Posición y tamaño reales (coordenadas globales del layout). */
  async getBounds(): Promise<Rect | null> {
    const c = await this.findClient();
    if (!c) return null;
    return { x: c.at[0], y: c.at[1], width: c.size[0], height: c.size[1] };
  }

  async monitors(): Promise<HyprMonitor[]> {
    try {
      return JSON.parse(await this.run(['-j', 'monitors'])) as HyprMonitor[];
    } catch {
      return [];
    }
  }

  /** Área útil (sin barra) del monitor donde está `rect`. */
  async workAreaFor(rect: Rect): Promise<Rect | null> {
    const m = monitorForRect(await this.monitors(), rect);
    return m ? monitorWorkArea(m) : null;
  }

  /**
   * Mueve la ventana a (x, y) globales. Si el destino está en otro monitor,
   * primero se la pasa a ese monitor: Hyprland no reasigna el monitor en un
   * move por coordenadas, y en el siguiente resize la devolvía al anterior.
   */
  async moveTo(x: number, y: number): Promise<boolean> {
    const client = await this.findClient();
    if (!client) return false;
    const target = monitorForRect(await this.monitors(), {
      x,
      y,
      width: client.size[0],
      height: client.size[1],
    });
    if (target && target.id !== client.monitor) {
      await this.dispatchOnWindow((w) => `hl.dsp.window.move({ window = ${w}, monitor = ${luaString(target.name)} })`);
    }
    return this.dispatchOnWindow(
      (w) => `hl.dsp.window.move({ window = ${w}, x = ${Math.round(x)}, y = ${Math.round(y)} })`,
    );
  }

  /**
   * Coloca la ventana en `rect` DESPUÉS de que Electron la redimensione.
   * Hyprland mantiene el centro de una ventana flotante cuando el cliente
   * cambia su tamaño; si el move llegara antes que ese commit, el re-centrado
   * lo deshacería. Se espera a ver el tamaño nuevo (o el plazo) y se mueve.
   */
  async placeAfterResize(rect: Rect, timeoutMs = 600): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const c = await this.findClient();
      if (!c) return false;
      const sized = Math.abs(c.size[0] - rect.width) <= 2 && Math.abs(c.size[1] - rect.height) <= 2;
      if (sized || Date.now() >= deadline) break;
      await new Promise((r) => setTimeout(r, 30));
    }
    return this.moveTo(rect.x, rect.y);
  }

  async moveBy(dx: number, dy: number): Promise<boolean> {
    return this.dispatchOnWindow(
      (w) =>
        `hl.dsp.window.move({ window = ${w}, x = ${Math.round(dx)}, y = ${Math.round(dy)}, relative = true })`,
    );
  }

  /**
   * Click-through: en Wayland Electron no puede vaciar la región de entrada
   * (setIgnoreMouseEvents es no-op). Hyprland salta las ventanas con la
   * propiedad no_focus al buscar qué hay bajo el cursor, así que con ella los
   * clics y el movimiento llegan a la ventana de abajo; la regla del overlay
   * la mantiene fijada (encima) aunque la de abajo tome el foco.
   * Va por el socket: se alterna a menudo (hover del asa).
   */
  setPassthrough(on: boolean): Promise<boolean> {
    const op = this.passthroughOps.then(() => this.applyPassthrough(on));
    this.passthroughOps = op.catch(() => {});
    return op;
  }

  private async applyPassthrough(on: boolean): Promise<boolean> {
    if (this.passthrough === on) return true;
    if (!this.address) await this.findClient();
    if (!this.address) return false;
    try {
      const out = await this.request(
        `dispatch hl.dsp.window.set_prop({ window = ${luaString(`address:${this.address}`)}, prop = "no_focus", value = "${on ? 1 : 0}" })`,
      );
      if (/^error/im.test(out)) throw new Error(out.trim());
      this.passthrough = on;
      return true;
    } catch (err) {
      this.passthrough = null;
      console.warn('[hyprland] no se pudo cambiar el click-through:', errorMessage(err));
      return false;
    }
  }

  /** Posición global del cursor, o null si Hyprland no responde. */
  async cursorPos(): Promise<{ x: number; y: number } | null> {
    try {
      const pos = JSON.parse(await this.request('j/cursorpos')) as { x?: unknown; y?: unknown };
      return typeof pos.x === 'number' && typeof pos.y === 'number' ? { x: pos.x, y: pos.y } : null;
    } catch {
      return null;
    }
  }

  /**
   * Arrastre del handle. En Windows el renderer mueve la ventana con los
   * deltas de e.screenX; en Wayland screenX no es global y la app no puede
   * posicionarse. Aquí el main sigue al cursor real (cursorpos) y mueve la
   * ventana por el socket de Hyprland hasta endDrag(). Así el handle recibe
   * todos sus eventos DOM (hover, doble clic) igual que en Windows, cosa que
   * -webkit-app-region: drag impide.
   */
  async beginDrag(): Promise<boolean> {
    await this.endDrag();
    const client = await this.findClient();
    const cursor = await this.cursorPos();
    if (!client || !cursor || !this.address) return false;
    const drag = {
      start: cursor,
      origin: { x: client.at[0], y: client.at[1] },
      startedAt: Date.now(),
      moved: false,
      last: '',
    };
    this.drag = drag;
    const window = luaString(`address:${this.address}`);
    const step = async (): Promise<void> => {
      if (this.drag !== drag) return;
      if (Date.now() - drag.startedAt > DRAG_MAX_MS) {
        this.drag = null;
        return;
      }
      const c = await this.cursorPos();
      if (c && this.drag === drag) {
        const dx = Math.round(c.x - drag.start.x);
        const dy = Math.round(c.y - drag.start.y);
        if (!drag.moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) drag.moved = true;
        const key = `${dx},${dy}`;
        if (drag.moved && key !== drag.last) {
          drag.last = key;
          await this.request(
            `dispatch hl.dsp.window.move({ window = ${window}, x = ${drag.origin.x + dx}, y = ${drag.origin.y + dy} })`,
          ).catch(() => '');
        }
      }
      if (this.drag === drag) setTimeout(() => void step(), DRAG_TICK_MS);
    };
    void step();
    return true;
  }

  /** Termina el arrastre. Devuelve true si la ventana llegó a moverse. */
  async endDrag(): Promise<boolean> {
    const drag = this.drag;
    this.drag = null;
    if (!drag?.moved) return false;
    // Si el arrastre cruzó a otro monitor, moveTo le reasigna el monitor.
    const b = await this.getBounds();
    if (b) await this.moveTo(b.x, b.y);
    return true;
  }

  /** Foco de teclado + al frente (Electron focus() no activa en Wayland). */
  async focus(): Promise<boolean> {
    const ok = await this.dispatchOnWindow((w) => `hl.dsp.focus({ window = ${w} })`);
    await this.dispatchOnWindow((w) => `hl.dsp.window.bring_to_top({ window = ${w} })`);
    return ok;
  }

  /**
   * Registra atajos globales. Respeta los del usuario: una combinación que ya
   * está en uso no se pisa (se avisa y se omite).
   */
  async registerBinds(binds: HyprBind[]): Promise<void> {
    const taken = new Set<string>();
    const ours = new Set<string>();
    try {
      const existing = JSON.parse(await this.run(['-j', 'binds'])) as Array<{ modmask: number; key: string; description?: string }>;
      for (const b of existing) {
        const sig = `${b.modmask}:${b.key.toLowerCase()}`;
        (b.description?.startsWith('Singevery:') ? ours : taken).add(sig);
      }
    } catch {
      /* sin lista: registrar igual */
    }
    const registered: HyprBind[] = [];
    for (const bind of binds) {
      const sig = bindSignature(bind.keys);
      if (taken.has(sig)) {
        console.warn(`[hyprland] ${bind.keys} ya está asignado en tu config; Singevery no lo pisa.`);
        continue;
      }
      if (ours.has(sig)) {
        // Sigue registrado de antes (p. ej. tras un reload que no lo borró).
        registered.push(bind);
        continue;
      }
      const opts = [`description = ${luaString(`Singevery: ${bind.description}`)}`];
      if (bind.repeating) opts.push('repeating = true');
      try {
        await this.run(['eval', `hl.bind(${luaString(bind.keys)}, ${bind.dispatcher}, { ${opts.join(', ')} })`]);
        registered.push(bind);
      } catch (err) {
        console.warn(`[hyprland] no se pudo registrar ${bind.keys}:`, errorMessage(err));
      }
    }
    this.binds = registered;
  }

  /** Expresión Lua de la ventana propia (para dispatchers en atajos). */
  windowSelector(): string | null {
    return this.address ? luaString(`address:${this.address}`) : null;
  }

  /** Retira atajos y regla. Síncrono-best-effort: se llama al salir. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.drag = null;
    this.events?.destroy();
    this.events = null;
    const cmds = [
      ...this.binds.map((b) => `hl.unbind(${luaString(b.keys)})`),
      `hl.window_rule({ name = ${luaString(this.ruleName)}, enabled = false })`,
    ];
    for (const cmd of cmds) {
      // Fire-and-forget: al salir no se espera a hyprctl.
      this.run(['eval', cmd]).catch(() => {});
    }
    this.binds = [];
  }

  private async dispatchOnWindow(expr: (window: string) => string): Promise<boolean> {
    const attempt = async (): Promise<void> => {
      // hyprctl informa los errores de Lua/dispatcher en stdout con exit 0.
      const out = await this.run(['dispatch', expr(luaString(`address:${this.address}`))]);
      if (/^error/im.test(out)) throw new Error(out.trim());
    };
    if (!this.address) await this.findClient();
    if (!this.address) return false;
    try {
      await attempt();
      return true;
    } catch {
      // La dirección pudo cambiar (ventana re-mapeada): re-buscar y reintentar una vez.
      if (!(await this.findClient())) return false;
      try {
        await attempt();
        return true;
      } catch (err) {
        console.warn('[hyprland] dispatch falló:', errorMessage(err));
        return false;
      }
    }
  }

  /**
   * Al recargar la config (hyprctl reload / guardar hyprland.lua) Hyprland
   * descarta reglas y atajos inyectados en caliente: se vuelven a poner.
   */
  private watchConfigReloads(): void {
    const sig = process.env.HYPRLAND_INSTANCE_SIGNATURE;
    const runtime = process.env.XDG_RUNTIME_DIR;
    if (!sig || !runtime) return;
    const socketPath = path.join(runtime, 'hypr', sig, '.socket2.sock');
    const socket = net.connect(socketPath);
    socket.unref();
    let buf = '';
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.startsWith('configreloaded>>')) void this.reapply();
      }
    });
    socket.on('error', () => {
      /* sin socket de eventos: la integración sigue, solo sin re-aplicar */
    });
    this.events = socket;
  }

  private async reapply(): Promise<void> {
    if (this.disposed) return;
    try {
      await this.run(['eval', overlayRuleLua(this.ruleName, this.windowClass)]);
      await this.registerBinds(this.binds);
      // El reload puede haber reseteado las propiedades de la ventana.
      const passthrough = this.passthrough;
      this.passthrough = null;
      if (passthrough != null) await this.setPassthrough(passthrough);
    } catch (err) {
      console.warn('[hyprland] no se pudo re-aplicar tras recargar la config:', errorMessage(err));
    }
  }
}

/** Firma modmask:tecla de una combinación, comparable con `hyprctl -j binds`. */
export function bindSignature(keys: string): string {
  const MODS: Record<string, number> = { SHIFT: 1, CAPS: 2, CTRL: 4, CONTROL: 4, ALT: 8, MOD2: 16, MOD3: 32, SUPER: 64, WIN: 64, MOD5: 128 };
  let mask = 0;
  let key = '';
  for (const part of keys.split('+').map((p) => p.trim()).filter(Boolean)) {
    const mod = MODS[part.toUpperCase()];
    if (mod) mask |= mod;
    else key = part;
  }
  return `${mask}:${key.toLowerCase()}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
