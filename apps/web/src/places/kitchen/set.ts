import * as THREE from "three";
import {
  KITCHEN_SOLIDS,
  KITCHEN_BANANAS,
  KITCHEN_PATCHES,
  inside,
  topHeight,
} from "@fly/world";
import { Batch, paint, random } from "../../scene/build.ts";
import type { SceneSet } from "../types.ts";
import { KIND, surfaceMaterial, tag } from "./material.ts";
import { box, lathe, surface } from "./geometry.ts";

export function buildSet(): SceneSet {
  const group = new THREE.Group(),
    batch = new Batch(),
    surfaces = surfaceMaterial();
  const glass = new THREE.MeshStandardMaterial({
    color: "#dbe1d9",
    roughness: 0.05,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
    side: THREE.DoubleSide,
    envMapIntensity: 1.5,
  });
  const glassBatch = new Batch();
  const addGlass = (g: THREE.BufferGeometry) =>
    glassBatch.add(glass, paint(g, "#ffffff"));
  const add = (
    g: THREE.BufferGeometry,
    c: THREE.ColorRepresentation,
    k = KIND.glaze,
  ) => batch.add(surfaces.material, tag(paint(g, c), k));
  const rnd = random(812);
  add(box(0, -20, 0, 1000, 40, 600), "#c7c1ae", KIND.stone);
  // Drawer fronts below the reachable worktop give its edge a household scale.
  for (const x of [-375, -125, 125, 375]) {
    add(box(x, -210, 285, 246, 370, 25), "#748576");
    add(box(x, -85, 303, 100, 5, 9), "#a59d86", KIND.metal);
  }
  for (const s of KITCHEN_SOLIDS) {
    const f = s.footprint;
    if (
      s.name === "kitchen banana" ||
      s.name === "kitchen lid" ||
      s.name === "kitchen wall" ||
      s.name === "kitchen cord" ||
      s.name === "kitchen pendant"
    )
      continue;
    if (s.name === "kitchen wine") {
      const profile: number[][] = [];
      for (let i = 0; i <= 80; i++) {
        const r = (43 * i) / 80;
        profile.push([r, topHeight(s, f.x + Math.min(r, 42.9999), f.z)]);
      }
      profile.push([43 * 0.43, 112], [43 * 0.97, 187]);
      profile.sort((a, b) => a[0] - b[0]);
      profile.push([0, 100]);
      addGlass(lathe(profile, f.x, f.z));
      add(
        new THREE.CircleGeometry(18, 64)
          .rotateX(-Math.PI / 2)
          .translate(f.x, 112.015, f.z),
        "#661c32",
        KIND.wine,
      );
      continue;
    }
    if (s.name.startsWith("kitchen glass")) {
      addGlass(
        s.name.endsWith("foot")
          ? surface(s, 12, 48)
          : new THREE.CylinderGeometry(3, 3, 100, 16).translate(f.x, 53, f.z),
      );
      continue;
    }
    if (s.name === "kitchen honey jar") {
      add(
        lathe(
          [
            [0, 0],
            [32, 0],
            [38, 5],
            [38, 86],
            [32, 97],
            [32, 108],
            [0, 108],
          ],
          f.x,
          f.z,
        ),
        "#ba741e",
        KIND.honey,
      );
      addGlass(
        lathe(
          [
            [34, 0],
            [39, 4],
            [39, 87],
            [33, 98],
            [33, 108],
          ],
          f.x,
          f.z,
        ),
      );
      add(
        lathe(
          [
            [0, 108],
            [38, 108],
            [38, 112],
            [0, 112],
          ],
          f.x,
          f.z,
        ),
        "#b79b62",
        KIND.metal,
      );
      // A plain paper band, with no on-screen copy.
      add(
        new THREE.CylinderGeometry(38.15, 38.15, 34, 64, 1, true).translate(
          f.x,
          51,
          f.z,
        ),
        "#e7d8ae",
      );
      continue;
    }
    const k =
      s.name === "kitchen wall"
        ? KIND.wall
        : s.name === "kitchen board"
          ? KIND.wood
          : s.name === "kitchen peach"
            ? KIND.peach
            : s.name === "kitchen grape"
              ? KIND.grape
              : s.name === "kitchen compost" ||
                  s.name === "kitchen stone" ||
                  s.name === "kitchen crumb"
                ? KIND.compost
                : KIND.glaze;
    const color =
      s.name === "kitchen wall"
        ? "#b4c8b8"
        : s.name === "kitchen board"
          ? "#bc8b50"
          : s.name === "kitchen peach"
            ? "#ffb048"
            : s.name === "kitchen grape"
              ? "#58364c"
              : s.name === "kitchen compost"
                ? "#55432b"
                : s.name === "kitchen stone"
                  ? "#9e4e23"
                  : s.name === "kitchen crumb"
                    ? "#ca9c57"
                    : s.name === "kitchen caddy"
                      ? "#547068"
                      : "#e3d8bc";
    if (f.kind === "box") {
      const y = s.top.kind === "flat" ? s.top.y : 0;
      add(
        box(
          f.x,
          (y + (s.bottom ?? 0)) / 2,
          f.z,
          f.hx * 2,
          y - (s.bottom ?? 0),
          f.hz * 2,
        ),
        color,
        k,
      );
    } else {
      add(
        surface(
          s,
          s.name === "kitchen bowl" ? 48 : s.name === "kitchen peach" ? 40 : 20,
          s.name === "kitchen bowl" ? 72 : s.name === "kitchen peach" ? 64 : 32,
        ),
        color,
        k,
      );
      if (
        s.top.kind === "dome" &&
        s.top.base > 0 &&
        s.name !== "kitchen grape" &&
        s.name !== "kitchen stone"
      )
        add(
          new THREE.CylinderGeometry(
            f.kind === "circle" ? f.r : f.rx,
            f.kind === "circle" ? f.r : f.rx,
            s.top.base - (s.bottom ?? 0),
            64,
            1,
            true,
          ).translate(f.x, ((s.bottom ?? 0) + s.top.base) / 2, f.z),
          color,
          k,
        );
    }
  }
  // A glazed window occupies the wall's opening; in the world the pane is still a barrier.
  for (const g of [
    box(0, -342.5, -325, 3600, 1215, 50),
    box(0, 1300, -325, 3600, 600, 50),
    box(-1102.5, 632.5, -325, 1395, 735, 50),
    box(1022.5, 632.5, -325, 1555, 735, 50),
  ])
    add(g, "#b5c7b5", KIND.wall);
  for (const g of [
    box(-80, 268, -305, 670, 24, 10),
    box(-80, 997, -305, 670, 20, 10),
    box(-405, 633, -305, 20, 735, 10),
    box(245, 633, -305, 20, 735, 10),
    box(-80, 633, -305, 12, 735, 10),
  ])
    add(g, "#e0d7bc");
  addGlass(new THREE.PlaneGeometry(650, 735).translate(-80, 632.5, -310));
  // Continuous banana skins sample the envelope, never drawing the hidden seams between rounds.
  for (const rounds of KITCHEN_BANANAS) {
    const positions: number[] = [],
      indices: number[] = [];
    for (let i = 0; i <= 220; i++) {
      const x = -250 + (193 * i) / 220;
      const t = Math.max(0, Math.min(1, (x + 246) / 185));
      const z =
        -68 -
        29 * Math.sin(Math.PI * t) +
        (rounds === KITCHEN_BANANAS[1] ? 33 : 0);
      let width = 0;
      for (const s of rounds) {
        const f = s.footprint;
        if (f.kind !== "ellipse") continue;
        const u = (x - f.x) / f.rx;
        if (Math.abs(u) < 1)
          width = Math.max(
            width,
            Math.abs(f.z - z) + f.rz * Math.sqrt(1 - u * u),
          );
      }
      for (let j = 0; j <= 28; j++) {
        const pz = z + width * Math.sin((j / 28 - 0.5) * Math.PI) * 0.9999;
        let y = 42;
        for (const s of rounds)
          if (inside(s.footprint, x, pz)) y = Math.max(y, topHeight(s, x, pz));
        positions.push(x, y, pz);
      }
    }
    for (let i = 0; i < 220; i++)
      for (let j = 0; j < 28; j++) {
        const a = i * 29 + j,
          b = a + 29;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    const bowl = KITCHEN_SOLIDS.find((s) => s.name === "kitchen bowl")!;
    for (const edge of [0, 28]) {
      const offset = positions.length / 3;
      for (let i = 0; i <= 220; i++) {
        const j = (i * 29 + edge) * 3;
        positions.push(
          positions[j],
          Math.min(
            positions[j + 1],
            topHeight(bowl, positions[j], positions[j + 2]),
          ),
          positions[j + 2],
        );
      }
      for (let i = 0; i < 220; i++) {
        const a = i * 29 + edge,
          b = a + 29,
          c = offset + i,
          d = c + 1;
        if (edge === 0) indices.push(a, b, c, b, d, c);
        else indices.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    add(g, "#ddb337", KIND.banana);
  }
  // The lid has the same slope and extents as its two-millimetre world slices.
  add(
    box(0, 0, 0, 136, 4, 114).rotateX(-0.292).translate(-369, 180, -180),
    "#547068",
  );
  // Small dry flecks are below the half-millimetre scenery limit.
  for (let i = 0; i < 100; i++)
    add(
      new THREE.IcosahedronGeometry(rnd.range(0.12, 0.45), 0)
        .scale(1, 0.35, 0.7)
        .translate(rnd.range(63, 165), 14.2, rnd.range(140, 205)),
      "#d6b77d",
      KIND.compost,
    );
  for (const p of KITCHEN_PATCHES) {
    if (p.name !== "honey" && p.name !== "wine") continue;
    add(
      new THREE.CircleGeometry(p.r, 48)
        .rotateX(-Math.PI / 2)
        .translate(p.x, 0.025, p.z),
      p.name === "honey" ? "#be791f" : "#6a2436",
      p.name === "honey" ? KIND.honey : KIND.wine,
    );
  }
  add(
    new THREE.TorusGeometry(41.7, 0.32, 6, 64)
      .rotateX(Math.PI / 2)
      .translate(186, 187, -65),
    "#d5e0d7",
  );
  // The pendant's domed shade and flat underside use the world's slab.
  const pendant = KITCHEN_SOLIDS.find((s) => s.name === "kitchen pendant")!;
  add(surface(pendant, 20, 48), "#496d61");
  add(
    new THREE.CircleGeometry(70, 48)
      .rotateX(Math.PI / 2)
      .translate(260, 430, -160),
    "#fff0cb",
    KIND.bulb,
  );
  add(
    new THREE.CylinderGeometry(1.5, 1.5, 910, 8).translate(260, 945, -160),
    "#343a34",
    KIND.metal,
  );
  for (const side of [-1, 1]) {
    add(box(side * 865, 395, -170, 610, 450, 300), "#7d8d7e");
    for (let i = 0; i < 3; i++)
      add(box(side * (660 + i * 205), 395, -16, 196, 438, 10), "#849486");
  }
  batch.build(group);
  glassBatch.build(group);
  // Eyes get only coarse solid silhouettes, excluding the skin grids and small flecks.
  const seenGroup = new THREE.Group(),
    seenBatch = new Batch();
  const seenM = new THREE.MeshBasicMaterial({ vertexColors: true });
  for (const s of KITCHEN_SOLIDS) {
    if (
      s.name === "kitchen lid" ||
      s.name.includes("crumb") ||
      s.name === "kitchen stone"
    )
      continue;
    const f = s.footprint;
    if (f.kind === "box") {
      const y = s.top.kind === "flat" ? s.top.y : 0;
      seenBatch.add(
        seenM,
        paint(box(f.x, y / 2, f.z, f.hx * 2, y, f.hz * 2), "#809176"),
      );
    } else
      seenBatch.add(
        seenM,
        paint(
          surface(s, 5, 12),
          s.name.includes("banana") ? "#dcb938" : "#998561",
        ),
      );
  }
  seenBatch.build(seenGroup);
  return {
    group,
    materials: [surfaces.material, glass],
    seen: seenGroup.children,
    update(time, light, weather) {
      surfaces.update(time, light, weather);
    },
    ripple: surfaces.ripple,
  };
}
