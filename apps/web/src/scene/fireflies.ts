// Fireflies over the table at dusk and at night: a few soft green-gold lights
// drifting in slow loops and blinking, each its own rhythm. One instanced draw
// of camera-facing glows, added onto the picture; nothing at all by day. They
// are scenery: not in the fly's world, so its eyes don't see them.

import * as THREE from "three";
import { canvas2d, canvasTexture, random } from "./build.ts";

const COUNT = 9;

function glowTexture() {
  const { canvas, g } = canvas2d(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255, 255, 230, 1)");
  grad.addColorStop(0.12, "rgba(235, 255, 140, 0.95)");
  grad.addColorStop(0.35, "rgba(170, 240, 80, 0.35)");
  grad.addColorStop(1, "rgba(120, 220, 60, 0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return canvasTexture(canvas);
}

type Firefly = { x: number; y: number; z: number; ax: number; az: number; ay: number; phase: number; speed: number; period: number; offset: number };

export class Fireflies {
  readonly mesh: THREE.InstancedMesh;
  #flies: Firefly[] = [];
  #m = new THREE.Matrix4();
  #p = new THREE.Vector3();
  #s = new THREE.Vector3();
  #material: THREE.MeshBasicMaterial;

  constructor(parent: THREE.Object3D) {
    this.#material = new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.#material, COUNT);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.visible = false;
    parent.add(this.mesh);
    const rnd = random(31);
    for (let i = 0; i < COUNT; i++) {
      // Most over and round the table, low; one or two close by the middle, where the camera usually is.
      const near = i < 4;
      const a = rnd.range(0, Math.PI * 2);
      const r = near ? rnd.range(15, 80) : rnd.range(120, 420);
      this.#flies.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        y: near ? rnd.range(5, 30) : rnd.range(20, 220),
        ax: rnd.range(15, 60),
        az: rnd.range(15, 60),
        ay: rnd.range(4, 18),
        phase: rnd.range(0, 100),
        speed: rnd.range(0.08, 0.2),
        period: rnd.range(2.2, 4.5),
        offset: rnd.range(0, 5),
      });
    }
  }

  /** `dark` is 0 by day to 1 at night (the light's stars). */
  update(time: number, dark: number, camera: THREE.Camera) {
    const show = Math.max(0, Math.min(1, (dark - 0.15) / 0.6));
    this.mesh.visible = show > 0.01;
    if (!this.mesh.visible) return;
    this.#material.opacity = show;
    const q = camera.quaternion;
    for (let i = 0; i < COUNT; i++) {
      const f = this.#flies[i];
      const t = time * f.speed + f.phase;
      // A slow, lazy loop.
      this.#p.set(f.x + Math.sin(t) * f.ax + Math.sin(t * 2.3) * 4, f.y + Math.sin(t * 1.7) * f.ay, f.z + Math.cos(t * 0.8) * f.az);
      // On for a moment, off for a while: a soft flash rising and falling.
      const beat = ((time + f.offset) % f.period) / f.period;
      const flash = beat < 0.22 ? Math.sin((beat / 0.22) * Math.PI) : 0;
      // Seen as a point of light: about the same size on screen however far away, a little bigger as it flashes.
      const far = this.#p.distanceTo(camera.position);
      const size = Math.min(30, far * (0.014 + flash * 0.045));
      this.#m.compose(this.#p, q, this.#s.set(size, size, size));
      this.mesh.setMatrixAt(i, this.#m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
