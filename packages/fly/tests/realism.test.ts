import assert from "node:assert/strict";
import { test } from "node:test";
import { FlyRig } from "../src/rig.ts";
import { J, LEG_SEGMENTS, WING_COPIES } from "../src/anatomy.ts";
import { pose } from "./helpers.ts";

test("song-side changes close the active wing continuously", () => {
  const rig = new FlyRig();
  for (let i = 0; i < 120; i++) rig.update(pose({sing:1}), 1/60);
  const previous = rig.wings.slice();
  let worst = 0;
  for (let i = 0; i < 120; i++) {
    rig.update(pose({sing:-1}), 1/120);
    // Origins plus wing tips, rather than only the origins at the hinges.
    for (const copy of [0, WING_COPIES]) {
      const o=copy*12;
      worst=Math.max(worst,Math.hypot(...[0,4,8].map(k => (rig.wings[o+k]-previous[o+k])*0.8)));
    }
    previous.set(rig.wings);
  }
  assert.ok(worst < 0.13, `wing-tip displacement ${worst}`);
});

test("sustained grooming reaches posterior sites and returns to supporting feet", () => {
  const rig = new FlyRig();
  let raised = 0, grounded = 0, worst = 0;
  const previous=rig.joints.slice();
  for (let i=0;i<12*120;i++) {
    rig.update(pose({groom:1}),1/120);
    const t=(i+1)/120;
    for(const l of [4,5]) {
      const o=(J.leg+l*LEG_SEGMENTS+4)*12;
      const y=rig.joints[o+7];
      if(t>5.5&&t<9&&y>0.2)raised++;
      if(t<2&&y<0.05)grounded++;
    }
    for(let j=0;j<41;j++) {
      const o=j*12;
      worst=Math.max(worst,Math.hypot(...[3,7,11].map(k=>rig.joints[o+k]-previous[o+k])));
    }
    previous.set(rig.joints);
  }
  assert.ok(raised>300, `posterior contacts ${raised}`);
  assert.ok(grounded>300, `hind supporting frames ${grounded}`);
  assert.ok(worst<0.1, `groom transition displacement ${worst}`);
});

test("approach extends the legs while the wings remain in flight", () => {
  const rig = new FlyRig();
  for(let i=0;i<120;i++)rig.update(pose({airborne:true,wings:1}),1/120);
  const o=(J.leg+4)*12;
  const folded=rig.joints[o+7];
  for(let i=0;i<30;i++)rig.update(pose({airborne:true,wings:1,landing:1}),1/120);
  assert.ok(rig.joints[o+7]<folded-0.02, "front leg extends toward the ground");
  assert.ok(rig.wingHaze>0.4, "wings still beating");
});
