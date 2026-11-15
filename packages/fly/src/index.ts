// A stand-in fly: a blob with wings, so the game has something to move while
// the real model is built. It honours the FlyModel contract and nothing more.

import * as THREE from "three";
import type { FlyAnchor, FlyModel, FlyPose } from "@fly/contracts";

const ANCHORS: Record<FlyAnchor, THREE.Vector3> = {
  mouth: new THREE.Vector3(0, 0.08, 0.5),
  head: new THREE.Vector3(0, 0.3, 0.4),
  leftEye: new THREE.Vector3(0.12, 0.32, 0.42),
  rightEye: new THREE.Vector3(-0.12, 0.32, 0.42),
  back: new THREE.Vector3(0, 0.45, 0),
};

export function createFly(): FlyModel {
  const object = new THREE.Group();
  const bodyGeometry = new THREE.SphereGeometry(0.5, 16, 12).scale(0.45, 0.4, 1);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: "#8a6a3a", roughness: 0.5 });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 0.28;
  object.add(body);
  const wingGeometry = new THREE.CircleGeometry(0.5, 12).scale(0.35, 1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.45);
  const wingMaterial = new THREE.MeshBasicMaterial({ color: "#e8f4ff", transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
  const wings = ([1, -1] as const).map((side) => {
    const wing = new THREE.Mesh(wingGeometry, wingMaterial);
    wing.position.set(side * 0.08, 0.46, 0.1);
    object.add(wing);
    return { wing, side };
  });
  let time = 0;
  return {
    object,
    update(pose: FlyPose, dt: number) {
      time += dt;
      const beat = pose.wings * Math.sin(time * 200) * 0.6;
      for (const { wing, side } of wings) wing.rotation.set(0, side * (0.25 + pose.wings * 1.1), side * beat);
      body.position.y = 0.28 - pose.crouch * 0.06 - pose.feed * 0.04;
      body.rotation.set(-pose.pitch + pose.feed * 0.15, 0, pose.roll);
    },
    anchor: (name, out) => object.localToWorld(out.copy(ANCHORS[name])),
    dispose() {
      bodyGeometry.dispose();
      bodyMaterial.dispose();
      wingGeometry.dispose();
      wingMaterial.dispose();
    },
  };
}
