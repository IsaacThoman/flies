import * as THREE from "three";
import type { Daylight } from "../../scene/light.ts";
import type { Weather } from "../../scene/weather.ts";

export const KIND = {
  stone: 0,
  wood: 1,
  glaze: 2,
  banana: 3,
  peach: 4,
  grape: 5,
  compost: 6,
  wall: 7,
  metal: 8,
  honey: 9,
  wine: 10,
  bulb: 11,
  skin: 12,
};

export function surfaceMaterial() {
  const rings = {
    value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, -100, 0)),
  };
  const time = { value: 0 };
  let ring = 0;
  const night = { value: 0 };
  const sun = { value: new THREE.Vector3() };
  const soft = { value: 0 };
  const lamp = { value: 0 };
  const lighting = THREE.ShaderChunk.lights_fragment_begin.replace(
    "getDirectionalLightInfo( directionalLight, directLight );",
    `getDirectionalLightInfo( directionalLight, directLight );
    vec3 lampDelta=vec3(260.0,430.0,-160.0)-vPlace;
    vec3 lampDirection=(viewMatrix*vec4(normalize(lampDelta),0.0)).xyz;
    directLight.direction=normalize(mix(directLight.direction,lampDirection,uLamp));
    directLight.color*=mix(1.0,1.5/(1.0+dot(lampDelta,lampDelta)/360000.0),uLamp);
  `,
  );
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.45,
    metalness: 0.02,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = night;
    shader.uniforms.uRings = rings;
    shader.uniforms.uTime = time;
    shader.uniforms.uSun = sun;
    shader.uniforms.uSoft = soft;
    shader.uniforms.uLamp = lamp;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float kind; varying float vKind; varying vec3 vPlace;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvKind = kind; vPlace = position;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
      varying float vKind; varying vec3 vPlace; uniform float uNight; uniform vec3 uSun; uniform float uSoft; uniform float uLamp; uniform vec4 uRings[4]; uniform float uTime;
      float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
    `,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      vec3 p = vPlace; float k = vKind; float micro = noise(p.xz*6.0);
      if(k<0.5) {
        float vein = pow(0.5+0.5*sin(p.x*.026+p.z*.018+noise(p.xz*.009)*10.0),18.0);
        diffuseColor.rgb *= 0.91 + noise(p.xz*.32)*.09 - vein*.12;
        float shade = 1.0 - .28*exp(-pow(length((p.xz-vec2(-155,-35))/vec2(125,120)),6.0));
        shade *= 1.0-.25*exp(-pow(length((p.xz-vec2(354,110))/vec2(42,42)),8.0));
        diffuseColor.rgb *= shade;
      } else if(k<1.5) {
        float grain = sin(p.x*1.8 + noise(p.xz*.02)*12.0 + sin(p.z*.036)*2.0);
        diffuseColor.rgb *= .91+.06*grain+micro*.03;
        float cuts = pow(abs(sin((p.x+p.z*.36)*2.2)),80.0)*.025;
        diffuseColor.rgb *= 1.0-cuts;
      } else if(k<2.5) {
        diffuseColor.rgb *= .96+.04*micro;
        if(p.y>44.0 && p.y<55.0 && length(p.xz-vec2(-155,-35))<125.0) diffuseColor.rgb *= vec3(.40,.64,.62);
      } else if(k<3.5) {
        vec2 q=p.xz*.58; vec2 cell=floor(q); vec2 f=fract(q)-.5;
        float spot=(1.0-smoothstep(.08,.24,length(f)))*step(.70,hash(cell));
        float bruise = smoothstep(.59,.79,noise(p.xz*.055));
        diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.12,.054,.014),max(spot*.9,bruise*.45));
        float t=clamp((p.x+246.0)/185.0,0.0,1.0);
        float middle=-68.0-29.0*sin(t*3.14159265);
        middle+=abs(p.z-(middle+33.0))<abs(p.z-middle)?33.0:0.0;
        diffuseColor.rgb *= .96+.04*cos((p.z-middle)*.28);
        // Split skin reveals pale fermenting flesh at the feeding site.
        float split=1.0-smoothstep(.8,2.0,length((p.xz-vec2(-158,-96))/vec2(3.8,1)));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.92,.75,.39),split);
      } else if(k<4.5) {
        vec2 a=p.xz-vec2(30,158);
        vec2 q=vec2(a.x*.968912-a.y*.247404,a.x*.247404+a.y*.968912)/vec2(35,30);
        float d=length(p.xz-vec2(25,155));
        float fibres=pow(abs(sin(atan(p.z-158.0,p.x-30.0)*63.0+noise(p.xz*.6)*2.0)),12.0);
        diffuseColor.rgb *= .90+.10*micro-fibres*.06;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.55,.11,.052), (1.0-smoothstep(10.0,20.0,d))*.75);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.70,.17,.07),smoothstep(.975,.998,length(q)));
      } else if(k<5.5) {
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.38,.38,.51),.24+micro*.12);
        float split=1.0-smoothstep(2.0,4.2,length(p.xz-vec2(-151,0)));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.58,.59,.25),split);
      } else if(k<6.5) {
        diffuseColor.rgb *= .65+.35*noise(p.xz*1.7);
        if(p.y>149.0 && p.x < -300.0) diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.38,.35,.10),smoothstep(.45,.65,noise(p.xz*.15)));
        if(p.y<18.0 && p.y>14.0) diffuseColor.rgb*=.65+.35*smoothstep(.1,.5,noise(p.xz*12.0));
        if(p.y>39.9 && p.y<48.0) diffuseColor.rgb*=.65+.35*pow(abs(sin(p.x*3.5+noise(p.xz*.3)*4.0)),.5);
      } else if(k<7.5) {
        vec2 tile=vec2(p.x/110.0,p.y/57.0); tile.x+=mod(floor(tile.y),2.0)*.5;
        vec2 f=fract(tile); float grout=step(.026,f.x)*step(.045,f.y);
        diffuseColor.rgb=mix(vec3(.38,.36,.30),diffuseColor.rgb*(.94+.06*hash(floor(tile))),grout);
        if(p.y>260.0) diffuseColor.rgb=vColor.rgb*(.97+.03*noise(p.xy*.3));
      }
      if(k>11.5) {
        float blush=noise(p.xz*.05)*.35+noise(p.xy*.2)*.15;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.83,.44,.10),blush);
        diffuseColor.rgb*=.92+micro*.08;
      }
      if(k>8.5 && k<10.5) for(int i=0;i<4;i++) {
        float age=uTime-uRings[i].z;
        float d=length(p.xz-uRings[i].xy);
        float wave=exp(-pow((d-age*9.0)*3.0,2.0))*max(0.0,1.0-age/2.0)*uRings[i].w;
        diffuseColor.rgb+=wave*.14;
      }
    `,
      )
      .replace("#include <lights_fragment_begin>", lighting)
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
        float reach=1.0;
        if(uSun.z < -.01) {
          float t=(-300.0-vPlace.z)/uSun.z;
          vec2 q=vPlace.xy+uSun.xy*t;
          float b=2.0+uSoft*45.0;
          reach=smoothstep(-b,b,q.x+405.0)*smoothstep(-b,b,245.0-q.x)*smoothstep(-b,b,q.y-265.0)*smoothstep(-b,b,1000.0-q.y);
          reach*=smoothstep(4.0-b,8.0+b,abs(q.x+80.0));
        }
        reach=mix(reach,1.0,uLamp);
        reflectedLight.directDiffuse*=reach;
        reflectedLight.directSpecular*=reach;
      `,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
      if(vKind>1.5 && vKind<2.5) roughnessFactor=.28;
      if(vKind<1.5) roughnessFactor=.82;
      if(vKind>4.5 && vKind<5.5) roughnessFactor=.32;
      if(vKind>7.5 && vKind<8.5) roughnessFactor=.24;
      if(vKind>8.5) roughnessFactor=.10;
      if(vKind>11.5) roughnessFactor=.78;
    `,
      )
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\nif(vKind>10.5 && vKind<11.5) totalEmissiveRadiance += vec3(1.0,.50,.14)*(0.3+uNight*2.0);",
      )
      .replace(
        "#include <metalnessmap_fragment>",
        "#include <metalnessmap_fragment>\nif(vKind>7.5 && vKind<8.5) metalnessFactor=.7;",
      );
  };
  material.customProgramCacheKey = () => "kitchen-surfaces-3";
  return {
    material,
    update(t: number, light: Daylight, weather: Weather) {
      time.value = t;
      night.value = light.stars;
      sun.value.copy(light.sunDirection);
      soft.value = weather.cloud;
      lamp.value = Math.min(1, Math.max(0, (light.stars - 0.05) / 0.45));
    },
    ripple(x: number, z: number, strength: number) {
      rings.value[ring].set(x, z, time.value, strength);
      ring = (ring + 1) % 4;
    },
  };
}

export function tag(g: THREE.BufferGeometry, kind: number) {
  g.setAttribute(
    "kind",
    new THREE.Float32BufferAttribute(
      new Float32Array(g.attributes.position.count).fill(kind),
      1,
    ),
  );
  return g;
}
