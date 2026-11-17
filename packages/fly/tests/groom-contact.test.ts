import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { createFly } from "../src/index.ts";
import { J, LEGS, LEG_SEGMENTS, WING_COPIES, WING, legPair } from "../src/anatomy.ts";
import { pose } from "./helpers.ts";

// Compare the rendered, rigid-skinned surface with the solved claws rather
// than with the animator's target. Return strokes intentionally clear it.
test("grooming contact strokes reach the head, antennae, abdomen and folded wings", () => {
  for (const strength of [0.2, 1]) {
  const fly=createFly();
  let body!: THREE.Mesh;
  fly.object.traverse(o=>{if(o.name==="fly-body")body=o as THREE.Mesh;});
  const g=body.geometry,p=g.getAttribute("position"),joint=g.getAttribute("aJoint"),index=g.index!;
  const vertices=new Float64Array(p.count*3),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),out=new THREE.Vector3(),foot=new THREE.Vector3(),triangle=new THREE.Triangle(a,b,c);
  const hits=new Uint32Array(4),samples=new Uint32Array(4);
  for(let f=0;f<12*30;f++) {
    fly.update(pose({groom:strength,fullness:0.7}),1/30);
    const t=(f+1)/30,stage=t>1.2&&t<2.5?0:t>3.3&&t<3.9?1:t>5.5&&t<6.6?2:t>8&&t<9.1?3:-1;
    if(stage<0)continue;
    const m=fly.rig.joints;
    if(stage<3)for(let v=0;v<p.count;v++) {
      const o=Math.round(joint.getX(v))*12,x=p.getX(v),y=p.getY(v),z=p.getZ(v),i=v*3;
      vertices[i]=m[o]*x+m[o+1]*y+m[o+2]*z+m[o+3];vertices[i+1]=m[o+4]*x+m[o+5]*y+m[o+6]*z+m[o+7];vertices[i+2]=m[o+8]*x+m[o+9]*y+m[o+10]*z+m[o+11];
    }
    for(const leg of stage<2?[0,1]:[4,5]) {
      const o=(J.leg+leg*LEG_SEGMENTS+4)*12,length=LEGS[legPair(leg)].tarsus;
      foot.set(m[o]*length+m[o+3],m[o+4]*length+m[o+7],m[o+8]*length+m[o+11]);
      let distance=Infinity;
      if(stage===3) {
        const w=fly.rig.wings,k=(leg%2?WING_COPIES:0)*12,dx=foot.x-w[k+3],dy=foot.y-w[k+7],dz=foot.z-w[k+11];
        const x=dx*w[k]+dy*w[k+4]+dz*w[k+8],y=dx*w[k+1]+dy*w[k+5]+dz*w[k+9];
        if(x>0.2*WING.length&&x<0.75*WING.length&&y>-0.15*WING.length&&y<0.1*WING.length)distance=Math.abs(dx*w[k+2]+dy*w[k+6]+dz*w[k+10]);
      } else {
        for(let i=0;i<index.count;i+=3) {
          const ia=index.getX(i),ib=index.getX(i+1),ic=index.getX(i+2),j=Math.round(joint.getX(ia));
          if(stage===0?j!==J.head:stage===1?j!==J.antenna+leg:j!==J.abdomen&&j!==J.abdomenTip)continue;
          a.fromArray(vertices,ia*3);b.fromArray(vertices,ib*3);c.fromArray(vertices,ic*3);triangle.closestPointToPoint(foot,out);
          const d=foot.distanceTo(out);if(Number.isFinite(d))distance=Math.min(distance,d);
        }
      }
      samples[stage]++;if(distance<0.009)hits[stage]++;
    }
  }
  fly.dispose();
  console.log(`strength ${strength}: contact samples ${[...hits].map((n,i)=>`${n}/${samples[i]}`).join(", ")}`);
  for(let stage=0;stage<4;stage++)assert.ok(hits[stage]/samples[stage]>0.45,`surface ${stage}: ${hits[stage]}/${samples[stage]} contact samples`);
  }
});
