import * as THREE from "three";
import assert from "node:assert/strict";
import { test } from "node:test";
import { GREENHOUSE, GREENHOUSE_SOLIDS, SAUCER, TRAY, World, inside, topHeight } from "@fly/world";
import { buildBench, solidGeometry } from "../src/places/greenhouse/set.ts";
import { foliage } from "../src/places/greenhouse/foliage.ts";
import { EYE_LAYER } from "../src/eyes/eyes.ts";
import { NO_PRINTS } from "../src/scene/prints.ts";
import { Daylight } from "../src/scene/light.ts";
import { WeatherNow } from "../src/scene/weather.ts";
import { greenhouse } from "../src/places/greenhouse/index.ts";
import { disposeAll } from "../src/scene/build.ts";

test("greenhouse curved surfaces are sampled directly from their collision tops", () => {
  for (const solid of GREENHOUSE_SOLIDS) {
    if (solid.footprint.kind === "box") continue;
    const g = solidGeometry(solid, 24, 32), p = g.attributes.position;
    let topVertices = 0;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      assert.ok(inside(solid.footprint, x, z), solid.name);
      // Vertical sides also have vertices at the solid's bottom.
      if (Math.abs(y - (solid.bottom ?? 0)) < 1e-5) continue;
      assert.ok(Math.abs(y - topHeight(solid, x, z)) < 0.025, `${solid.name}: ${x},${y},${z}`);
      topVertices++;
    }
    assert.ok(topVertices > 100); g.dispose();
  }
});

test("greenhouse water and seedlings have exact supporting surfaces", () => {
  const world = new World(GREENHOUSE);
  assert.equal(world.heightAt(SAUCER.x, SAUCER.z), SAUCER.water);
  for (const s of GREENHOUSE_SOLIDS.filter(s => s.name === "seedling crown")) {
    assert.equal(s.bottom, TRAY.height);
    assert.ok(NO_PRINTS.has(s.name));
    assert.equal(world.underside(s.footprint.x, s.footprint.z, TRAY.height), TRAY.height);
  }
  assert.ok(NO_PRINTS.has("greenhouse leaves") && NO_PRINTS.has("water saucer"));
});

test("greenhouse detail builds in bounded steps and keeps its eyes available throughout", () => {
  const set = buildBench();
  assert.equal(set.seen.length, 1);
  const seen = set.seen[0];
  assert.equal(seen.parent,set.group,"the eyes render the proxy as part of the actual set");
  assert.equal(seen.layers.mask,1<<EYE_LAYER,"the proxy stays out of the main camera");
  assert.ok((seen as THREE.Mesh).material instanceof THREE.MeshLambertMaterial,"the eyes see the day and night light");
  let steps = 0;
  while (set.more?.()) {
    assert.equal(set.seen[0], seen);
    assert.ok(++steps < 64);
  }
  assert.ok(steps > 10);
  assert.ok(set.group.children.length <= 6);
});

test("greenhouse leaf detail stays on its solid crown", () => {
  for (const s of GREENHOUSE_SOLIDS.filter(s => s.name === "greenhouse leaves" || s.name === "seedling crown")) {
    const g=foliage(s), p=g.attributes.position;
    for (let i=0;i<p.count;i++) {
      assert.ok(inside(s.footprint,p.getX(i),p.getZ(i)));
      assert.ok(Math.abs(p.getY(i)-topHeight(s,p.getX(i),p.getZ(i))) < 0.13);
    }
    g.dispose();
  }
});

test("greenhouse pool is drawn at the felt water height and within its food footprint", () => {
  const set=buildBench();
  const pool=set.group.children.find(o => o instanceof THREE.Mesh && o.material === set.materials[1]) as THREE.Mesh;
  assert.ok(pool);
  const p=pool.geometry.attributes.position, n=pool.geometry.attributes.normal;
  const patch=GREENHOUSE.patches.find(p=>p.pool)!;
  let cap=0;
  for (let i=0;i<p.count;i++) {
    assert.ok(Math.hypot(p.getX(i)-patch.x,p.getZ(i)-patch.z) <= patch.r+1e-4);
    if (n.getY(i)>0.99) { assert.equal(p.getY(i),SAUCER.water); cap++; }
  }
  assert.ok(cap>100);
  while(set.more?.());
  const clay=set.group.children.find(o=>o instanceof THREE.Mesh && o.material===set.materials[0]) as THREE.Mesh;
  const cp=clay.geometry.attributes.position, cn=clay.geometry.attributes.normal;
  let rim=0;
  for(let i=0;i<cp.count;i++) {
    const d=Math.hypot(cp.getX(i)-SAUCER.x,cp.getZ(i)-SAUCER.z);
    if(d>31 && d<32.5 && cn.getY(i)>0.99) { assert.equal(cp.getY(i),SAUCER.water); rim++; }
  }
  assert.ok(rim>20,"the dry clay beside the water supports the feet too");
});

test("greenhouse glazing follows winter cover, mixed sleet and storm flashes without jumping its runoff", () => {
  const set = buildBench();
  while (set.more?.());
  const pane = set.group.children.find(o => o instanceof THREE.Mesh && o.material instanceof THREE.ShaderMaterial && o.material.uniforms.uFrost) as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  assert.ok(pane);
  const u = pane.material.uniforms;
  const light = new Daylight("noon", greenhouse.palettes, greenhouse.open);
  const weather = new WeatherNow();
  const camera = new THREE.PerspectiveCamera();
  const update = (t: number) => { light.update(0, weather); set.update(t, light, weather, camera); };
  try {
    weather.choose("snow", true); weather.snowCover = 0.7;
    update(10);
    assert.ok(u.uFrost.value > 0 && u.uRain.value === 0, "frost rims clear panes while snow falls in the shared garden backdrop");
    weather.choose("sleet", true);
    update(10.1);
    assert.ok(u.uFrost.value > 0 && u.uRain.value > 0, "sleet leaves both icy edges and running water");
    const before = u.uTime.value;
    weather.choose("storm", true); weather.lightning = 1;
    update(10.2);
    assert.ok(u.uFlash.value > 0 && u.uRain.value > 1, "storm runoff and lightning reach the glass");
    assert.ok(u.uTime.value > before && u.uTime.value - before < 0.3, "changing rain speed advances its phase instead of resetting it");
    weather.choose("clear", true); weather.snowCover = 0; weather.lightning = 0;
    update(10.3);
    assert.equal(u.uFrost.value, 0);
    assert.equal(u.uFlash.value, 0);
  } finally { disposeAll(set.group); }
});
