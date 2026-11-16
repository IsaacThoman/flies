import * as THREE from "three";
import { Batch, paint } from "../../scene/build.ts";
import type { SceneBackdrop } from "../types.ts";
import { box } from "./geometry.ts";

export function buildBackdrop(): SceneBackdrop {
  const scene = new THREE.Scene(),
    batch = new Batch();
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
  });
  const add = (g: THREE.BufferGeometry, c: string) => batch.add(m, paint(g, c));
  scene.background = new THREE.Color("#d4c8b2");
  add(box(0, -930, 1200, 6000, 40, 5200), "#987952");
  add(box(0, 300, 2700, 6000, 2500, 80), "#e1d7bd");
  add(box(-2900, 300, 1000, 80, 2500, 4000), "#d0c4a7");
  add(box(2900, 300, 1000, 80, 2500, 4000), "#c9cbb5");
  add(box(0, 1540, 1000, 6000, 40, 4500), "#e6dcc4");
  // The kitchen's opposite run: cabinet reveals, worktop, sink and cooker.
  for (let i = 0; i < 8; i++) {
    const x = -1900 + i * 520;
    add(box(x, -450, 2250, 510, 900, 600), "#708176");
    add(box(x, -450, 1943, 490, 860, 12), "#809084");
    add(box(x, -90, 1930, 160, 12, 18), "#b6ad94");
  }
  add(box(-70, 15, 2240, 4200, 30, 650), "#c4bdab");
  add(box(650, 34, 2220, 550, 10, 420), "#505751");
  add(box(-450, 33, 2220, 650, 8, 440), "#a8b6ad");
  for (let i = 0; i < 2; i++)
    add(
      new THREE.TorusGeometry(77, 6, 6, 20)
        .rotateX(Math.PI / 2)
        .translate(525 + i * 240, 42, 2220),
      "#252e2c",
    );
  batch.build(scene);
  const hemi = new THREE.HemisphereLight(),
    sun = new THREE.DirectionalLight();
  scene.add(hemi, sun);
  return {
    scene,
    update(_time, _camera, l) {
      hemi.color.copy(l.skyColor);
      hemi.groundColor.copy(l.groundColor);
      hemi.intensity = l.hemiIntensity;
      sun.color.copy(l.sunColor);
      sun.intensity = l.sunIntensity;
      sun.position.copy(l.sunDirection);
    },
  };
}
