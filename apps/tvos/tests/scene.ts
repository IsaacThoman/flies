// The Apple TV app's own test scene (`npm run tvos -- build --test-scene`), so the app can be
// checked without the game: plain three.js and the Web APIs the game relies on, each checked,
// with the results logged as `report {json}` every two seconds for simulator.tvos.ts.
//
//   - a spinning cube, and a label drawn on a 2D canvas used as a CanvasTexture;
//   - the remote's events: keys (with repeats), touches, and Back at the root;
//   - a small render target read back with readPixels, timed, synchronously then through
//     three's readRenderTargetPixelsAsync (a pixel-pack buffer and a fence);
//   - Web Audio: a beep from generated samples with a gain ramp, and decodeAudioData;
//   - localStorage and fetch of the app's own files;
//   - the brain bridge, end to end, against the stand-in brain (tests/brain-stand-in).
import * as THREE from 'three';
import { AT_ROOT_PROPERTY, COMMAND_ORDER, REMOTE_TOUCH_EVENT, STATE_STATS } from '@fly/contracts';
import type { NativeBrainBridge, RemoteTouch } from '@fly/contracts';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(640, 480, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#8fd0ff');
const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
camera.position.set(0, 0, 4);
scene.add(new THREE.HemisphereLight('#ffffff', '#6aa84f', 2.5));
const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#e5483e' }));
scene.add(cube);

// What the checks found; logged as the report.
const report = {
  frames: 0,
  keys: [] as string[],
  touches: 0,
  lastTouch: null as RemoteTouch | null,
  text: null as null | { width: number; inked: number },
  readback: null as null | { ok: boolean; reads: number; meanMs: number; maxMs: number; frameMs: number; plainFrameMs: number },
  readbackAsync: null as null | { ok: boolean; reads: number; meanMs: number; meanFrames: number; frameMs: number },
  audio: { beeps: 0, ended: 0, decoded: null as null | { length: number; sampleRate: number } },
  storage: null as null | boolean,
  fetched: null as null | string,
  brain: null as null | Record<string, unknown>,
};

// A label on a 2D canvas, used as a texture: the game draws all its text this way.
const label = document.createElement('canvas');
label.width = 256; label.height = 64;
const ctx = label.getContext('2d') as CanvasRenderingContext2D;
const labelTexture = new THREE.CanvasTexture(label);
labelTexture.colorSpace = THREE.SRGBColorSpace;
const plaque = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true }));
plaque.position.set(0, 1.25, 0);
scene.add(plaque);
function drawLabel(text: string) {
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath(); ctx.roundRect(2, 2, 252, 60, 14); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 33);
  labelTexture.needsUpdate = true;
}
drawLabel('fly test');
{
  ctx.font = 'bold 28px sans-serif';
  const width = ctx.measureText('fly test').width;
  const pixels = ctx.getImageData(0, 0, 256, 64).data;
  let inked = 0;
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 100 && pixels[i + 3] > 200) inked++;
  report.text = { width: Math.round(width), inked };
}

// A finger on the touch surface moves a dot over the scene.
const dot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 8), new THREE.MeshBasicMaterial({ color: '#ffe14d' }));
dot.position.z = 0.8;
scene.add(dot);

// The eye: a render target looking at a red left half and a green right half.
const EYE_W = 32, EYE_H = 16;
const eyeTarget = new THREE.WebGLRenderTarget(EYE_W, EYE_H);
const eyeScene = new THREE.Scene();
const eyeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
eyeCamera.position.z = 1;
for (const [x, color] of [[-0.5, '#ff0000'], [0.5, '#00ff00']] as const) {
  const half = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), new THREE.MeshBasicMaterial({ color }));
  half.position.x = x;
  eyeScene.add(half);
}
const eyePixels = new Uint8Array(EYE_W * EYE_H * 4);
const eyeLooksRight = (p: Uint8Array) => {
  const at = (x: number, y: number) => [...p.subarray((y * EYE_W + x) * 4, (y * EYE_W + x) * 4 + 4)];
  const [l, r] = [at(2, 8), at(EYE_W - 3, 8)];
  return l[0] === 255 && l[1] === 0 && r[0] === 0 && r[1] === 255 && l[3] === 255 && r[3] === 255;
};

// Phases of readback, after start-up settles: frames without it, then a synchronous read every
// frame, then async reads.
const WARMUP_FRAMES = 30, PHASE_FRAMES = 60;
const phaseOf = (frame: number) => (frame < WARMUP_FRAMES ? -1 : Math.floor((frame - WARMUP_FRAMES) / PHASE_FRAMES));
const frameTimes: number[] = [];
const syncTimes: number[] = [];
let syncOk = true;
const asyncTimes: number[] = [];
const asyncFrames: number[] = [];
let asyncOk = true, asyncPending = false;
const mean = (a: number[]) => Math.round((a.reduce((s, x) => s + x, 0) / Math.max(1, a.length)) * 100) / 100;

function readback() {
  const phase = phaseOf(report.frames);
  if (phase < 1) return;
  renderer.setRenderTarget(eyeTarget);
  renderer.render(eyeScene, eyeCamera);
  renderer.setRenderTarget(null);
  if (phase === 1) {
    const t = performance.now();
    renderer.readRenderTargetPixels(eyeTarget, 0, 0, EYE_W, EYE_H, eyePixels);
    syncTimes.push(performance.now() - t);
    syncOk &&= eyeLooksRight(eyePixels);
  } else if (phase === 2 && !asyncPending) {
    asyncPending = true;
    const t = performance.now(), f = report.frames;
    const out = new Uint8Array(EYE_W * EYE_H * 4);
    void renderer.readRenderTargetPixelsAsync(eyeTarget, 0, 0, EYE_W, EYE_H, out).then(() => {
      asyncTimes.push(performance.now() - t);
      asyncFrames.push(report.frames - f);
      asyncOk &&= eyeLooksRight(out);
      asyncPending = false;
    });
  }
}

function summariseReadback() {
  const interval = (phase: number) => {
    const t = frameTimes.slice(WARMUP_FRAMES + phase * PHASE_FRAMES, WARMUP_FRAMES + (phase + 1) * PHASE_FRAMES);
    return Math.round(((t[t.length - 1] - t[0]) / Math.max(1, t.length - 1)) * 10) / 10;
  };
  if (phaseOf(report.frames) >= 2 && !report.readback) {
    report.readback = { ok: syncOk, reads: syncTimes.length, meanMs: mean(syncTimes), maxMs: Math.round(Math.max(...syncTimes) * 100) / 100, frameMs: interval(1), plainFrameMs: interval(0) };
  }
  if (phaseOf(report.frames) >= 3 && !report.readbackAsync) {
    report.readbackAsync = { ok: asyncOk && asyncTimes.length > 0, reads: asyncTimes.length, meanMs: mean(asyncTimes), meanFrames: mean(asyncFrames), frameMs: interval(2) };
  }
}

// Web Audio: a beep built from samples, with a gain ramp; and a WAV decoded.
let audio: AudioContext | null = null;
function beep() {
  audio ??= new AudioContext();
  const rate = audio.sampleRate, buffer = audio.createBuffer(1, Math.round(rate * 0.15), rate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.sin((2 * Math.PI * 880 * i) / rate) * 0.3;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(1, audio.currentTime);
  gain.gain.linearRampToValueAtTime(0, audio.currentTime + 0.15);
  gain.connect(audio.destination);
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.connect(gain);
  source.addEventListener('ended', () => { report.audio.ended++; });
  source.start();
  report.audio.beeps++;
}
function wav(samples: number, rate: number) {
  const b = new DataView(new ArrayBuffer(44 + samples * 2));
  const text = (o: number, s: string) => { for (let i = 0; i < s.length; i++) b.setUint8(o + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); b.setUint32(4, 36 + samples * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true); b.setUint32(24, rate, true);
  b.setUint32(28, rate * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); text(36, 'data'); b.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) b.setInt16(44 + i * 2, Math.sin(i / 10) * 8000, true);
  return b.buffer;
}

// The remote.
const atRoot = window as unknown as Record<string, boolean>;
window.addEventListener('keydown', (e) => {
  report.keys.push(`${e.key}${e.repeat ? '+' : ''}`);
  drawLabel(e.key);
  if (e.key === 'Enter') beep();
  // Play/Pause takes the scene to its "root": Back then belongs to tvOS.
  if (e.key === 'MediaPlayPause') atRoot[AT_ROOT_PROPERTY] = true;
});
window.addEventListener('keyup', (e) => { report.keys.push(`${e.key}^`); });
window.addEventListener(REMOTE_TOUCH_EVENT, (event) => {
  const touch = (event as CustomEvent<RemoteTouch>).detail;
  report.touches++;
  report.lastTouch = touch;
  dot.position.set(touch.x * 2, touch.y * 1.2, 0.8);
  (dot.material as THREE.MeshBasicMaterial).color.set(touch.touching ? '#ffe14d' : '#888888');
});

// Storage, files, decoding.
localStorage.setItem('fly.test', String(Number(localStorage.getItem('fly.test') ?? 0) + 1));
report.storage = Number(localStorage.getItem('fly.test')) > 0 && localStorage.length > 0;
void fetch('config.json').then((r) => r.json()).then((c: { script?: string }) => { report.fetched = c.script ?? 'no script'; }, (e: unknown) => { report.fetched = `failed: ${String(e)}`; });
void new AudioContext().decodeAudioData(wav(4410, 22050)).then((b) => { report.audio.decoded = { length: b.length, sampleRate: b.sampleRate }; });

// The brain: senses with the left eye dark and the right bright, sweet on the mouthparts.
const brain = (globalThis as unknown as { __native?: { brain?: NativeBrainBridge } }).__native?.brain;
const scalars = new Float32Array([0, 0, 0, 0, 0, 0, 0.5, 1]);
let light: [Float32Array, Float32Array] | null = null;
const state = new Float32Array(COMMAND_ORDER.length + STATE_STATS.length + 2);
let brainFrames = 0, burst = false, maxSimMs = 0, lastCount = 0;
function tickBrain(dtMs: number) {
  if (!brain) { report.brain = { error: 'no __native.brain' }; return; }
  if (brain.status() === 'loading') return;
  canvas.dataset.brain = brain.status();
  if (brain.status() === 'failed') { report.brain = { error: brain.error() }; return; }
  if (!light) {
    const [left, right] = [brain.eyeDirections(0), brain.eyeDirections(1)];
    light = [new Float32Array(left.length / 3).fill(0.2), new Float32Array(right.length / 3).fill(0.8)];
    report.brain = { neurons: brain.neurons(), connections: brain.connections(), facets: [left.length / 3, right.length / 3], acceptance: brain.eyeAcceptance(), rates: brain.rateNames() };
  }
  brain.submit(dtMs, scalars, light[0], light[1]);
  // Once, a burst of 600 ms submitted at once: at most 100 ms of it may be simulated in one step.
  if (++brainFrames === 10) { for (let i = 0; i < 20; i++) brain.submit(30, scalars, light[0], light[1]); burst = true; }
  const count = brain.read(state);
  if (count > lastCount) {
    lastCount = count;
    const simMs = state[COMMAND_ORDER.length + STATE_STATS.indexOf('simMs')];
    if (burst) maxSimMs = Math.max(maxSimMs, simMs);
    const command = Object.fromEntries(COMMAND_ORDER.map((k, i) => [k, Math.round(state[i] * 1000) / 1000]));
    Object.assign(report.brain ?? {}, { states: count, command, simMs, maxSimMsAfterBurst: maxSimMs, simulatedMs: state[COMMAND_ORDER.length + STATE_STATS.length + 1] });
  }
}
brain?.start(7);

let last = performance.now();
const frame = (now: number) => {
  const dt = Math.min(now - last, 1000);
  last = now;
  report.frames++;
  frameTimes.push(now);
  cube.rotation.y += dt / 1000;
  cube.rotation.x += (dt / 1000) * 0.6;
  readback();
  renderer.render(scene, camera);
  tickBrain(dt);
  summariseReadback();
  canvas.dataset.ready = 'true';
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
setInterval(() => console.log(`report ${JSON.stringify(report)}`), 2000);
