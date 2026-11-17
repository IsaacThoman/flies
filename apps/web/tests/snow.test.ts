import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { Snow } from "../src/scene/snow.ts";
import { WeatherNow } from "../src/scene/weather.ts";
import { Daylight } from "../src/scene/light.ts";
import { SCENES } from "../src/places/index.ts";

test("after an hour, a wind change moves snow by one frame, not by an hour of replacement wind", () => {
  const snow = new Snow(2200, 0);
  const weather = new WeatherNow(); weather.choose("snow", true);
  const light = new Daylight("noon", SCENES.picnic.palettes);
  snow.update(0, light, weather);
  for (let i=1;i<=36000;i++) snow.update(i/10,light,weather);
  const offset = (snow.mesh.material as THREE.ShaderMaterial).uniforms.uOffset.value as THREE.Vector3;
  const last = offset.x;
  weather.wind=0.39;
  snow.update(3600+1/60,light,weather);
  const displacement = ((offset.x-last+2200)%4400+4400)%4400-2200;
  assert.ok(Math.abs(displacement-95*0.39/60)<1e-7, `${displacement} mm`);
  assert.ok(Math.abs(offset.x)<4400 && Math.abs(offset.y)<4400 && Math.abs(offset.z)<4400);
});
