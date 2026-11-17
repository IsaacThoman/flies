import * as THREE from "three";
import {
  KITCHEN_SOLIDS,
  KITCHEN_BANANAS,
  KITCHEN_PATCHES,
  KITCHEN_PEACH,
  KITCHEN_PEACH_BANDS,
  KITCHEN_CADDY,
  KITCHEN_GLASS,
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
  const glassTime = { value: 0 },
    glassRain = { value: 0 },
    glassWet = { value: 0 },
    glassHeavy = { value: 0 },
    glassFrost = { value: 0 };
  glass.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uKTime: glassTime,
      uKRain: glassRain,
      uKWet: glassWet,
      uKHeavy: glassHeavy,
      uKFrost: glassFrost,
    });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vGlass;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvGlass=position;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vGlass;uniform float uKTime;uniform float uKRain;uniform float uKWet;uniform float uKHeavy;uniform float uKFrost;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      float edge=pow(1.0-abs(dot(normalize(vNormal),normalize(vViewPosition))),3.0);
      diffuseColor.a=.055+.58*edge;
      if(abs(vGlass.z+300.0)<.1) {
        vec2 q=vec2(vGlass.x*.32,vGlass.y*.003+uKTime*(.12+.2*uKHeavy));
        float cell=floor(q.x);
        float seed=fract(sin(cell*127.1)*43758.5453);
        float dx=abs(fract(q.x)-(.15+seed*.7));
        float width=.025+.025*uKHeavy;
        float trace=(1.0-smoothstep(width,width+fwidth(q.x),dx));
        float along=fract(q.y+seed*7.0);
        trace*=smoothstep(.0,.07,along)*(1.0-smoothstep(.25,.55,along));
        trace*=step(seed,uKRain*.8+uKWet*.15+uKHeavy*.15)*max(uKRain,uKWet*.25);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.78,.86,.9),trace*.7);
        diffuseColor.a+=trace*(.32+.2*uKHeavy);
        float frost=uKFrost*(1.0-smoothstep(280.0,360.0,vGlass.y));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.83,.9,.96),frost*.7);
        diffuseColor.a+=frost*.3;
      }
    `,
      );
  };
  glass.customProgramCacheKey = () => "kitchen-glass-weather-3";
  const glassBatch = new Batch();
  const addGlass = (g: THREE.BufferGeometry) =>
    glassBatch.add(glass, paint(g, "#ffffff"));
  const add = (
    g: THREE.BufferGeometry,
    c: THREE.ColorRepresentation,
    k = KIND.glaze,
  ) => batch.add(surfaces.material, tag(paint(g, c), k));
  const rnd = random(812);
  for (const x of [-240.5, 80.5])
    addGlass(new THREE.PlaneGeometry(309, 707).translate(x, 633.5, -300));
  const counter = box(0, -20, 0, 1000, 40, 600);
  const counterSeen = counter.clone();
  const windowSeen: THREE.BufferGeometry[] = [];
  add(counter, "#c7c1ae", KIND.stone);
  // Drawer fronts below the reachable worktop give its edge a household scale.
  for (const x of [-375, -125, 125, 375]) {
    add(box(x, -210, 285, 246, 370, 25), "#748576");
    add(box(x, -85, 303, 100, 5, 9), "#a59d86", KIND.metal);
  }
  for (const s of KITCHEN_SOLIDS) {
    const f = s.footprint;
    if (
      s.name === "kitchen honey neck" ||
      s.name === "kitchen honey lid" ||
      s.name === "kitchen peach" ||
      s.name === "kitchen banana" ||
      s.name === "kitchen lid" ||
      s.name === "kitchen wall" ||
      s.name === "kitchen cord" ||
      s.name === "kitchen pendant"
    )
      continue;
    if (s.name === "kitchen glass") {
      const { r, juice, rim } = KITCHEN_GLASS;
      const profile: number[][] = [];
      for (let i = 0; i <= 80; i++) {
        const d = (r * i) / 80;
        profile.push([d, topHeight(s, f.x + Math.min(d, r - 1e-4), f.z)]);
      }
      profile.push([r * 0.88, juice], [r * 0.96, rim]);
      profile.sort((a, b) => a[0] - b[0]);
      profile.push([0, 0]);
      addGlass(lathe(profile, f.x, f.z));
      // The juice fills the tumbler above its thick base, seen through its wall.
      add(
        new THREE.CircleGeometry(r * 0.88, 64)
          .rotateX(-Math.PI / 2)
          .translate(f.x, juice + 0.015, f.z),
        "#f39220",
        KIND.juice,
      );
      add(
        new THREE.CylinderGeometry(r * 0.88, r * 0.88, juice - 6, 64, 1, true).translate(
          f.x,
          (juice + 6) / 2,
          f.z,
        ),
        "#f39220",
        KIND.juice,
      );
      continue;
    }
    if (s.name === "kitchen honey jar") {
      add(
        new THREE.CylinderGeometry(36.5, 36.5, 74, 64).translate(f.x, 38, f.z),
        "#a96519",
        KIND.honey,
      );
      const profile: number[][] = [
        [0, 0],
        [38, 0],
        [38, 86],
      ];
      for (let i = 0; i <= 24; i++) {
        const r = 38 - (6 * i) / 24;
        profile.push([r, topHeight(s, f.x + r, f.z)]);
      }
      profile.push([32, 108]);
      addGlass(lathe(profile, f.x, f.z));
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
      add(
        new THREE.CylinderGeometry(38.1, 38.1, 34, 64, 1, true).translate(
          f.x,
          51,
          f.z,
        ),
        "#e7d8ae",
      );
      continue;
    }
    const k =
      s.name === "kitchen board"
        ? KIND.wood
        : s.name === "kitchen grape"
          ? KIND.grape
          : ["kitchen compost", "kitchen stone", "kitchen crumb"].includes(
                s.name,
              )
            ? KIND.compost
            : KIND.glaze;
    const color =
      s.name === "kitchen board"
        ? "#bc8b50"
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
          s.name === "kitchen bowl" ? 48 : 20,
          s.name === "kitchen bowl" ? 112 : 32,
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
  const p = KITCHEN_PEACH;
  const profile: number[][] = [[0, p.base]];
  for (let i = 0; i < KITCHEN_PEACH_BANDS.length; i++) {
    const b = KITCHEN_PEACH_BANDS[i];
    profile.push([b.radius, b.bottom]);
    profile.push([b.radius, KITCHEN_PEACH_BANDS[i + 1]?.bottom ?? p.cut]);
  }
  const outer = KITCHEN_PEACH_BANDS.at(-1)!.radius;
  const rind = lathe(profile, 0, 0, 72);
  const rp = rind.getAttribute("position"),
    rn = rind.getAttribute("normal");
  // Keep the exact bands, but shade their sub-millimetre steps as a smooth skin.
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i),
      y = (rp.getY(i) - p.cut) / Math.pow(p.cut - p.base, 2),
      z = rp.getZ(i);
    const length = Math.hypot(x, y, z) || 1;
    rn.setXYZ(i, x / length, y / length, z / length);
  }
  add(
    rind.scale(p.rx, 1, p.rz).rotateY(p.angle).translate(p.x, 0, p.z),
    "#cc5630",
    KIND.skin,
  );
  add(
    new THREE.CircleGeometry(outer, 96)
      .rotateX(-Math.PI / 2)
      .scale(p.rx, 1, p.rz)
      .rotateY(p.angle)
      .translate(p.x, p.cut, p.z),
    "#ffc86b",
    KIND.peach,
  );
  // A glazed window occupies the wall's opening; in the world the pane is still a barrier.
  for (const g of [
    box(0, -342.5, -325, 3600, 1215, 50),
    box(0, 1300, -325, 3600, 600, 50),
    box(-1102.5, 632.5, -325, 1395, 735, 50),
    box(1022.5, 632.5, -325, 1555, 735, 50),
  ]) {
    windowSeen.push(paint(g.clone(), "#b5c7b5"));
    add(g, "#b5c7b5", KIND.wall);
  }
  for (const g of [
    box(-80, 268, -305, 670, 24, 10),
    box(-80, 997, -305, 670, 20, 10),
    box(-405, 633, -305, 20, 735, 10),
    box(245, 633, -305, 20, 735, 10),
    box(-80, 633, -305, 12, 735, 10),
  ]) {
    windowSeen.push(paint(g.clone(), "#e0d7bc"));
    add(g, "#e0d7bc");
  }

  // Continuous banana skins sample the envelope, never drawing the hidden seams between rounds.
  for (const rounds of KITCHEN_BANANAS) {
    const positions: number[] = [],
      indices: number[] = [];
    for (let i = 0; i <= 220; i++) {
      const x = -250 + (193 * i) / 220;
      let lo = Infinity,
        hi = -Infinity;
      for (const s of rounds) {
        const f = s.footprint;
        if (f.kind !== "ellipse") continue;
        const u = (x - f.x) / f.rx;
        if (Math.abs(u) < 1) {
          const width = f.rz * Math.sqrt(1 - u * u);
          lo = Math.min(lo, f.z - width);
          hi = Math.max(hi, f.z + width);
        }
      }
      for (let j = 0; j <= 28; j++) {
        const pz =
          (lo + hi) / 2 +
          ((hi - lo) / 2) * Math.sin((j / 28 - 0.5) * Math.PI) * 0.9999;
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
    const bp = g.getAttribute("position"),
      bn = g.getAttribute("normal");
    for (let i = 221 * 29; i < bp.count; i++) {
      const t = Math.max(0, Math.min(1, (bp.getX(i) + 246) / 185));
      const centre =
        -68 -
        29 * Math.sin(Math.PI * t) +
        (rounds === KITCHEN_BANANAS[1] ? 33 : 0);
      const r = 3 + 14 * Math.pow(Math.sin(Math.PI * t), 0.6);
      const z = (bp.getZ(i) - centre) / r,
        y = Math.min(0, (bp.getY(i) - 42) / r);
      const x = ((29 * Math.PI) / 185) * Math.cos(Math.PI * t) * z;
      const length = Math.hypot(x, y, z) || 1;
      bn.setXYZ(i, x / length, y / length, z / length);
    }
    add(g, "#ddb337", KIND.banana);
  }
  // Fine world slices follow the same sheared lid to within a fraction of a toe.
  const c = KITCHEN_CADDY;
  const lid = box(c.x, 0, c.z, (c.hx + 2) * 2, 4, c.hz * 2);
  const lp = lid.getAttribute("position");
  for (let i = 0; i < lp.count; i++)
    lp.setY(
      i,
      c.top +
        (lp.getZ(i) - (c.z - c.hz) - c.hz / c.lidSlices) * 0.3 +
        lp.getY(i) +
        2,
    );
  lid.computeVertexNormals();
  const lidSeen = lid.clone();
  add(lid, "#547068");
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
    // The tumbler's juice is drawn with the tumbler.
    if (!p.pool || p.y === KITCHEN_GLASS.juice) continue;
    add(
      new THREE.CircleGeometry(p.r, 48)
        .rotateX(-Math.PI / 2)
        .translate(p.x, (p.y ?? 0) + 0.025, p.z),
      p.name === "honey"
        ? "#be791f"
        : p.name === "peach juice"
          ? "#da9b45"
          : "#f39220",
      p.name === "orange juice" ? KIND.juice : KIND.honey,
    );
  }
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
  // Cloth is flat on the worktop; its hanging end lies below the reachable floor.
  add(
    new THREE.PlaneGeometry(150, 50).translate(400, -25, 300.05),
    "#6d8b9b",
    KIND.cloth,
  );
  // A single dial avoids overlapping enamel layers at the far pass's depth precision.
  add(
    new THREE.CircleGeometry(74, 64).translate(385, 355, -299.65),
    "#ece0c3",
    KIND.clock,
  );
  batch.build(group);
  glassBatch.build(group);
  // Eyes get only coarse solid silhouettes, excluding the skin grids and small flecks.
  const seenGroup = new THREE.Group(),
    seenBatch = new Batch();
  const seenM = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    metalness: 0,
    envMapIntensity: 0.3,
    side: THREE.DoubleSide,
  });
  seenBatch.add(seenM, paint(counterSeen, "#c7c1ae"));
  for (const g of windowSeen) seenBatch.add(seenM, g);
  seenBatch.add(seenM, paint(lidSeen, "#547068"));
  const peachTop = KITCHEN_SOLIDS.find((s) => s.name === "kitchen peach");
  for (const s of KITCHEN_SOLIDS) {
    if (
      (s.name === "kitchen peach" && s !== peachTop) ||
      s.name === "kitchen lid" ||
      s.name === "kitchen wall" ||
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
          s.name.includes("banana")
            ? "#dcb938"
            : s.name === "kitchen glass"
              ? "#d08a3a"
              : "#998561",
        ),
      );
  }
  seenBatch.add(
    seenM,
    paint(
      lathe(
        profile.filter((_, i) => i % 12 < 2),
        0,
        0,
        24,
      )
        .scale(p.rx, 1, p.rz)
        .rotateY(p.angle)
        .translate(p.x, 0, p.z),
      "#c88945",
    ),
  );
  // Eye caps alone vanish from below: the body columns and slab undersides matter too.
  for (const s of KITCHEN_SOLIDS) {
    const f = s.footprint;
    if (
      f.kind === "box" ||
      s.name === "kitchen peach" ||
      s.name === "kitchen lid" ||
      s.name === "kitchen stone" ||
      s.name.includes("crumb")
    )
      continue;
    const rx = f.kind === "circle" ? f.r : f.rx,
      rz = f.kind === "circle" ? f.r : f.rz;
    const angle = f.kind === "circle" ? 0 : f.angle;
    const bottom = s.bottom ?? 0;
    // The few rings of the tumbler's coarse top miss its straight wall.
    if (s.name === "kitchen glass")
      seenBatch.add(
        seenM,
        paint(
          new THREE.CylinderGeometry(rx, rx, KITCHEN_GLASS.rim, 12, 1, true).translate(
            f.x,
            KITCHEN_GLASS.rim / 2,
            f.z,
          ),
          "#d08a3a",
        ),
      );
    if (s.top.kind === "flat" || s.top.kind === "dome") {
      const top = s.top.kind === "flat" ? s.top.y : s.top.base;
      if (top > bottom)
        seenBatch.add(
          seenM,
          paint(
            new THREE.CylinderGeometry(1, 1, top - bottom, 12, 1, true)
              .scale(rx, 1, rz)
              .rotateY(angle)
              .translate(f.x, (top + bottom) / 2, f.z),
            s.name.includes("banana") ? "#dcb938" : "#998561",
          ),
        );
    }
    if (s.bottom !== undefined)
      seenBatch.add(
        seenM,
        paint(
          new THREE.CircleGeometry(1, 12)
            .rotateX(Math.PI / 2)
            .scale(rx, 1, rz)
            .rotateY(angle)
            .translate(f.x, bottom, f.z),
          "#998561",
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
      glassTime.value = time;
      glassRain.value = weather.rain;
      glassWet.value = weather.wet;
      glassHeavy.value = weather.heavy;
      glassFrost.value = weather.snowCover;
    },
    ripple: surfaces.ripple,
  };
}
