// How the hands look: the pointer (a glossy ring on whatever it rests on, with
// the tool floating over it), food falling and lying where it fell, the beach
// ball, the feather and puffs of air. Each kind of thing is one instanced
// draw, and nothing is drawn that isn't there.

import * as THREE from "three";
import { BALL_RADIUS, FOODS, isDropped } from "@fly/world";
import type { FoodKind, Pantry, Vec3 } from "@fly/world";
import { canvas2d, canvasTexture, paint, random } from "../scene/build.ts";
import { TOOLS } from "./hands.ts";
import type { Hands, ToolId } from "./hands.ts";

const KINDS: readonly FoodKind[] = ["sugar", "honey", "berry", "water", "coffee", "laced"];
const MAX_FOOD = 8;
const BALL_COLORS = ["#b0183a", "#4a2060", "#e0284a", "#4a2060", "#b0183a", "#2c4a3a"];
const PUFFS = 24;
/** How far (a share of its size) a use presses the ring in, a held tool keeps it in, and how long food's landing ripples (s). */
const PRESS_IN = 0.22;
const HOLD_IN = 0.1;
const RIPPLE_SECONDS = 0.8;

function ringTexture() {
  const { canvas, g } = canvas2d(128, 128);
  const glow = g.createRadialGradient(64, 64, 20, 64, 64, 64);
  glow.addColorStop(0, "rgba(255,255,255,0)");
  glow.addColorStop(0.55, "rgba(140, 230, 255, 0.0)");
  glow.addColorStop(0.72, "rgba(255, 255, 255, 0.95)");
  glow.addColorStop(0.8, "rgba(60, 190, 255, 0.9)");
  glow.addColorStop(0.9, "rgba(60, 190, 255, 0.25)");
  glow.addColorStop(1, "rgba(60, 190, 255, 0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, 128, 128);
  return canvasTexture(canvas);
}

/** The tool's picture, drawn on a glass bubble, for floating over the pointer. */
function iconTexture(tool: ToolId) {
  const { canvas, g } = canvas2d(128, 128);
  const body = g.createRadialGradient(48, 40, 6, 64, 64, 60);
  body.addColorStop(0, "rgba(255,255,255,0.95)");
  body.addColorStop(0.7, "rgba(190, 235, 255, 0.85)");
  body.addColorStop(1, "rgba(80, 170, 240, 0.9)");
  g.fillStyle = body;
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = "rgba(20, 100, 180, 0.8)";
  g.stroke();
  drawToolIcon(g, tool, 64, 66, 34);
  g.fillStyle = "rgba(255,255,255,0.7)";
  g.beginPath();
  g.ellipse(52, 30, 26, 11, -0.3, 0, Math.PI * 2);
  g.fill();
  return canvasTexture(canvas);
}

/** A tool's picture, centred on (x, y), `r` across in each direction. Shared with the shelf. */
/** What a tool's picture can be of: a tool, or one of the Sky's dials (its time of day, its weather). */
export type ToolIcon = ToolId | "light" | "weather";

export function drawToolIcon(g: CanvasRenderingContext2D, tool: ToolIcon, x: number, y: number, r: number) {
  g.save();
  g.translate(x, y);
  g.lineCap = "round";
  g.lineJoin = "round";
  switch (tool) {
    case "feed": {
      // A sugar cube and a drop of honey.
      g.fillStyle = "#ffffff";
      g.strokeStyle = "#2a6fb0";
      g.lineWidth = r * 0.08;
      g.beginPath();
      g.rect(-r * 0.7, -r * 0.2, r * 0.6, r * 0.6);
      g.fill();
      g.stroke();
      g.fillStyle = "#ffb11c";
      g.beginPath();
      g.moveTo(r * 0.35, -r * 0.65);
      g.quadraticCurveTo(r * 0.85, r * 0.05, r * 0.35, r * 0.4);
      g.quadraticCurveTo(-r * 0.15, r * 0.05, r * 0.35, -r * 0.65);
      g.fill();
      g.stroke();
      break;
    }
    case "swoop": {
      for (let i = 0; i < 6; i++) {
        g.fillStyle = BALL_COLORS[i];
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, r * 0.75, (i / 6) * Math.PI * 2, ((i + 1) / 6) * Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = "#1d4f8a";
      g.lineWidth = r * 0.08;
      g.beginPath();
      g.arc(0, 0, r * 0.75, 0, Math.PI * 2);
      g.stroke();
      break;
    }
    case "feather": {
      g.rotate(-0.6);
      g.fillStyle = "#ffd1ea";
      g.strokeStyle = "#c2468a";
      g.lineWidth = r * 0.07;
      g.beginPath();
      g.moveTo(0, -r * 0.9);
      g.quadraticCurveTo(r * 0.55, -r * 0.2, 0, r * 0.7);
      g.quadraticCurveTo(-r * 0.55, -r * 0.2, 0, -r * 0.9);
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(0, -r * 0.8);
      g.lineTo(0, r * 0.95);
      g.stroke();
      break;
    }
    case "blow": {
      g.strokeStyle = "#2a8fe0";
      g.lineWidth = r * 0.14;
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.moveTo(-r * 0.75, i * r * 0.38);
        g.quadraticCurveTo(0, i * r * 0.38 - r * 0.25, r * 0.55, i * r * 0.38);
        g.stroke();
      }
      break;
    }
    case "build": {
      // A blue tile, a yellow dish on it and a little wooden wall behind.
      g.lineWidth = r * 0.08;
      g.fillStyle = "#e2c18e";
      g.strokeStyle = "#8a6640";
      g.beginPath();
      g.rect(-r * 0.75, -r * 0.7, r * 0.5, r * 1.1);
      g.fill();
      g.stroke();
      g.fillStyle = "#3d8ef0";
      g.strokeStyle = "#1d4f8a";
      g.beginPath();
      g.moveTo(-r * 0.2, r * 0.25);
      g.lineTo(r * 0.45, -r * 0.05);
      g.lineTo(r * 0.9, r * 0.25);
      g.lineTo(r * 0.25, r * 0.6);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = "#f5c01a";
      g.strokeStyle = "#a36a00";
      g.beginPath();
      g.ellipse(r * 0.35, r * 0.1, r * 0.32, r * 0.17, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      break;
    }
    case "light": {
      g.fillStyle = "#ffcf2e";
      g.strokeStyle = "#e88a00";
      g.lineWidth = r * 0.08;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.beginPath();
        g.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5);
        g.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85);
        g.stroke();
      }
      g.beginPath();
      g.arc(0, 0, r * 0.4, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      break;
    }
    case "weather": {
      // A cloud over the sun, raining.
      g.fillStyle = "#ffcf2e";
      g.strokeStyle = "#e88a00";
      g.lineWidth = r * 0.07;
      g.beginPath();
      g.arc(r * 0.3, -r * 0.35, r * 0.34, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = "#ffffff";
      g.strokeStyle = "#5a7ea8";
      g.lineWidth = r * 0.08;
      g.beginPath();
      g.moveTo(-r * 0.62, r * 0.28);
      g.arc(-r * 0.42, r * 0.08, r * 0.24, Math.PI * 0.6, Math.PI * 1.45);
      g.arc(-r * 0.08, -r * 0.1, r * 0.34, Math.PI * 1.1, Math.PI * 1.9);
      g.arc(r * 0.4, r * 0.08, r * 0.26, Math.PI * 1.45, Math.PI * 0.45);
      g.closePath();
      g.fill();
      g.stroke();
      g.strokeStyle = "#2a8fe0";
      g.lineWidth = r * 0.1;
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.moveTo(i * r * 0.32 + r * 0.06, r * 0.5);
        g.lineTo(i * r * 0.32 - r * 0.04, r * 0.78);
        g.stroke();
      }
      break;
    }
    case "sky": {
      // The sun, rayed, with a cloud passing low in front of it: the time of day and the weather.
      g.fillStyle = "#ffcf2e";
      g.strokeStyle = "#e88a00";
      g.lineWidth = r * 0.08;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.beginPath();
        g.moveTo(r * 0.22 + Math.cos(a) * r * 0.42, -r * 0.22 + Math.sin(a) * r * 0.42);
        g.lineTo(r * 0.22 + Math.cos(a) * r * 0.66, -r * 0.22 + Math.sin(a) * r * 0.66);
        g.stroke();
      }
      g.beginPath();
      g.arc(r * 0.22, -r * 0.22, r * 0.32, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = "#ffffff";
      g.strokeStyle = "#5a7ea8";
      g.beginPath();
      g.moveTo(-r * 0.7, r * 0.5);
      g.arc(-r * 0.5, r * 0.3, r * 0.24, Math.PI * 0.6, Math.PI * 1.45);
      g.arc(-r * 0.14, r * 0.12, r * 0.34, Math.PI * 1.1, Math.PI * 1.9);
      g.arc(r * 0.34, r * 0.3, r * 0.26, Math.PI * 1.45, Math.PI * 0.45);
      g.closePath();
      g.fill();
      g.stroke();
      break;
    }
    case "view": {
      g.fillStyle = "#3a4a6a";
      g.beginPath();
      g.rect(-r * 0.7, -r * 0.35, r * 1.15, r * 0.75);
      g.fill();
      g.beginPath();
      g.moveTo(r * 0.45, -r * 0.1);
      g.lineTo(r * 0.85, -r * 0.35);
      g.lineTo(r * 0.85, r * 0.4);
      g.lineTo(r * 0.45, r * 0.15);
      g.fill();
      g.fillStyle = "#9fe0ff";
      g.beginPath();
      g.arc(-r * 0.12, r * 0.02, r * 0.22, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case "place": {
      // A map pin.
      g.fillStyle = "#ff5a6e";
      g.strokeStyle = "#b0183a";
      g.lineWidth = r * 0.08;
      g.beginPath();
      g.moveTo(0, r * 0.9);
      g.bezierCurveTo(-r * 0.25, r * 0.35, -r * 0.62, r * 0.05, -r * 0.62, -r * 0.3);
      g.arc(0, -r * 0.3, r * 0.62, Math.PI, 0);
      g.bezierCurveTo(r * 0.62, r * 0.05, r * 0.25, r * 0.35, 0, r * 0.9);
      g.fill();
      g.stroke();
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(0, -r * 0.3, r * 0.24, 0, Math.PI * 2);
      g.fill();
      break;
    }
  }
  g.restore();
}

/** The feather's length, mm: a small plume next to a fly 2.5 mm long. */
const FEATHER_SIZE = 7.5;

/** A downy pink plume: a pale quill, barbs sweeping back from it, fluffier toward the base. Tip at the bottom. */
function featherTexture() {
  const { canvas, g } = canvas2d(64, 192);
  const rnd = random(5);
  g.lineCap = "round";
  for (let i = 0; i < 70; i++) {
    const t = i / 70;
    const y = 8 + t * 176;
    // Widest a third of the way from the quill end, narrowing to the tip.
    const width = Math.sin(Math.min(1, (1 - t) * 1.25) * Math.PI * 0.95) * 26 + 3;
    const fluffy = t < 0.25 ? 1 - t * 4 : 0;
    for (const side of [-1, 1]) {
      g.strokeStyle = `rgba(${255}, ${150 + rnd.range(0, 60)}, ${200 + rnd.range(0, 40)}, ${0.55 + rnd.range(0, 0.35)})`;
      g.lineWidth = 1.2 + fluffy * 1.5;
      g.beginPath();
      g.moveTo(32, y);
      g.quadraticCurveTo(32 + side * width * 0.6, y - 4 - fluffy * 6, 32 + side * width * rnd.range(0.85, 1.05), y - 12 - fluffy * 10 + rnd.range(-3, 3));
      g.stroke();
    }
  }
  g.strokeStyle = "rgba(255, 245, 250, 0.95)";
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(32, 2);
  g.lineTo(32, 186);
  g.stroke();
  return canvasTexture(canvas);
}

function shadowTexture() {
  const { canvas, g } = canvas2d(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(20, 30, 50, 0.75)");
  grad.addColorStop(0.55, "rgba(20, 30, 50, 0.45)");
  grad.addColorStop(1, "rgba(20, 30, 50, 0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return canvasTexture(canvas);
}

/** A gust: two curling strokes, white with a soft blue edge so they show on the white cloth. */
function puffTexture() {
  const { canvas, g } = canvas2d(128, 64);
  g.lineCap = "round";
  const stroke = (y: number, curl: number, width: number) => {
    g.beginPath();
    g.moveTo(10, y);
    g.bezierCurveTo(45, y - 10, 80, y + 8, 104, y - 2);
    g.arc(104 - curl, y - 2, curl, 0, -Math.PI * 1.3, true);
    g.lineWidth = width + 4;
    g.strokeStyle = "rgba(60, 150, 230, 0.45)";
    g.stroke();
    g.lineWidth = width;
    g.strokeStyle = "rgba(255, 255, 255, 0.95)";
    g.stroke();
  };
  stroke(24, 9, 4);
  stroke(44, 6, 3);
  return canvasTexture(canvas);
}

/** The textures every hand draws with, made the first time one is wanted: another player's hand at a table draws with the same ones. */
let textures: { ring: THREE.Texture; icons: Map<ToolId, THREE.Texture>; feather: THREE.Texture; shadow: THREE.Texture; puff: THREE.Texture } | null = null;

function sharedTextures() {
  return (textures ??= { ring: ringTexture(), icons: new Map(TOOLS.map((t) => [t.id, iconTexture(t.id)])), feather: featherTexture(), shadow: shadowTexture(), puff: puffTexture() });
}

function foodGeometry(kind: FoodKind) {
  const r = FOODS[kind].r;
  switch (kind) {
    case "sugar":
      return paint(new THREE.BoxGeometry(r * 1.3, r * 1.3, r * 1.3).translate(0, r * 0.65, 0), (p) => (p.y > r ? "#ffffff" : "#eaf6ff"));
    case "honey":
      return paint(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.38, 1), (p) => (p.y > r * 0.3 ? "#ffc23a" : "#f08a00"));
    case "berry": {
      const geometry = new THREE.IcosahedronGeometry(r * 0.7, 2);
      const pos = geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const k = 1 + 0.12 * Math.sin(pos.getX(i) * 9) * Math.sin(pos.getY(i) * 9) * Math.sin(pos.getZ(i) * 9);
        pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.7 + r * 0.45, pos.getZ(i) * k);
      }
      return paint(geometry, (p) => (Math.sin(p.x * 14) * Math.sin(p.z * 14) > 0.3 ? "#ff5f8f" : "#e0144e"));
    }
    case "water":
      return paint(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1), "#e8f8ff");
    case "coffee":
      // A drop of black coffee: dark, with a little crema-brown where it is thin at its edge.
      return paint(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.42, 1), (p) => (p.y > r * 0.12 ? "#2a1408" : "#6b3c1c"));
    case "laced": {
      // A sugar lump dipped in coffee: soaked brown from its foot, white above the line.
      const s = r * 1.3;
      return paint(new THREE.BoxGeometry(s, s, s, 1, 3, 1).translate(0, s / 2, 0), (p) => (p.y < s * 0.1 ? "#6e3a16" : p.y < s * 0.4 ? "#d2ab7e" : p.y > r ? "#ffffff" : "#f2f6fa"));
    }
  }
}

export class HandsView {
  readonly group = new THREE.Group();
  #ring: THREE.Mesh;
  /** The ring's impression spreading where food lands. */
  #ripple: THREE.Mesh;
  #rippleAge = RIPPLE_SECONDS;
  #rippleSize = 1;
  /** Seconds since the hand last did something (pressed in) or was refused (shaken), and how far a held tool holds it in. */
  #pressAge = 9;
  #shakeAge = 9;
  #held = false;
  #hold = 0;
  #icon: THREE.Sprite;
  #icons: Map<ToolId, THREE.Texture>;
  #foods = new Map<FoodKind, THREE.InstancedMesh>();
  #ball: THREE.Mesh;
  #ballShadow: THREE.Mesh;
  #feather: THREE.Mesh;
  #puffs: THREE.InstancedMesh;
  #puffState = Array.from({ length: PUFFS }, () => ({ age: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }));
  #nextPuff = 0;
  #puffTimer = 0;
  #m = new THREE.Matrix4();
  #q = new THREE.Quaternion();
  #s = new THREE.Vector3();
  #p = new THREE.Vector3();
  #n = new THREE.Vector3();
  #right = new THREE.Vector3();
  #iconSide = 1;
  #rnd = random(9);
  #counts: Record<FoodKind, number> = { sugar: 0, honey: 0, berry: 0, water: 0, coffee: 0, laced: 0 };
  /** 0 hides the pointer and tool (the wallpaper), 1 shows them. */
  opacity = 1;
  /** The tool's picture floats by the ring (not for another player's hand at a table, whose ring in their colour is enough). */
  icon = true;

  /** The things here that are really in the fly's world, for its eyes: the ball, the feather and the food. */
  get seen(): THREE.Object3D[] {
    return [this.#ball, this.#ballShadow, this.#feather, ...this.#foods.values()];
  }

  constructor(parent: THREE.Object3D) {
    parent.add(this.group);
    const shared = sharedTextures();
    this.#icons = shared.icons;
    this.#ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shared.ring, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    this.#ring.renderOrder = 8;
    this.group.add(this.#ring);
    const ringMaterial = this.#ring.material as THREE.MeshBasicMaterial;
    this.#ripple = new THREE.Mesh(this.#ring.geometry, new THREE.MeshBasicMaterial({ map: ringMaterial.map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    this.#ripple.renderOrder = 8;
    this.#ripple.visible = false;
    this.group.add(this.#ripple);
    this.#icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.#icons.get("feed"), transparent: true, depthTest: false, depthWrite: false }));
    this.#icon.renderOrder = 9;
    this.group.add(this.#icon);

    const glossy = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, envMapIntensity: 0.7 });
    const clear = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.02, transparent: true, opacity: 0.6, envMapIntensity: 2, depthWrite: false });
    for (const kind of KINDS) {
      const mesh = new THREE.InstancedMesh(foodGeometry(kind), kind === "water" ? clear : glossy, MAX_FOOD);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.visible = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.#foods.set(kind, mesh);
      this.group.add(mesh);
    }
    // A beach ball in deep colours. It has to look dark to a fly, whose eyes answer darkening and see mostly blue-green light (packages/body/src/vision.ts), so the colours are dark in green and blue.
    const colors = [new THREE.Color("#7a0f26"), new THREE.Color("#2a1236"), new THREE.Color("#a3122c"), new THREE.Color("#2a1236"), new THREE.Color("#7a0f26"), new THREE.Color("#1a2a22")];
    this.#ball = new THREE.Mesh(
      paint(new THREE.SphereGeometry(BALL_RADIUS, 36, 20), (p) => (Math.abs(p.y) > BALL_RADIUS * 0.93 ? new THREE.Color("#3a1a20") : colors[Math.floor(((Math.atan2(p.z, p.x) / (Math.PI * 2) + 1) % 1) * 6)])),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, envMapIntensity: 0.8 }),
    );
    this.#ball.visible = false;
    this.group.add(this.#ball);
    // Its shadow on the table: darker and sharper the lower it comes.
    this.#ballShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shared.shadow, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    this.#ballShadow.renderOrder = 2;
    this.#ballShadow.visible = false;
    this.group.add(this.#ballShadow);
    // A pink feather, its tip on the pointer and its quill up toward where you sit.
    this.#feather = new THREE.Mesh(new THREE.PlaneGeometry(FEATHER_SIZE * 0.38, FEATHER_SIZE).translate(0, FEATHER_SIZE / 2, 0), new THREE.MeshStandardMaterial({ map: shared.feather, transparent: true, alphaTest: 0.05, roughness: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    this.#feather.renderOrder = 6;
    this.#feather.visible = false;
    this.group.add(this.#feather);
    this.#puffs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shared.puff, transparent: true, depthWrite: false, opacity: 0.7 }), PUFFS);
    this.#puffs.frustumCulled = false;
    this.#puffs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.#puffs.renderOrder = 7;
    this.#puffs.visible = false;
    this.group.add(this.#puffs);
  }

  dispose() {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) geometries.add(mesh.geometry);
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      for (const material of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) materials.add(material);
    });
    // Textures and the sprite quad belong to every hand; only this view's meshes and materials end here.
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.group.removeFromParent();
  }

  /** Colours the pointer's ring and its ripple: another player's hand at a table shows in their colour. */
  tint(colour: THREE.ColorRepresentation) {
    (this.#ring.material as THREE.MeshBasicMaterial).color.set(colour);
    (this.#ripple.material as THREE.MeshBasicMaterial).color.set(colour);
  }

  #place(kind: FoodKind, x: number, y: number, z: number, scale: number, spin: number) {
    const i = this.#counts[kind];
    if (i >= MAX_FOOD) return;
    this.#counts[kind] = i + 1;
    this.#q.setFromAxisAngle(UP, spin);
    this.#foods.get(kind)!.setMatrixAt(i, this.#m.compose(this.#p.set(x, y, z), this.#q, this.#s.setScalar(scale)));
  }

  update(hands: Hands, pantry: Pantry, camera: THREE.Camera, time: number, dt: number, floorAt: (x: number, z: number, below: number) => number, fly: Vec3) {
    const showPointer = this.opacity > 0.01;
    const p = hands.pointer;
    const ring = this.#ring;
    ring.visible = showPointer;
    // The hand answers what it does, as a finger feels a press: using a tool pushes the ring
    // in and it springs back, holding one keeps it in a little, and a refusal shakes it.
    const ev = hands.events;
    const holding = hands.stroking || hands.blowing;
    if (ev.dropped !== null || ev.swooped || ev.built || (holding && !this.#held)) this.#pressAge = 0;
    if (ev.blocked) this.#shakeAge = 0;
    this.#held = holding;
    this.#pressAge += dt;
    this.#shakeAge += dt;
    this.#hold += ((holding ? HOLD_IN : 0) - this.#hold) * Math.min(1, dt * 12);
    if (showPointer) {
      this.#n.set(hands.normal.x, hands.normal.y, hands.normal.z);
      ring.quaternion.setFromUnitVectors(UP, this.#n);
      // Sized to look the same however far the camera is.
      const distance = camera.position.distanceTo(this.#p.set(p.x, p.y, p.z)) * 0.13;
      const press = this.#pressAge < 1 ? Math.exp(-this.#pressAge * 7) * Math.cos(this.#pressAge * 24) * PRESS_IN : 0;
      const size = distance * (1 + Math.sin(time * 4) * 0.06) * (1 - press - this.#hold);
      ring.scale.set(size, 1, size);
      const r = this.#right.setFromMatrixColumn(camera.matrixWorld, 0);
      const shake = this.#shakeAge < 0.6 ? Math.sin(this.#shakeAge * 45) * Math.exp(-this.#shakeAge * 9) * distance * 0.12 : 0;
      ring.position.set(p.x + this.#n.x * 0.05 + r.x * shake, p.y + this.#n.y * 0.05, p.z + this.#n.z * 0.05 + r.z * shake);
      (ring.material as THREE.MeshBasicMaterial).opacity = this.opacity;
      const icon = this.#icon;
      const id = hands.current.id;
      const map = this.#icons.get(id)!;
      if (icon.material.map !== map) icon.material.map = map;
      icon.material.opacity = this.opacity;
      // Floating up beside the ring, on the side away from the fly, so it never covers it.
      const s = size * 0.45;
      icon.scale.set(s, s, 1);
      const away = (p.x - fly.x) * r.x + (p.z - fly.z) * r.z;
      this.#iconSide += ((away < -0.2 ? -1 : away > 0.2 ? 1 : this.#iconSide >= 0 ? 1 : -1) - this.#iconSide) * Math.min(1, dt * 4);
      const bob = Math.sin(time * 2.4) * size * 0.05;
      const out = size * 1.35 * this.#iconSide;
      icon.position.set(p.x + r.x * out, p.y + size * 0.3 + bob, p.z + r.z * out);
      icon.visible = this.icon && id !== "feather";
    } else this.#icon.visible = false;

    // Food landing leaves the ring's impression, spreading and fading where it fell.
    if (ev.landed !== null) {
      this.#rippleAge = 0;
      // Starting at the food's edge (the ring's bright band is about 0.38 of its texture across).
      this.#rippleSize = FOODS[ev.landed].r / 0.38;
      const n = hands.landedNormal;
      this.#n.set(n.x, n.y, n.z);
      this.#ripple.quaternion.setFromUnitVectors(UP, this.#n);
      this.#ripple.position.set(hands.landedAt.x + n.x * 0.05, hands.landedAt.y + n.y * 0.05, hands.landedAt.z + n.z * 0.05);
    }
    this.#rippleAge += dt;
    const ripple = this.#ripple;
    ripple.visible = showPointer && this.#rippleAge < RIPPLE_SECONDS;
    if (ripple.visible) {
      const k = this.#rippleAge / RIPPLE_SECONDS;
      const size = this.#rippleSize * (1 + 1.4 * (1 - (1 - k) * (1 - k)));
      ripple.scale.set(size, 1, size);
      (ripple.material as THREE.MeshBasicMaterial).opacity = (1 - k) * (1 - k) * 0.8 * this.opacity;
    }

    // Food: falling, and lying where it fell, shrinking as it is eaten.
    const counts = this.#counts;
    for (const kind of KINDS) counts[kind] = 0;
    for (const f of hands.falling) this.#place(f.kind, f.x, f.y, f.z, 1, f.y * 0.3);
    for (const food of pantry.foods) if (isDropped(food)) this.#place(food.kind, food.x, food.y, food.z, 0.35 + 0.65 * Math.cbrt(food.amount), food.id * 1.7);
    for (const [kind, mesh] of this.#foods) {
      const n = counts[kind];
      mesh.count = n;
      mesh.visible = n > 0;
      if (n > 0) mesh.instanceMatrix.needsUpdate = true;
    }

    const ball = hands.ball;
    this.#ball.visible = ball.active;
    this.#ballShadow.visible = ball.active;
    if (ball.active) {
      this.#ball.position.set(ball.position.x, ball.position.y, ball.position.z);
      this.#ball.rotation.set(ball.spin, ball.spin * 0.6, 0);
      // Cast straight down: the sun is high, and a soft blob is what a fly would notice.
      const floor = floorAt(ball.position.x, ball.position.z, ball.position.y);
      const height = Math.max(0, ball.position.y - BALL_RADIUS - floor);
      const size = BALL_RADIUS * 2 * (1.1 + height / 120);
      this.#ballShadow.position.set(ball.position.x, floor + 0.05, ball.position.z);
      this.#ballShadow.scale.set(size, 1, size);
      (this.#ballShadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - height / 220);
    }

    const feather = this.#feather;
    feather.visible = showPointer && hands.current.id === "feather";
    if (feather.visible) {
      // Leaning back toward the camera, swaying; stroking, it brushes to and fro.
      const wiggle = hands.stroking ? Math.sin(time * 14) * 0.5 : Math.sin(time * 2) * 0.12;
      this.#right.setFromMatrixColumn(camera.matrixWorld, 0);
      const brush = hands.stroking ? Math.sin(time * 14) * 0.5 : 0;
      feather.position.set(p.x + this.#right.x * brush, p.y + 0.15, p.z + this.#right.z * brush);
      feather.quaternion.copy(camera.quaternion);
      feather.rotateX(-0.5);
      feather.rotateZ(0.35 + wiggle * 0.35);
      (feather.material as THREE.MeshStandardMaterial).opacity = this.opacity;
    }

    // Puffs stream from the camera side through the pointer while blowing.
    this.#puffTimer += dt;
    const puffs = this.#puffState;
    if (hands.blowing && this.#puffTimer > 0.1) {
      this.#puffTimer = 0;
      const d = hands.puffDirection;
      const s = this.#puffState[this.#nextPuff];
      this.#nextPuff = (this.#nextPuff + 1) % PUFFS;
      const r = this.#rnd;
      s.age = 0;
      // From a little way upwind of the spot, low, so they pass the fly rather than the lens.
      s.x = p.x - d.x * 6 + r.range(-1.5, 1.5);
      s.y = p.y + 0.8 + r.range(-0.4, 1.2);
      s.z = p.z - d.z * 6 + r.range(-1.5, 1.5);
      const speed = hands.variant.id === "strong" ? 40 : 20;
      s.vx = d.x * speed;
      s.vy = r.range(-2, 2);
      s.vz = d.z * speed;
    }
    let live = 0;
    const m = this.#puffs.instanceMatrix.array as Float32Array;
    const cam = camera.quaternion;
    for (const s of puffs) {
      if (s.age >= 1) continue;
      s.age += dt * 1.2;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      const size = (0.6 + s.age * 0.8) * Math.sin(Math.min(1, s.age) * Math.PI);
      this.#m.compose(this.#p.set(s.x, s.y, s.z), cam, this.#s.set(size * 2, size, size));
      this.#m.toArray(m, live * 16);
      live++;
    }
    this.#puffs.count = live;
    this.#puffs.visible = live > 0;
    if (live > 0) this.#puffs.instanceMatrix.needsUpdate = true;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
