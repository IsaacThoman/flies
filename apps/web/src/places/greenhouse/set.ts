import * as THREE from "three";
import { GREENHOUSE_BENCH, GLAZING, GREENHOUSE_PATCHES, GREENHOUSE_SOLIDS, SAUCER, TRAY, topHeight, topNormal } from "@fly/world";
import type { Solid } from "@fly/world";
import { Batch, paint, random } from "../../scene/build.ts";
import type { SceneSet } from "../types.ts";
import { tag } from "../windowsill/surfaces.ts";
import { K, surfaces } from "./surfaces.ts";
import { waterMaterial } from "../windowsill/glass.ts";
import { foliage } from "./foliage.ts";
import { sunShafts } from "./shafts.ts";
import { glazing } from "./glass.ts";

const box = (x: number, y: number, z: number, w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** A surface sampled from the very same height function as the feet. */
export function solidGeometry(s: Solid, rings = 40, segments = 64) {
  const f = s.footprint;
  if (f.kind === "box") {
    if (s.top.kind !== "flat") throw new Error("Greenhouse boxes have flat tops");
    const bottom = s.bottom ?? 0;
    return new THREE.BoxGeometry(f.hx * 2, s.top.y - bottom, f.hz * 2).translate(0, (s.top.y + bottom) / 2, 0).rotateY(f.angle).translate(f.x, 0, f.z);
  }
  const rx = f.kind === "circle" ? f.r : f.rx;
  const rz = f.kind === "circle" ? f.r : f.rz;
  const a = f.kind === "circle" ? 0 : f.angle;
  const c = Math.cos(a), sn = Math.sin(a);
  const p: number[] = [], n: number[] = [];
  const normal = { x: 0, y: 1, z: 0 };
  const vertex = (ring: number, j: number, side = false) => {
    const r = Math.min(0.999999, ring / rings);
    const t = j / segments * Math.PI * 2;
    const u = Math.cos(t) * rx * r, v = Math.sin(t) * rz * r;
    const x = f.x + u * c + v * sn, z = f.z - u * sn + v * c;
    p.push(x, side ? s.bottom ?? 0 : topHeight(s, x, z), z);
    topNormal(s, x, z, normal);
    if (side) n.push(Math.cos(t) * c + Math.sin(t) * sn, 0, -Math.cos(t) * sn + Math.sin(t) * c);
    else n.push(normal.x, normal.y, normal.z);
  };
  for (let i = 0; i < rings; i++) for (let j = 0; j < segments; j++) {
    vertex(i, j); vertex(i + 1, j + 1); vertex(i + 1, j);
    if (i > 0) { vertex(i, j); vertex(i, j + 1); vertex(i + 1, j + 1); }
  }
  for (let j = 0; j < segments; j++) {
    vertex(rings, j); vertex(rings, j + 1); vertex(rings, j, true);
    vertex(rings, j + 1); vertex(rings, j + 1, true); vertex(rings, j, true);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(n, 3));
  return g;
}

export function buildBench(): SceneSet {
  const group = new THREE.Group();
  const batch = new Batch(), eyes = new Batch();
  const opaque = surfaces(), glass = glazing();
  const eyeMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const add = (g: THREE.BufferGeometry, color: string | ((p: THREE.Vector3) => string), kind: number) => batch.add(opaque.material, tag(paint(g, color), "kind", kind));
  // Keep the eyes ready when the game binds them, even while detail builds.
  eyes.add(eyeMat, paint(box(0, -15, 0, GREENHOUSE_BENCH.hx * 2, 30, GREENHOUSE_BENCH.hz * 2), "#89705a"));
  for (const s of GREENHOUSE_SOLIDS) if (s.name !== "greenhouse pane") eyes.add(eyeMat, paint(solidGeometry(s, 4, 12), s.name.includes("tomato") ? "#bd4528" : s.name.includes("fig") ? "#60354e" : s.name.includes("crown") || s.name.includes("leaves") ? "#466d3a" : "#8a7960"));
  const seen = eyes.build(new THREE.Group());
  function* construct() {
    add(box(0, -15, 0, GREENHOUSE_BENCH.hx * 2, 30, GREENHOUSE_BENCH.hz * 2), "#92794e", K.wood);
    for (const x of [-275, 275]) for (const z of [-160, 160]) add(box(x, -410, z, 35, 790, 35), "#64523d", K.wood);
    for (const z of [-160, 160]) add(box(0, -620, z, 580, 28, 28), "#64523d", K.wood);
    add(box(0, -700, 0, 580, 22, 330), "#706047", K.wood);
    yield;

    let smallParts = 0;
    for (const s of GREENHOUSE_SOLIDS) {
      if (s.name === "greenhouse pane") continue;
      let color = "#466d3a", kind = K.leaf;
      if (s.name === "terracotta pot" || s.name === "water saucer") { color = "#bd704c"; kind = K.clay; }
      if (s.name === "watering can" || s.name === "watering spout" || s.name === "can handle") { color = "#48766d"; kind = K.paint; }
      if (s.name === "seed tray") { color = "#393c32"; kind = K.soil; }
      if (s.name === "fallen tomato") { color = "#c94124"; kind = K.tomato; }
      if (s.name === "split fig") { color = "#512f51"; kind = K.fig; }
      if (s.name === "trowel blade") { color = "#99a6a0"; kind = K.metal; }
      if (s.name === "trowel handle") { color = "#ad7848"; kind = K.wood; }
      const g = solidGeometry(s, s.name === "terracotta pot" ? 60 : 28, 48);
      if (s.name === "water saucer") {
        // The world's well is the liquid surface; clay below it must not compete for depth.
        const p = g.getAttribute("position");
        for (let i=0;i<p.count;i++) {
          const d=Math.hypot(p.getX(i)-SAUCER.x,p.getZ(i)-SAUCER.z);
          if (d<32.68 && p.getY(i)<=SAUCER.water+1e-4) {
            const t=Math.max(0,Math.min(1,(d-31.6)/1.08));
            p.setY(i,p.getY(i)-0.24*(1-t*t*(3-2*t)));
          }
        }
      }
      const colors = s.name === "terracotta pot" ? (p: THREE.Vector3) => {
        const f = s.footprint as { x: number; z: number; r: number };
        return Math.hypot(p.x - f.x, p.z - f.z) < f.r * 0.82 ? "#30251b" : color;
      } : color;
      if (s.name === "greenhouse leaves" || s.name === "seedling crown") {
        g.translate(0,-0.12,0);
        add(g,"#25451e",K.leaf);
        batch.add(opaque.material,tag(foliage(s),"kind",K.leaf));
      } else add(g, colors, kind);
      if (s.name !== "can handle" && s.name !== "watering spout" || ++smallParts % 8 === 0) yield;
    }
    // Seed cells sit flush in the tray; the seedlings are crowns above them.
    for (let i = 0; i < 12; i++) {
      const x = TRAY.x - 54 + i % 4 * 36, z = TRAY.z - 24 + Math.floor(i / 4) * 24;
      add(box(x, TRAY.height + 0.08, z, 32, 0.16, 21), "#3e2e20", K.soil);
    }
    // Soil crumbs and dry seed husks are below a fly's half-millimetre step.
    const rnd = random(632);
    for (let i = 0; i < 170; i++) {
      const x = rnd.range(-260, 160), z = rnd.range(-40, 155);
      if (Math.hypot(x + 100, z + 20) > 110 && i % 3 !== 0) continue;
      add(new THREE.SphereGeometry(rnd.range(0.2, 0.7), 5, 3).scale(1, 0.22, 1).translate(x, 0.15, z), i % 7 ? "#423022" : "#c6a06a", K.soil);
    }
    // Flat plant labels and coiled string can be stepped over anywhere.
    for (const [x, z, a] of [[-130, 112, -0.4], [170, 95, 0.4], [-105, -55, 0.15]]) {
      add(box(0, 0.16, 0, 12, 0.3, 54).rotateY(a).translate(x, 0, z), "#ded2a6", K.label);
    }
    for (let i = 0; i < 7; i++) {
      const curve = new THREE.EllipseCurve(200 + i * 0.3, 112, 19 + i * 0.5, 12 + i * 0.55, 0, Math.PI * 2, false, 0.3);
      const pts = curve.getPoints(72).map(p => new THREE.Vector3(p.x, 0.2, p.y));
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 72, 0.18, 4, true), "#b4a078", K.string);
    }
    const tail = new THREE.CatmullRomCurve3([new THREE.Vector3(219, 0.2, 111), new THREE.Vector3(238, 0.2, 126), new THREE.Vector3(253, 0.2, 110), new THREE.Vector3(271, 0.2, 121)]);
    add(new THREE.TubeGeometry(tail, 35, 0.18, 4), "#b4a078", K.string);
    // Green calyces and stems lie on the tomato's felt surface, below 0.5 mm.
    for (const s of GREENHOUSE_SOLIDS.filter(s => s.name === "fallen tomato")) {
      const f = s.footprint;
      for (let j = 0; j < 5; j++) {
        const a = j * Math.PI * 0.4;
        const positions: number[] = [];
        for (const [dx, dz] of [[-0.7, 0], [0, 7], [0.7, 0]]) {
          const x = f.x + dx * Math.cos(a) + dz * Math.sin(a), z = f.z - dx * Math.sin(a) + dz * Math.cos(a);
          positions.push(x, topHeight(s, x, z) + 0.12, z);
        }
        const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); g.computeVertexNormals();
        add(g, "#4b6230", K.leaf);
      }
    }
    // Clear liquid reaches the whole taste patch; pulp leaves its irregular dark rim inside it.
    add(new THREE.CircleGeometry(6,64).rotateX(-Math.PI/2).translate(-14,0.08,8),"#a94422",K.juice);
    for (const patch of GREENHOUSE_PATCHES) if (patch.name === "tomato juice" && patch.r < 2) add(new THREE.CircleGeometry(patch.r,24).rotateX(-Math.PI/2).translate(patch.x,0.08,patch.z),"#a94422",K.juice);

    yield;
    // A fallen cotyledon is flat enough for the feet to step across it.
    const leafPoints: number[] = [];
    const leafPoint = (i: number, j: number) => {
      const u = i / 12, w = j / 4 * 2 - 1;
      const width = Math.pow(Math.sin(u * Math.PI), 0.8) * 2.4;
      leafPoints.push(-6 + u * 15, 0.18 + Math.sin(u * Math.PI) * (1-w*w) * 0.1, 15 + w * width + Math.sin(u * Math.PI) * 1.2);
    };
    for (let i=0;i<12;i++) for (let j=0;j<4;j++) {
      leafPoint(i,j); leafPoint(i+1,j+1); leafPoint(i+1,j);
      leafPoint(i,j); leafPoint(i,j+1); leafPoint(i+1,j+1);
    }
    const fallenLeaf = new THREE.BufferGeometry();
    fallenLeaf.setAttribute("position",new THREE.Float32BufferAttribute(leafPoints,3)); fallenLeaf.computeVertexNormals();
    add(fallenLeaf,"#6f8539",K.fallen);
    // The frame is beyond walking range, so its joinery is decorative.
    for (const x of [-GLAZING.x, GLAZING.x]) {
      for (const z of [-640, -320, 0, 320, 640]) add(box(x, 20, z, 22, 1720, 18), "#697f73", K.paint);
      for (const y of [-160, 320, 880]) add(box(x, y, 0, 22, 18, 1280), "#697f73", K.paint);
    }
    for (const z of [-GLAZING.z, GLAZING.z]) {
      for (let i = 0; i <= 6; i++) add(box(-760 + i * 253.333, 20, z, 18, 1720, 22), "#697f73", K.paint);
      for (const y of [-160, 320, 880]) add(box(0, y, z, 1520, 18, 22), "#697f73", K.paint);
    }
    for (const s of GREENHOUSE_SOLIDS.filter(s => s.name === "greenhouse pane")) {
      const f = s.footprint;
      if (f.kind !== "box") continue;
      const g = f.hx > f.hz ? new THREE.PlaneGeometry(GLAZING.x * 2, 1720).translate(f.x, 20, f.z) : new THREE.PlaneGeometry(GLAZING.z * 2, 1720).rotateY(Math.PI / 2).translate(f.x, 20, f.z);
      batch.add(glass.material, paint(g, "#ffffff"));
    }
    for (const sign of [-1, 1]) {
      const slope = Math.atan2(GLAZING.ridge - GLAZING.eave, GLAZING.x);
      const width = Math.hypot(GLAZING.x, GLAZING.ridge - GLAZING.eave);
      const g = new THREE.PlaneGeometry(width, 1280).rotateX(-Math.PI / 2).rotateZ(-sign * slope).translate(sign * GLAZING.x / 2, (GLAZING.ridge + GLAZING.eave) / 2, 0);
      batch.add(glass.material, paint(g, "#ffffff"));
      for (const z of [-640, -320, 0, 320, 640]) add(box(0, 0, 0, width, 18, 18).rotateZ(-sign * slope).translate(sign * GLAZING.x / 2, (GLAZING.ridge + GLAZING.eave) / 2, z), "#697f73", K.paint);
    }
    for (const x of [-506.666,-253.333,253.333,506.666]) add(box(x,GLAZING.ridge-Math.abs(x)*(GLAZING.ridge-GLAZING.eave)/GLAZING.x,0,14,14,1280),"#697f73",K.paint);
    // Seal the gables without a second glass pass or a collision seam.
    for (const z of [-GLAZING.z,GLAZING.z]) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position",new THREE.Float32BufferAttribute([-GLAZING.x,GLAZING.eave,z, 0,GLAZING.ridge,z, GLAZING.x,GLAZING.eave,z],3));
      g.computeVertexNormals(); batch.add(glass.material,paint(g,"#ffffff"));
    }
    add(box(0, GLAZING.ridge, 0, 22, 22, 1280), "#697f73", K.paint);
    yield;
    batch.build(group,{renderOrder:new Map([[glass.material,4]])});


  }
  const building = construct();
  building.next();
  const shafts = sunShafts(group);
  const ripples = Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, -100, 0));
  const time = { value: 0 };
  const water = waterMaterial();
  const compileWater = water.onBeforeCompile;
  water.onBeforeCompile = (shader,renderer) => {
    compileWater(shader,renderer);
    shader.uniforms.uRings = { value: ripples }; shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vPool;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvPool = position;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vPool; uniform vec4 uRings[4]; uniform float uTime;")
      .replace("#include <opaque_fragment>", `float wave = 0.0;
for (int i=0; i<4; i++) { float age = uTime-uRings[i].z; float d=length(vPool.xz-uRings[i].xy); wave += exp(-pow((d-age*9.0)*2.0,2.0)) * max(0.0,1.0-age/3.0) * uRings[i].w; }
outgoingLight += wave * 0.22;
#include <opaque_fragment>`);
  };
  water.customProgramCacheKey = () => "greenhouse-water";
  const pools = new Batch();
  pools.add(water,paint(new THREE.CircleGeometry(31,64).rotateX(-Math.PI/2).translate(SAUCER.x,SAUCER.water,SAUCER.z),"#ffffff"));
  pools.add(water,paint(new THREE.CylinderGeometry(31,31,0.24,64,1,true).translate(SAUCER.x,SAUCER.water-0.12,SAUCER.z),"#ffffff"));
  pools.build(group);
  let nextRing = 0;
  const ripple = (x: number, z: number, strength: number) => {
    if (Math.hypot(x - SAUCER.x, z - SAUCER.z) > 32) return;
    ripples[nextRing].set(x, z, time.value, strength); nextRing = (nextRing + 1) % ripples.length;
  };
  const drip = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), new THREE.MeshBasicMaterial({ color: "#b6d6da", transparent: true, opacity: 0.7 }));
  drip.scale.set(1, 1.8, 1); drip.visible = false; group.add(drip);
  let age = -1, elapsed = 0;
  return {
    group, materials: [opaque.material, water], seen,
    update(t, light, weather) {
      shafts.uniforms.uSun.value.copy(light.sunDirection);
      shafts.uniforms.uColor.value.copy(light.sunColor);
      shafts.uniforms.uStrength.value = light.sunIntensity * (1 - weather.cloud) * (1 - weather.mist * 0.8) * (1 - light.stars);
      shafts.mesh.visible = shafts.uniforms.uStrength.value > 0.1;
      time.value = t; opaque.uniforms.uWet.value = weather.wet * 0.6;
      opaque.uniforms.uSun.value.copy(light.sunDirection);
      opaque.uniforms.uDirect.value = (1 - weather.cloud * 0.9) * (1 - light.stars * 0.8);
      const u = glass.uniforms;
      u.uTime.value = t; u.uWet.value = weather.wet; u.uRain.value = weather.rain;
      const dawn = light.hours === null ? light.time === "morning" ? 0.55 : 0 : Math.max(0, 1 - Math.abs(light.hours - 6) / 2) * 0.65;
      u.uMist.value = Math.max(dawn, weather.mist * 0.65);
      u.uSky.value.copy(light.skyColor).multiplyScalar(0.7); u.uSun.value.copy(light.sunColor).multiplyScalar(light.sunIntensity);
      u.uDirection.value.copy(light.sunDirection);
    },
    more: () => !building.next().done,
    ripple,
    live(dt, around) {
      elapsed += dt;
      // A roof leak falls at a fixed joint; only touch reaches the fly.
      if (age < 0 && around.quiet && around.weather.rain > 0.1 && elapsed > 7) { age = 0; elapsed = 0; }
      if (age >= 0) {
        age += dt; const roof = GLAZING.ridge-Math.abs(SAUCER.x+7)*(GLAZING.ridge-GLAZING.eave)/GLAZING.x;
        const y = roof - 490 * age * age;
        drip.visible = y > SAUCER.water; drip.position.set(SAUCER.x + 7, Math.max(SAUCER.water, y), SAUCER.z - 4);
        if (y <= SAUCER.water) {
          ripple(SAUCER.x + 7, SAUCER.z - 4, 0.65);
          if (Math.hypot(around.fly.x - drip.position.x, around.fly.z - drip.position.z) < 2.5 && Math.abs(around.fly.y - SAUCER.water) < 2) around.felt.touch = Math.max(around.felt.touch, 0.5);
          age = -1;
        }
      }
    },
  };
}
