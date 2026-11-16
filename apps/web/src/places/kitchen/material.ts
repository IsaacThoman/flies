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
};

export function surfaceMaterial() {
  const rings = {
    value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, -100, 0)),
  };
  const time = { value: 0 };
  let ring = 0;
  const night = { value: 0 };
  const rain = { value: 0 };
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.45,
    metalness: 0.02,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = night;
    shader.uniforms.uRings = rings;
    shader.uniforms.uTime = time;
    shader.uniforms.uRain = rain;
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
      varying float vKind; varying vec3 vPlace; uniform float uNight; uniform float uRain; uniform vec4 uRings[4]; uniform float uTime;
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
        float grain = sin(p.x*.44 + noise(p.xz*.025)*12.0 + sin(p.z*.036)*2.0);
        diffuseColor.rgb *= .83+.17*grain+micro*.055;
        float cuts = pow(abs(sin((p.x+p.z*.36)*2.2)),80.0)*.08;
        diffuseColor.rgb *= 1.0-cuts;
      } else if(k<2.5) {
        diffuseColor.rgb *= .96+.04*micro;
        if(p.y>44.0 && p.y<55.0) diffuseColor.rgb *= vec3(.40,.64,.62);
      } else if(k<3.5) {
        vec2 q=p.xz*.58; vec2 cell=floor(q); vec2 f=fract(q)-.5;
        float spot=(1.0-smoothstep(.08,.24,length(f)))*step(.70,hash(cell));
        float bruise = smoothstep(.59,.79,noise(p.xz*.055));
        diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.12,.054,.014),max(spot*.9,bruise*.45));
        diffuseColor.rgb *= .88+.12*sin(p.z*1.4+p.x*.05);
        // Split skin reveals pale fermenting flesh at the feeding site.
        float split=1.0-smoothstep(.8,2.0,length((p.xz-vec2(-158,-96))/vec2(3.8,1)));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.92,.75,.39),split);
      } else if(k<4.5) {
        float d=length(p.xz-vec2(30,158));
        float fibres=pow(abs(sin(atan(p.z-158.0,p.x-30.0)*63.0+noise(p.xz*.6)*2.0)),12.0);
        diffuseColor.rgb *= .90+.10*micro-fibres*.06;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.55,.11,.052), (1.0-smoothstep(10.0,20.0,d))*.75);
      } else if(k<5.5) {
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.38,.38,.51),.24+micro*.12);
      } else if(k<6.5) {
        diffuseColor.rgb *= .65+.35*noise(p.xz*1.7);
      } else if(k<7.5) {
        vec2 tile=vec2(p.x/110.0,p.y/57.0); tile.x+=mod(floor(tile.y),2.0)*.5;
        vec2 f=fract(tile); float grout=step(.026,f.x)*step(.045,f.y);
        diffuseColor.rgb=mix(vec3(.38,.36,.30),diffuseColor.rgb*(.94+.06*hash(floor(tile))),grout);
        // The garden is seen through the window over the tiled splashback.
        if(p.z < -299.0 && p.y>265.0 && abs(p.x+80.0)<325.0 && p.y<1000.0) {
          vec2 w=vec2((p.x+80.0)/325.0,(p.y-265.0)/735.0);
          float frame=step(.94,abs(w.x))+1.0-step(.035,w.y)+step(.965,w.y)+1.0-step(.018,abs(w.x));
          vec3 view=mix(vec3(.21,.35,.18),vec3(.64,.79,.85),smoothstep(.04,.42,w.y));
          view=mix(view,vec3(.60,.66,.67),uRain*.55);
          float streak=pow(max(0.0,sin(p.x*1.8+p.y*.013)),60.0)*uRain*.18;
          diffuseColor.rgb=mix(view*(1.0-uNight*.92)+streak,vec3(.78,.74,.64),min(frame,1.0));
        }
      }
      if(k>8.5) for(int i=0;i<4;i++) {
        float age=uTime-uRings[i].z;
        float d=length(p.xz-uRings[i].xy);
        float wave=exp(-pow((d-age*9.0)*3.0,2.0))*max(0.0,1.0-age/2.0)*uRings[i].w;
        diffuseColor.rgb+=wave*.14;
      }
    `,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
      if(vKind>1.5 && vKind<2.5) roughnessFactor=.21;
      if(vKind>4.5 && vKind<5.5) roughnessFactor=.32;
      if(vKind>7.5 && vKind<8.5) roughnessFactor=.24;
      if(vKind>8.5) roughnessFactor=.10;
    `,
      )
      .replace(
        "#include <metalnessmap_fragment>",
        "#include <metalnessmap_fragment>\nif(vKind>7.5 && vKind<8.5) metalnessFactor=.7;",
      );
  };
  material.customProgramCacheKey = () => "kitchen-surfaces-1";
  return {
    material,
    update(t: number, light: Daylight, weather: Weather) {
      time.value = t;
      night.value = light.stars;
      rain.value = weather.rain;
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
