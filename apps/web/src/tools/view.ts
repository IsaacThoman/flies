// How the hands look: the pointer (a glossy ring on whatever it rests on, with
// the tool floating over it), food falling and lying where it fell, the beach
// ball, the feather and puffs of air. Each kind of thing is one instanced
// draw, and nothing is drawn that isn't there.

import * as THREE from "three";
import { FOODS } from "@fly/world";
import type { FoodKind, Pantry } from "@fly/world";
import { canvas2d, canvasTexture, paint, random } from "../scene/build.ts";
import { BALL_RADIUS, TOOLS } from "./hands.ts";
import type { Hands, ToolId } from "./hands.ts";

const KINDS: readonly FoodKind[] = ["sugar", "honey", "berry", "water"];
const MAX_FOOD = 8;
const PUFFS = 24;

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
export function drawToolIcon(g: CanvasRenderingContext2D, tool: ToolId, x: number, y: number, r: number) {
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
      const colors = ["#ff4d6d", "#ffffff", "#2fa8ff", "#ffffff", "#ffd23a", "#ffffff"];
      for (let i = 0; i < 6; i++) {
        g.fillStyle = colors[i];
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
  }
  g.restore();
}

function puffTexture() {
  const { canvas, g } = canvas2d(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.5, "rgba(220,245,255,0.45)");
  grad.addColorStop(1, "rgba(220,245,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return canvasTexture(canvas);
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
  }
}

export class HandsView {
  readonly group = new THREE.Group();
  #ring: THREE.Mesh;
  #icon: THREE.Sprite;
  #icons = new Map<ToolId, THREE.Texture>();
  #foods = new Map<FoodKind, THREE.InstancedMesh>();
  #ball: THREE.Mesh;
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
  #rnd = random(9);
  #counts: Record<FoodKind, number> = { sugar: 0, honey: 0, berry: 0, water: 0 };
  /** 0 hides the pointer and tool (the wallpaper), 1 shows them. */
  opacity = 1;

  /** The things here that are really in the fly's world, for its eyes: the ball, the feather and the food. */
  get seen(): THREE.Object3D[] {
    return [this.#ball, this.#feather, ...this.#foods.values()];
  }

  constructor(parent: THREE.Object3D) {
    parent.add(this.group);
    this.#ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    this.#ring.renderOrder = 8;
    this.group.add(this.#ring);
    for (const tool of TOOLS) this.#icons.set(tool.id, iconTexture(tool.id));
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
    // A beach ball: six coloured panels.
    const colors = [new THREE.Color("#ff4d6d"), new THREE.Color("#ffffff"), new THREE.Color("#2fa8ff"), new THREE.Color("#ffffff"), new THREE.Color("#ffd23a"), new THREE.Color("#ffffff")];
    this.#ball = new THREE.Mesh(
      paint(new THREE.SphereGeometry(BALL_RADIUS, 36, 20), (p) => (Math.abs(p.y) > BALL_RADIUS * 0.93 ? new THREE.Color("#ffffff") : colors[Math.floor(((Math.atan2(p.z, p.x) / (Math.PI * 2) + 1) % 1) * 6)])),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, envMapIntensity: 0.8 }),
    );
    this.#ball.visible = false;
    this.group.add(this.#ball);
    // A pink feather: a curved vane with a quill.
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(4, 9, 1.2, 22);
    shape.quadraticCurveTo(-3, 10, 0, 0);
    const vane = paint(new THREE.ShapeGeometry(shape, 10), (p) => (Math.abs(p.x - p.y * 0.05) < 0.25 ? "#fff3fa" : p.y > 15 ? "#ff9ccc" : "#ffc6e3"));
    this.#feather = new THREE.Mesh(vane, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }));
    this.#feather.visible = false;
    this.group.add(this.#feather);
    this.#puffs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: puffTexture(), transparent: true, depthWrite: false, opacity: 0.7 }), PUFFS);
    this.#puffs.frustumCulled = false;
    this.#puffs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.#puffs.renderOrder = 7;
    this.#puffs.visible = false;
    this.group.add(this.#puffs);
  }

  update(hands: Hands, pantry: Pantry, camera: THREE.Camera, time: number, dt: number) {
    const showPointer = this.opacity > 0.01;
    const p = hands.pointer;
    const ring = this.#ring;
    ring.visible = showPointer;
    if (showPointer) {
      this.#n.set(hands.normal.x, hands.normal.y, hands.normal.z);
      ring.quaternion.setFromUnitVectors(UP, this.#n);
      // Sized to look the same however far the camera is.
      const size = camera.position.distanceTo(this.#p.set(p.x, p.y, p.z)) * 0.13 * (1 + Math.sin(time * 4) * 0.06);
      ring.scale.set(size, 1, size);
      ring.position.set(p.x + this.#n.x * 0.05, p.y + this.#n.y * 0.05, p.z + this.#n.z * 0.05);
      (ring.material as THREE.MeshBasicMaterial).opacity = this.opacity;
      const icon = this.#icon;
      const id = hands.current.id;
      const map = this.#icons.get(id)!;
      if (icon.material.map !== map) icon.material.map = map;
      icon.material.opacity = this.opacity;
      const s = size * 0.55;
      icon.scale.set(s, s, 1);
      icon.position.set(p.x, p.y + size * 0.75 + Math.sin(time * 2.4) * size * 0.05, p.z);
      icon.visible = id !== "feather";
    } else this.#icon.visible = false;

    // Food: falling, and lying where it fell, shrinking as it is eaten.
    const counts = this.#counts;
    for (const kind of KINDS) counts[kind] = 0;
    const place = (kind: FoodKind, x: number, y: number, z: number, scale: number, spin: number) => {
      const mesh = this.#foods.get(kind)!;
      const i = counts[kind];
      if (i >= MAX_FOOD) return;
      counts[kind] = i + 1;
      this.#q.setFromAxisAngle(UP, spin);
      mesh.setMatrixAt(i, this.#m.compose(this.#p.set(x, y, z), this.#q, this.#s.setScalar(scale)));
    };
    for (const f of hands.falling) place(f.kind, f.x, f.y, f.z, 1, f.y * 0.3);
    for (const food of pantry.foods) if (food.kind !== "patch") place(food.kind, food.x, food.y, food.z, 0.35 + 0.65 * Math.cbrt(food.amount), food.id * 1.7);
    for (const [kind, mesh] of this.#foods) {
      const n = counts[kind];
      mesh.count = n;
      mesh.visible = n > 0;
      if (n > 0) mesh.instanceMatrix.needsUpdate = true;
    }

    const ball = hands.ball;
    this.#ball.visible = ball.active;
    if (ball.active) {
      this.#ball.position.set(ball.position.x, ball.position.y, ball.position.z);
      this.#ball.rotation.set(ball.spin, ball.spin * 0.6, 0);
    }

    const feather = this.#feather;
    feather.visible = showPointer && hands.current.id === "feather";
    if (feather.visible) {
      const wiggle = hands.stroking ? Math.sin(time * 18) * 0.5 : Math.sin(time * 2) * 0.1;
      feather.position.set(p.x + Math.sin(time * 18) * (hands.stroking ? 0.8 : 0), p.y + 0.3, p.z);
      feather.rotation.set(-0.9 + wiggle * 0.3, time * 0.3, wiggle);
      (feather.material as THREE.MeshStandardMaterial).opacity = this.opacity;
    }

    // Puffs stream from the camera side through the pointer while blowing.
    this.#puffTimer += dt;
    const puffs = this.#puffState;
    if (hands.blowing && this.#puffTimer > 0.04) {
      this.#puffTimer = 0;
      const d = hands.puffDirection;
      const s = this.#puffState[this.#nextPuff];
      this.#nextPuff = (this.#nextPuff + 1) % PUFFS;
      const r = this.#rnd;
      s.age = 0;
      s.x = p.x - d.x * 40 + r.range(-4, 4);
      s.y = p.y + 8 + r.range(-3, 3);
      s.z = p.z - d.z * 40 + r.range(-4, 4);
      const speed = hands.variant.id === "strong" ? 160 : 80;
      s.vx = d.x * speed;
      s.vy = r.range(-6, 6);
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
      const size = 4 + s.age * 14;
      this.#m.compose(this.#p.set(s.x, s.y, s.z), cam, this.#s.setScalar(size * Math.sin(Math.min(1, s.age) * Math.PI)));
      this.#m.toArray(m, live * 16);
      live++;
    }
    this.#puffs.count = live;
    this.#puffs.visible = live > 0;
    if (live > 0) this.#puffs.instanceMatrix.needsUpdate = true;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
