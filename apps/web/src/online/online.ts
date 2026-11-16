// Living at a shared table (a spike: ?room=ws://host:port, or ?room for this
// host on the room server's port). This device is the authority on its own
// fly: its brain and body run here, and about 20 times a second the room
// hears where it is and how it is posed. Everyone else's fly is a body posed
// from what their device sends (others.ts), which this fly sees with its
// eyes and meets with its body; their hands act on the world as this
// player's do (other-hands.ts). The table itself is the room's: the food
// (table-pantry.ts), the light and the weather, the bubbles (from its seed
// and clock) and when a visitor comes. Nothing passes between the flies but
// what their bodies can sense.

import * as THREE from "three";
import type { Looming } from "@fly/body";
import { BODY_HALF, BODY_RADIUS, segmentToSegment } from "@fly/body";
import {
  AIRBORNE, AWAY, EATING, HANDS, HOLDING, PLAYING, SEND_EVERY, SWOOP, TableBubbles, ballAt, ballProgress, createFlyState, decodeFlies, fromWire, mix, stream,
} from "@fly/net";
import type { BallWire, Bite, FlyState, HappeningWire, ServerMessage, V3 } from "@fly/net";
import { Pantry } from "@fly/world";
import type { FoodKind, Vec3, World } from "@fly/world";
import type { Eyes } from "../eyes/eyes.ts";
import type { FlyView } from "../fly-view.ts";
import type { Life } from "../life.ts";
import type { SharedTable } from "../places/types.ts";
import type { Bubbles } from "../scene/bubbles.ts";
import type { Stage } from "../stage.ts";
import { BALL_RADIUS, TOOLS } from "../tools/hands.ts";
import type { Hands } from "../tools/hands.ts";
import { RoomConnection } from "./connection.ts";
import { OtherHand } from "./other-hands.ts";
import { OtherFlies } from "./others.ts";
import type { TablePantry } from "./table-pantry.ts";

/** The room server's port when only ?room is given. */
export const ROOM_PORT = 8787;
/** Bites go to the room this often, ms. */
const BITES_EVERY = 100;
/**
 * A throw starts this long after Select (ms), the same moment on every
 * device, so everyone sees the whole dive; the thrower sees the ball wait at
 * the start of its run meanwhile. ?lead= changes it.
 */
export const LEAD = 200;
/** A visit the room started more than this long ago (ms) is not started late: it would already be somewhere else. */
const LATE_VISIT = 3000;
/** The table's high bubbles (the room's TABLE_BUBBLES). */
const TABLE_BUBBLES = 8;

const LIGHT_TOOL = TOOLS.findIndex((t) => t.id === "light");
const WEATHER_TOOL = TOOLS.findIndex((t) => t.id === "weather");

/** The room to join, from the page's address; null to live alone. */
export function roomFromUrl(): { url: string; lead: number; modelForEyes: boolean; spawn: number[] | null } | null {
  if (typeof location === "undefined") return null;
  const q = new URLSearchParams(location.search);
  const room = q.get("room");
  if (room === null) return null;
  const url = room && room !== "1" ? room : `ws://${location.hostname || "localhost"}:${ROOM_PORT}`;
  const lead = Number(q.get("lead") ?? LEAD);
  // Where to set this fly down (x,z,yaw), for scripts that need two flies to start face to face.
  const spawn = q.get("spawn")?.split(",").map(Number) ?? null;
  return { url, lead: Number.isFinite(lead) ? lead : LEAD, modelForEyes: q.get("eyesSee") === "model", spawn: spawn?.length === 3 && spawn.every(Number.isFinite) ? spawn : null };
}

export type OnlineParts = {
  scene: THREE.Scene;
  stage: Stage;
  life: Life;
  pantry: TablePantry;
  hands: Hands;
  fly: FlyView;
  eyes: Eyes;
  bubbles: Bubbles;
  /** What the place's goings-on left for the fly this frame (for reading the visitors' whereabouts). */
  felt: { looming: Looming[] };
  /** The table's light or weather changed: follow it. */
  onWorld: () => void;
};

/** What the game tells the room about the player each send. */
export type PlayerNow = { away: boolean; playing: boolean; handsOut: boolean; holding: boolean; eye: Vec3 };

export class Online {
  readonly connection: RoomConnection;
  readonly others: OtherFlies;
  readonly hands = new Map<number, OtherHand>();
  /** The same hands in a list, for going through each frame without making anything. */
  readonly #handList: OtherHand[] = [];
  readonly shared: SharedTable;
  /** What the others' hands do to this fly this frame: a feather's touch, their puffs, their balls coming. */
  stroke = 0;
  readonly air: Vec3 = { x: 0, y: 0, z: 0 };
  readonly looming: Looming[] = [];
  threat: Vec3 | null = null;
  id = 0;
  colour = "";
  table: TableBubbles | null = null;
  readonly lead: number;
  /** Room time now, ms. */
  now = 0;
  readonly #parts: OnlineParts;
  readonly #world: World;
  readonly #me: FlyState = createFlyState();
  readonly #mine: BallWire = { by: 0, at: 0, from: [0, 0, 0], via: [0, 0, 0], to: [0, 0, 0] };
  #mineFlying = false;
  readonly #othersAt: Vec3[] = [];
  readonly #anchor: Vec3 = { x: 0, y: 0, z: 0 };
  readonly #visits: HappeningWire[] = [];
  readonly #bites: Bite[] = Array.from({ length: 16 }, () => ({ food: 0, amount: 0 }));
  readonly #empty: Pantry;
  #sentAt = 0;
  #bitesAt = 0;
  #seq = 0;
  #biteSeq = 0;
  #lastRoomNow = 0;
  /** The table's hours since the epoch at a room time: its clock. */
  #hours: { hours: number; at: number } | null = null;
  /** The last ball another player threw was heard of this long after its dive began, ms (negative: before, as it should be). */
  ballHeard = 0;
  /** The nearest any other fly's body came to this one's, as drawn here (mm; below 0 they overlapped), since last asked. */
  closest = Infinity;

  readonly #spawnAt: number[] | null;
  #frames = 0;
  #framesAt = 0;
  fps = 0;

  constructor(url: string, parts: OnlineParts, options: { lead: number; modelForEyes: boolean; spawn: number[] | null }) {
    this.#parts = parts;
    this.#spawnAt = options.spawn;
    this.#world = parts.life.world;
    this.lead = options.lead;
    this.others = new OtherFlies(parts.scene, this.#world, parts.eyes, options.modelForEyes);
    this.#empty = new Pantry(this.#world, []);
    this.shared = { others: this.#othersAt, anchor: this.#anchor };
    this.connection = new RoomConnection(url);
    this.connection.onMessage = (m) => this.#message(m);
    const scratch = createFlyState();
    this.connection.onFlies = (view) => decodeFlies(view, scratch, (s) => this.others.heard(s, this.#roomNow()));
    parts.pantry.onFound = (food) => this.connection.send({ type: "found", id: food.id, name: food.name, x: food.x, z: food.z, r: food.r, sweet: food.sweet });
  }

  get joined() {
    return this.connection.status === "joined" && this.id > 0;
  }

  #roomNow() {
    return this.connection.clock.now(performance.now());
  }

  /** The table's local hours since the epoch now, or null before the room has said. */
  hours(): number | null {
    return this.#hours ? this.#hours.hours + (this.now - this.#hours.at) / 3_600_000 : null;
  }

  #message(m: ServerMessage) {
    const parts = this.#parts;
    switch (m.type) {
      case "welcome": {
        this.id = m.id;
        this.colour = m.colour;
        parts.fly.model.mark(m.colour);
        parts.pantry.player = m.id;
        parts.pantry.mirror.welcome(m.foods);
        this.#hours = { hours: m.hours, at: m.now };
        this.table = new TableBubbles(m.seed, this.#world, TABLE_BUBBLES);
        this.table.restore(m.bubbles);
        parts.bubbles.table = { bubbles: this.table, time: m.now / 1000, burst: (slot, cycle, at) => this.connection.send({ type: "pop", slot, cycle, at: at * 1000 }) };
        for (const p of m.players) this.#join(p.id, p.colour);
        for (const b of m.balls) this.hands.get(b.by)?.throw(b);
        for (const h of m.happenings) this.#visits.push(h);
        this.#takeWorld(m.world.light, m.world.weather);
        this.#spawn(m.id);
        return;
      }
      case "joined":
        this.#join(m.id, m.colour);
        return;
      case "left":
        this.others.leave(m.id);
        this.hands.get(m.id)?.view.group.removeFromParent();
        this.hands.delete(m.id);
        this.#handList.length = 0;
        for (const h of this.hands.values()) this.#handList.push(h);
        return;
      case "drop":
        if (m.by !== this.id) this.hands.get(m.by)?.drop(m.id, m.kind as FoodKind, m.x, m.z, (this.now - m.at) / 1000);
        return;
      case "found":
        parts.pantry.mirror.add(fromWire(this.#world, m.food));
        return;
      case "ball":
        this.hands.get(m.by)?.throw(m);
        // How long before (negative) or after its dive began the throw was heard of here.
        this.ballHeard = this.now - m.at;
        return;
      case "world":
        this.#takeWorld(m.light, m.weather);
        return;
      case "happening":
        this.#visits.push(m);
        return;
      case "pop":
        this.table?.pop(m.slot, m.cycle, m.at / 1000);
        return;
      case "food":
        parts.pantry.mirror.apply(m.ack, m.amounts, m.gone, m.eaten[this.id]);
        return;
    }
  }

  #join(id: number, colour: string) {
    if (id === this.id || this.hands.has(id)) return;
    this.others.join(id, colour);
    const hand = new OtherHand(this.#parts.scene, this.#world, id, colour, this.#parts.pantry, this.#empty);
    for (const object of hand.view.seen) this.#parts.eyes.see(object);
    this.hands.set(id, hand);
    this.#handList.push(hand);
  }

  /** The table's light and weather: shown on the Light and Weather tools, and followed. */
  #takeWorld(light: string, weather: string) {
    const hands = this.#parts.hands;
    const l = TOOLS[LIGHT_TOOL].variants.findIndex((v) => v.id === light);
    const w = TOOLS[WEATHER_TOOL].variants.findIndex((v) => v.id === weather);
    if (l >= 0) hands.variants[LIGHT_TOOL] = l;
    if (w >= 0) hands.variants[WEATHER_TOOL] = w;
    this.#parts.onWorld();
  }

  /** The player chose a light or a weather: it is the table's. */
  chooseWorld(light: string, weather: string) {
    this.connection.send({ type: "world", light, weather });
  }

  /** Each newcomer is set down a few body lengths from the first fly's spot, facing it, so they find each other. */
  #spawn(id: number) {
    const start = this.#world.place.start;
    const body = this.#parts.life.body;
    if (this.#spawnAt) {
      body.place(this.#spawnAt[0], this.#spawnAt[1], this.#spawnAt[2]);
      return;
    }
    if (id === 1) {
      body.place(start.x, start.z, start.yaw);
      return;
    }
    const a = id * 2.39996;
    const x = start.x + Math.cos(a) * 8;
    const z = start.z + Math.sin(a) * 8;
    body.place(x, z, Math.atan2(start.x - x, start.z - z));
  }

  /** Before this fly lives its frame: the network, the others where they were a moment ago, and what their hands do to it. */
  update(dt: number, camera: THREE.Camera, time: number, floorAt: (x: number, z: number) => number) {
    const now = performance.now();
    this.#frames++;
    if (now - this.#framesAt >= 1000) {
      this.fps = (this.#frames * 1000) / (now - this.#framesAt);
      this.#frames = 0;
      this.#framesAt = now;
    }
    this.connection.update(dt, now);
    const roomNow = this.#roomNow();
    const prev = this.#lastRoomNow || roomNow;
    this.#lastRoomNow = roomNow;
    this.now = roomNow;
    const { life, hands } = this.#parts;
    this.#localTools(roomNow);
    this.others.update(roomNow, dt, life.crowd);

    // The others where this fly can meet them, and the one visits are planned round (the lowest id, the same on every device).
    this.#othersAt.length = 0;
    let anchorId = this.id || 255;
    const a = this.#anchor;
    const mine = life.body.position;
    a.x = mine.x;
    a.y = mine.y;
    a.z = mine.z;
    let closest = Infinity;
    for (const o of this.others.list) {
      if (!o.present) continue;
      this.#othersAt.push(o.position);
      if (o.id < anchorId) {
        anchorId = o.id;
        a.x = o.position.x;
        a.y = o.position.y;
        a.z = o.position.z;
      }
      if (Math.abs(o.position.y - mine.y) < BODY_RADIUS * 2) closest = Math.min(closest, bodyGap(life.body.position, life.body.yaw, o.position, o.state.yaw));
    }
    this.closest = Math.min(this.closest, closest);

    // Their hands on this fly: a feather resting on it or stroking it, a puff, a ball coming.
    this.stroke = 0;
    this.air.x = this.air.y = this.air.z = 0;
    this.looming.length = 0;
    this.threat = null;
    let threatAt = Infinity;
    for (let i = 0; i < this.#handList.length; i++) {
      const hand = this.#handList[i];
      const other = this.others.get(hand.player);
      if (other?.present) hand.heard(other.track.newest!);
      hand.update(dt, roomNow, life.body, camera, time, floorAt);
      const h = hand.hands;
      this.stroke = Math.max(this.stroke, h.stroke);
      this.air.x += h.air.x;
      this.air.y += h.air.y;
      this.air.z += h.air.z;
      this.looming.push(h.looming[0]);
      if (h.ball.active && h.ball.t >= 0) {
        const d = Math.hypot(h.ball.position.x - mine.x, h.ball.position.y - mine.y, h.ball.position.z - mine.z);
        if (d < threatAt) {
          threatAt = d;
          this.threat = h.ball.position;
        }
      }
    }
    if (hands.ball.active && hands.ball.t >= 0) this.threat = null;

    // The table's bubbles, at its clock, burst where a ball meets them.
    const table = this.table;
    if (table) {
      table.rain = this.#parts.stage.weather.rain;
      table.update(roomNow / 1000);
      for (let i = 0; i < this.#handList.length; i++) this.#ballThroughBubbles(this.#handList[i].hands.ball, prev, roomNow, table);
      if (this.#mineFlying) {
        if (ballProgress(this.#mine, roomNow) >= 1) this.#mineFlying = false;
        else table.hitBy(Math.max(this.#mine.at, prev) / 1000, roomNow / 1000, BALL_RADIUS, (t, out) => ballAt(this.#mine, ballProgress(this.#mine, t * 1000), out));
      }
      if (this.#parts.bubbles.table) this.#parts.bubbles.table.time = roomNow / 1000;
    }

    // Visits the room has started, each from its own stream.
    const set = this.#parts.stage.set;
    for (let i = this.#visits.length - 1; i >= 0; i--) {
      const v = this.#visits[i];
      if (roomNow < v.at) continue;
      this.#visits.splice(i, 1);
      if (roomNow - v.at < LATE_VISIT) set.happen?.(v.kind, stream(mix(v.seed)));
    }
  }

  #ballThroughBubbles(ball: Hands["ball"], prev: number, now: number, table: TableBubbles) {
    if (!ball.active || ball.t < 0) return;
    const wire = scratchBall;
    wire.at = now - ball.t * SWOOP.seconds * 1000;
    setV3(wire.from, ball.from);
    setV3(wire.via, ball.via);
    setV3(wire.to, ball.to);
    table.hitBy(Math.max(wire.at, prev) / 1000, now / 1000, BALL_RADIUS, (t, out) => ballAt(wire, ballProgress(wire, t * 1000), out));
  }

  /** This player threw the ball or dropped food just now: the room hears of it, and the throw waits for its moment. */
  #localTools(roomNow: number) {
    const { hands, pantry } = this.#parts;
    const ev = hands.events;
    if (ev.swooped) {
      const ball = hands.ball;
      ball.t = -this.lead / (SWOOP.seconds * 1000);
      const mine = this.#mine;
      mine.by = this.id;
      mine.at = roomNow + this.lead;
      setV3(mine.from, ball.from);
      setV3(mine.via, ball.via);
      setV3(mine.to, ball.to);
      this.#mineFlying = true;
      this.connection.send({ type: "ball", at: mine.at, from: mine.from, via: mine.via, to: mine.to });
    }
    if (ev.dropped) {
      const f = hands.falling[hands.falling.length - 1];
      if (f) this.connection.send({ type: "drop", id: pantry.name(f.kind), kind: f.kind, x: f.x, z: f.z, at: roomNow });
    }
  }

  /** After this fly has lived its frame and been posed: tells the room, when due. */
  send(player: PlayerNow) {
    if (!this.joined) return;
    const now = this.now;
    if (now - this.#sentAt >= SEND_EVERY - 4) {
      this.#sentAt = now;
      this.connection.sendFly(this.#state(player, now));
    }
    if (now - this.#bitesAt >= BITES_EVERY) {
      this.#bitesAt = now;
      const mirror = this.#parts.pantry.mirror;
      let n = 0;
      for (const [food, amount] of mirror.unsent) {
        if (n >= this.#bites.length) break;
        this.#bites[n].food = food;
        this.#bites[n].amount = amount;
        n++;
      }
      if (n > 0) {
        const seq = ++this.#biteSeq & 0xffff;
        this.connection.sendBites(seq, this.#bites, n);
        mirror.sent(seq);
      }
    }
  }

  /** Said at once when the tab is hidden, while it still can be: the fly stops living until it's back. */
  away(player: PlayerNow) {
    if (this.joined) this.connection.sendFly(this.#state({ ...player, away: true }, this.#roomNow()));
  }

  #state(player: PlayerNow, now: number): FlyState {
    const { life, fly, hands } = this.#parts;
    const s = this.#me;
    const body = life.body;
    s.seq = ++this.#seq & 0xffff;
    s.t = now;
    s.flags = (body.mode === "airborne" ? AIRBORNE : 0) | (life.eating ? EATING : 0) | (player.away ? AWAY : 0) | (player.playing ? PLAYING : 0) | (player.handsOut ? HANDS : 0) | (player.holding ? HOLDING : 0);
    s.x = body.position.x;
    s.y = body.position.y;
    s.z = body.position.z;
    s.yaw = body.yaw;
    s.upX = body.up.x;
    s.upZ = body.up.z;
    s.vx = body.velocity.x;
    s.vy = body.velocity.y;
    s.vz = body.velocity.z;
    const p = fly.pose;
    s.pose.speed = p.speed;
    s.pose.turn = p.turn;
    s.pose.wings = p.wings;
    s.pose.groom = p.groom;
    s.pose.feed = p.feed;
    s.pose.crouch = p.crouch;
    s.pose.pitch = p.pitch;
    s.pose.roll = p.roll;
    const h = s.hand;
    h.x = hands.pointer.x;
    h.y = hands.pointer.y;
    h.z = hands.pointer.z;
    h.eyeX = player.eye.x;
    h.eyeY = player.eye.y;
    h.eyeZ = player.eye.z;
    h.tool = hands.tool;
    h.variant = hands.variants[hands.tool];
    return s;
  }

  /** The table as this device has it, for scripts to compare between devices. */
  publish(d: DOMStringMap) {
    const c = this.connection;
    d.online = c.status;
    d.player = String(this.id);
    d.colour = this.colour;
    d.roomTime = this.now.toFixed(0);
    d.fps = this.fps.toFixed(1);
    d.rtt = c.clock.rtt.toFixed(1);
    d.clockOffset = c.clock.offset.toFixed(1);
    d.netIn = String(c.bytesIn);
    d.netOut = String(c.bytesOut);
    d.netMessagesIn = String(c.messagesIn);
    d.netMessagesOut = String(c.messagesOut);
    const body = this.#parts.life.body;
    d.me = `${body.position.x.toFixed(2)},${body.position.y.toFixed(2)},${body.position.z.toFixed(2)},${body.yaw.toFixed(3)}`;
    d.others = this.others.list
      .map((o) => `${o.id}:${o.present ? 1 : 0}:${o.asleep ? 1 : 0}${o.state.flags & AIRBORNE ? "a" : ""}:${o.position.x.toFixed(2)},${o.position.y.toFixed(2)},${o.position.z.toFixed(2)},${o.state.yaw.toFixed(3)}:${o.track.delay.toFixed(0)}:${o.track.drawn ? ((100 * o.track.starved) / o.track.drawn).toFixed(1) : "0"}:${o.state.t.toFixed(0)}`)
      .join(";");
    d.closest = Number.isFinite(this.closest) ? this.closest.toFixed(2) : "";
    this.closest = Infinity;
    d.contact = this.#parts.life.crowd.touch.toFixed(2);
    const mirror = this.#parts.pantry.mirror;
    d.predicted = mirror.predicted.toFixed(4);
    d.granted = mirror.granted.toFixed(4);
    d.lostBites = String(mirror.lostBites);
    d.foods = this.#parts.pantry.foods.filter((f) => f.kind !== "patch").map((f) => `${f.id}:${f.amount.toFixed(3)}`).join(";");
    d.patches = this.#parts.pantry.foods.filter((f) => f.kind === "patch").map((f) => f.amount.toFixed(3)).join(",");
    d.bubbles = this.table ? this.table.slots.map((s) => `${s.cycle}@${s.t0.toFixed(3)}`).join(",") : "";
    d.visitors = this.#parts.felt.looming.map((l) => `${l.id}:${l.position.x.toFixed(1)},${l.position.y.toFixed(1)},${l.position.z.toFixed(1)}`).join(";");
    let balls = "";
    for (const [id, hand] of this.hands) if (hand.hands.ball.active) balls += `${id}:${hand.hands.ball.position.x.toFixed(1)},${hand.hands.ball.position.y.toFixed(1)},${hand.hands.ball.position.z.toFixed(1)};`;
    d.balls = balls;
    d.otherStroke = this.stroke.toFixed(2);
    d.ballHeard = this.ballHeard.toFixed(0);
    // The eyes' looming detectors now, and the fly's own air (for what other flies do to it, as the brain has it).
    const rates = this.#parts.life.brain.state?.stats.rates;
    d.loomingNow = `${(rates?.["vision.looming left"] ?? 0).toFixed(1)},${(rates?.["vision.looming right"] ?? 0).toFixed(1)}`;
  }
}

const scratchBall: BallWire = { by: 0, at: 0, from: [0, 0, 0], via: [0, 0, 0], to: [0, 0, 0] };
const scratchClosest = { ax: 0, az: 0, bx: 0, bz: 0 };

function setV3(out: V3, v: Vec3) {
  out[0] = v.x;
  out[1] = v.y;
  out[2] = v.z;
}

/** The gap between two flies' bodies as capsules (mm; below 0 they overlap). */
function bodyGap(p: Vec3, yaw: number, q: Vec3, qyaw: number) {
  const h = BODY_HALF;
  const d = segmentToSegment(
    p.x - Math.sin(yaw) * h, p.z - Math.cos(yaw) * h, p.x + Math.sin(yaw) * h, p.z + Math.cos(yaw) * h,
    q.x - Math.sin(qyaw) * h, q.z - Math.cos(qyaw) * h, q.x + Math.sin(qyaw) * h, q.z + Math.cos(qyaw) * h, scratchClosest,
  );
  return d - BODY_RADIUS * 2;
}
