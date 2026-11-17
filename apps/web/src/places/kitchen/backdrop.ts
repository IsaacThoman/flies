import * as THREE from "three";
import { Batch, paint, random } from "../../scene/build.ts";
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
  add(box(0, -930, 1700, 6000, 40, 4000), "#987952");
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
  const garden = new Batch();
  const outdoor = new THREE.MeshBasicMaterial({ vertexColors: true });
  const plant = (g: THREE.BufferGeometry, c: string) =>
    garden.add(outdoor, paint(g, c));
  const rnd = random(763);
  plant(box(0, -915, -4300, 10000, 30, 8000), "#78814d");
  for (let i = 0; i < 70; i++) {
    const x = -3500 + i * 100;
    plant(
      box(x, -525, -3300, 94, 740, 20),
      i % 3 === 0 ? "#8b7961" : "#95836a",
    );
  }
  for (const z of [-3290, -3310])
    plant(box(0, -400, z, 7200, 22, 24), "#766950");
  for (const [x, z, r] of [
    [-950, -2200, 450],
    [250, -2700, 550],
    [1350, -2100, 400],
  ]) {
    plant(
      new THREE.CylinderGeometry(35, 55, 1200, 9).translate(x, -310, z),
      "#675c40",
    );
    for (let i = 0; i < 15; i++)
      plant(
        new THREE.IcosahedronGeometry(r * rnd.range(0.45, 0.7), 1)
          .scale(1, 0.8, 1)
          .translate(
            x + rnd.range(-r * 0.7, r * 0.7),
            rnd.range(50, 650),
            z + rnd.range(-r * 0.6, r * 0.6),
          ),
        i % 3 === 0 ? "#75804a" : i % 3 === 1 ? "#526b40" : "#647b43",
      );
  }
  for (const x of [-2000, -700, 800, 2300]) {
    plant(box(x, -120, -5400, 1050, 1500, 900), "#b9aa91");
    plant(
      new THREE.ConeGeometry(790, 600, 4)
        .rotateY(Math.PI / 4)
        .translate(x, 930, -5400),
      "#78675e",
    );
    for (const dx of [-260, 260])
      for (const y of [-350, 200])
        plant(box(x + dx, y, -4940, 190, 250, 10), "#586a66");
  }
  garden.build(scene);
  const day = new THREE.Color(1, 1, 1),
    dark = new THREE.Color("#172437"),
    sky = new THREE.Color();
  batch.build(scene);
  const hemi = new THREE.HemisphereLight(),
    sun = new THREE.DirectionalLight();
  scene.add(hemi, sun);
  return {
    scene,
    update(_time, _camera, l, weather) {
      outdoor.color
        .copy(day)
        .lerp(dark, l.stars * 0.9)
        .multiplyScalar(1 - weather.cloud * 0.2);
      sky.copy(l.horizon).lerp(l.haze, weather.mist * 0.7);
      scene.background = sky;
      hemi.color.copy(l.skyColor);
      hemi.groundColor.copy(l.groundColor);
      hemi.intensity = l.hemiIntensity;
      sun.color.copy(l.sunColor);
      sun.intensity = l.sunIntensity;
      sun.position.copy(l.sunDirection);
    },
  };
}
