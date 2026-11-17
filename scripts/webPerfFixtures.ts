// Static render fixtures: freeze life and the automatic clock, then draw fixed steps.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import type { Browser } from "playwright";
import { serveSite } from "./serve.ts";
import { chromiumPath, gpuFlags, waitFor } from "./play.ts";
import { withHeavySlot } from "./heavySlot.ts";
import { PLACES } from "../apps/web/src/places/catalog.ts";
import type { Game } from "../apps/web/src/game.ts";
declare global { var __fixture: { game: Game; frame(dt: number, now: number): void }; }
const pairs = process.argv.slice(2);
if (!pairs.length || pairs.length % 2) throw Error("Pass built-site/output-folder pairs");
await withHeavySlot(async () => {
 for (let pair = 0; pair < pairs.length; pair += 2) {
 const dir = pairs[pair], out = pairs[pair + 1];
 mkdirSync(out,{recursive:true});
 const site = await serveSite({dir,base:"/fly/"});
 let browser: Browser | undefined;
 try {
  browser = await chromium.launch({ executablePath:chromiumPath(),args:gpuFlags() });
  const context = await browser.newContext({viewport:{width:1280,height:720}});
  const page = await context.newPage();
  await page.addInitScript(() => {
   let seed=42;
   Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
   const RealDate=Date;
   // A fixed civil clock keeps the forecast and sunlight identical.
   globalThis.Date=class extends RealDate { constructor(){super("2026-11-16T12:00:00-05:00");} static now(){return new RealDate("2026-11-16T12:00:00-05:00").getTime();} } as DateConstructor;
   const raf=requestAnimationFrame.bind(window);
   let installed=false;
   window.requestAnimationFrame=cb=>raf(now=>{
    const g=(globalThis as unknown as {__fly?:Game}).__fly;
    if(g&&!installed){installed=true; globalThis.__fixture={game:g,frame:g.frame.bind(g)};g.life.step=()=>{};g.frame=()=>{};g.quality!.frame=()=>{};}
    cb(now);
   });
  });
  await page.goto(site.url);
  // Frame stats are only published by a frame, so inspect the asynchronous driver directly.
  await page.waitForFunction(()=>globalThis.__fixture?.game.brain.status==="running",null,{timeout:120000});
  await page.evaluate(()=>{
   const {frame}=globalThis.__fixture;
   for(let i=0;i<180;i++) frame(1/60,(i+1)*1000/60);
  });
  await page.locator("#game").screenshot({path:`${out}/title.png`});
  for(const place of PLACES){
   await page.evaluate(id=>{
    const {game:g,frame}=globalThis.__fixture;
    let seed=42;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
    g.play();g.settings.place=id;g.settings.wallpaperAfter=0;g.settings.realWeather=false;g.applySettings(false);g.moveTo(id);
    g.hands.setKind("light","noon");g.hands.setKind("weather","clear");g.hands.setKind("view","table");
    g.hands.chooseTool(0);g.hands.variants[0]=0;
    for(let i=0;i<300;i++)frame(1/60,(g.time+1/60)*1000);
   },place.id);
   await waitFor(page,`place=${place.id},moving=`);
   await page.locator("#game").screenshot({path:`${out}/${place.id}.png`});
  }
  writeFileSync(`${out}/fixture.txt`,"1280x720; seeded page randomness; fixed civil clock; life.step held; fixed manual frame steps; real renderer and built site. These fixtures establish render equivalence, not behavioral equivalence.\n");
 }finally{await browser?.close();await site.close();}
 }
});
