import assert from "node:assert/strict";
import { test } from "node:test";
import { forecast, KINDS } from "./weather.ts";
import type { Mix } from "./weather.ts";
const mix = (): Mix => ({cloud:0,mist:0,rain:0,wind:0});

test("the shared seasonal forecast stays deterministic, bounded and continuous", () => {
  const start = Date.UTC(2026,0,1)/3600000;
  const previous = mix();
  let snow=0, storms=0, wet=0;
  for(let h=start;h<start+365*24;h+=0.25) {
    const w=forecast(h,mix());
    assert.deepEqual(w,forecast(h,mix()));
    for(const v of Object.values(w)) assert.ok(Number.isFinite(v) && v>=0 && v<=1.01);
    const near=forecast(h+1/60,previous);
    for(const k of ['rain','snow','storm','cloud','heavy'] as const) assert.ok(Math.abs((w[k]??0)-(near[k]??0))<0.08);
    const month=new Date(h*3600000).getUTCMonth();
    if((w.snow??0)>0.3) { snow++; assert.ok(month<3 || month>9); }
    if((w.storm??0)>0.4) { storms++; assert.ok(month>=3 && month<=8); }
    wet += w.rain;
  }
  assert.ok(snow>20 && storms>20 && wet>20, JSON.stringify({snow,storms,wet}));
});

test("chosen precipitation phases agree with what the room simulates", () => {
  assert.equal(KINDS.snow.rain,0);
  assert.ok(KINDS.sleet.rain>0 && (KINDS.sleet.snow??0)>0);
  assert.equal(KINDS.storm.storm,1);
});
