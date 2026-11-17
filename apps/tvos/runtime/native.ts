// What the native host (src/Host.mm) puts on globalThis.__native before the runtime runs.
import type { NativeBrainBridge, NativeKeyboardBridge, NativeSocketBridge } from '@fly/contracts';

/** Sync queries: they run after every command sent so far (see Native.query). */
export const Q = {
  getParameter: 1, getError: 2, shaderParameter: 3, shaderInfoLog: 4, programInfo: 5, readPixels: 6,
  getBufferSubData: 7, getImageData: 8, checkFramebufferStatus: 9, isEnabled: 10, finish: 11,
  internalformatParameter: 12, texParameter: 13, glInfo: 14, frameStats: 15, clientWaitSync: 16,
} as const;

export interface Native {
  /** 0: every command runs as soon as it is encoded, on this thread (one native call per GL call).
   *  1: commands run when a frame ends or a query needs them, on this thread.
   *  2: commands run on a render thread, a frame behind (pipelined). */
  readonly mode: number;
  /** The command buffers; the host owns their memory. */
  readonly buffers: ArrayBuffer[];
  /** One int: the newest GL fence (WebGLSync) the executor has seen signal. */
  readonly fences: ArrayBuffer;
  /** Hands words [0, n) of the current buffer to the executor and returns the next buffer's index. */
  submit(words: number, endOfFrame: boolean): number;
  /** Copies a large payload into native memory; commands reference it by the returned handle. */
  block(bytes: ArrayBufferView): number;
  /** Interns a string for a command (shader source, canvas text); freed after use. */
  str(text: string): number;
  /** Runs a query after the commands so far. readPixels / getImageData / getBufferSubData write into `out`. */
  query(kind: number, a?: number, b?: number, c?: number, d?: number, e?: number, f?: number, out?: ArrayBufferView): unknown;
  /** A CSS font for measuring and drawing text; the same string always gets the same id. */
  font(css: string): number;
  /** Measures text in a font; writes width, actual bounding box (left, right, ascent, descent) and
   *  font ascent and descent into `metrics`. */
  measureText(font: number, text: string, letterSpacing: number, metrics: Float64Array): void;
  /** Adds a font face for canvas text; false when CoreText can't read the bytes. */
  registerFont(bytes: ArrayBufferView, family: string, weight: number, italic: boolean): boolean;
  /** Decodes an image (bytes or a bundled path) off-thread; calls done(id, width, height) or done(0, 0, 0, message). */
  decodeImage(source: ArrayBufferView | string, done: (id: number, w: number, h: number, error?: string) => void): void;
  releaseImage(id: number): void;
  /** Reads a bundled file (path relative to the bundle's www/), or null. */
  readFile(path: string): ArrayBuffer | null;
  /** Wakes the timer loop (globalThis.__host.timers) after ms. */
  wake(ms: number): void;
  now(): number;
  log(level: number, text: string): void;
  /** Persistent key-value storage (localStorage), in NSUserDefaults. */
  storageGet(key: string): string | null;
  storageSet(key: string, value: string | null): void;
  storageKeys(): string;
  randomBytes(out: ArrayBufferView): void;
  /** The game is (or isn't) at its root: Back then leaves the app. */
  setAtRoot(atRoot: boolean): void;
  /** Tells the host the game is showing its first screen (the splash then fades out). */
  ready(): void;
  /** How hot the device is (ProcessInfo.thermalState): 0 nominal, 1 fair, 2 serious, 3 critical. */
  thermalState(): number;
  /** Scripted remote input, through the same native code as the remote's own:
   *  ('press', key, holdMs), ('swipe', key) or ('touch', x, y, touching). */
  input(kind: 'press', key: string, holdMs: number): void;
  input(kind: 'swipe', key: string): void;
  input(kind: 'touch', x: number, y: number, touching: boolean): void;
  /** Launch configuration as JSON. */
  readonly config: string;
  /** The fly's brain on its own thread (src/Brain.mm). */
  readonly brain: NativeBrainBridge;
  /** A table's line to its room (src/SocketBridge.mm). */
  readonly socket: NativeSocketBridge;
  /** tvOS's keyboard, over the game (src/KeyboardBridge.mm). */
  readonly keyboard: NativeKeyboardBridge;
}

export const native = (globalThis as unknown as { __native: Native }).__native;
