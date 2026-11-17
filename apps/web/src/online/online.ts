// Living at a table with others (docs/online.md). This device is the
// authority on its own flies (one, or as many as the player keeps and the
// table has seats for): their brains and bodies run here, and about 20 times
// a second the table hears where they are and how they are posed. Everyone
// else's fly is a body posed from what their device sends (others.ts), which
// these flies see with their eyes and meet with their bodies; their hands act
// on the world as this player's do (other-hands.ts). The rest of the world there is
// the table's: the place, the food (table-pantry.ts), the light and the
// weather by the starter's clock, the bubbles from its seed and clock, and
// when a visitor comes. Nothing passes between the flies but what their
// bodies can sense.

import * as THREE from "three";
import type { OpenTableSocket } from "@fly/contracts";
import { BODY_HALF, BODY_RADIUS, segmentToSegment } from "@fly/body";
import type { Looming } from "@fly/body";
import {
  AIRBORNE, AWAY, EATING, HANDS, HOLDING, LEAD, MAX_BITES, MAX_OWN, PLAYING, PROTOCOL, SEND_EVERY, TABLETOP_SCALE, TABLE_BUBBLES, TableBubbles, ballProgress,
  createFlyState, decodeFlies, fromWire, mix, stream, tableHours, toV3, wireScale,
} from "@fly/net";
import type {
  BallWire, Bite, BubbleSnapshot, FlyState, FoodWire, HappeningWire, Refusal, RoomInfo, SeatedFly, ServerMessage, Spot, TableStart, WireScale,
} from "@fly/net";
import type { FlyPose } from "@fly/contracts";
import type { Company } from "../company.ts";
import { BALL_RADIUS, SWOOP_SECONDS, WORLDS } from "@fly/world";
import type { FoodKind, Vec3, World } from "@fly/world";
import type { Eyes } from "../eyes/eyes.ts";
import type { FlyView } from "../fly-view.ts";
import type { Life } from "../life.ts";
import type { PlaceId } from "../places/catalog.ts";
import { isPlaceId } from "../places/catalog.ts";
import type { Felt, SharedTable } from "../places/types.ts";
import type { Bubbles } from "../scene/bubbles.ts";
import type { Stage } from "../stage.ts";
import { TOOLS } from "../tools/hands.ts";
import type { Hands } from "../tools/hands.ts";
import { TableLine } from "./connection.ts";
import { OtherHand } from "./other-hands.ts";
import type { OtherFlies } from "./others.ts";
import { TablePantry } from "./table-pantry.ts";

/** Bites go to the room this often, ms. */
const BITES_EVERY = 100;
/** A visit the table started more than this long ago (ms) is not started late: it would already be somewhere else. */
const LATE_VISIT = 3000;
/** At the table again after a moment away, this device's fly is put where the table has it only if it is further off than this, mm. */
const PUT_BACK = 1;
/** A count of flies asked for and not answered (the room drops what comes too often) is asked again after this long (ms), twice as long each time, this many times in all. */
const RECOUNT_WAIT = 1000;
const RECOUNT_TRIES = 5;

const LIGHT_TOOL = TOOLS.findIndex((t) => t.id === "light");
const WEATHER_TOOL = TOOLS.findIndex((t) => t.id === "weather");

/** The parts of the game a table reaches into. */
export type TableHost = {
  readonly scene: THREE.Scene;
  readonly stage: Stage;
  /** The fly the player follows: this device's first at the table. */
  readonly life: Life;
  /** The others this device lives, after it in line. */
  readonly company: Company;
  /** Every other fly, as drawn: the table's other players' are kept here. */
  readonly others: OtherFlies;
  readonly hands: Hands;
  readonly fly: FlyView;
  readonly eyes: Eyes;
  readonly bubbles: Bubbles;
  /** How many flies the player keeps (Settings), as many as this device may: how many it asks the table to seat. */
  flies(): number;
  /** The table seats these of this device's flies, in line: the company becomes as many, and each wears its colour. */
  seat(flies: readonly SeatedFly[]): void;
  /** All its flies eat from this pantry from now on. */
  share(pantry: TablePantry): void;
  /** What the place's goings-on left for the fly this frame. */
  readonly felt: Felt;
  /** Where the fly is now. */
  here(): PlaceId;
  /** Being carried between places now: what it sends would be from neither. */
  moving(): boolean;
  /** The table is in another place: carry the fly there. Online.arrived() is called when it is. */
  moveTo(place: PlaceId): void;
  /** The table's light or weather changed: follow it. */
  onWorld(settle: boolean): void;
};

/** What the game tells the table about the player each send. */
export type PlayerNow = { away: boolean; playing: boolean; handsOut: boolean; holding: boolean; eye: Vec3 };

/** Why this device is no longer at the table: it left, or the table turned it away. */
export type Ended = Refusal | "left";

export class Online {
  readonly code: string;
  readonly line: TableLine;
  readonly others: OtherFlies;
  readonly pantry: TablePantry;
  /** What the others' hands do to this fly this frame: a feather's touch, their puffs, their balls coming. */
  stroke = 0;
  readonly air: Vec3 = { x: 0, y: 0, z: 0 };
  readonly looming: Looming[] = [];
  threat: Vec3 | null = null;
  /** This player at the table (its first fly's id), that fly's colour, and who started it (they choose the place, the light and the weather, and can take a device's flies off). */
  id = 0;
  colour = "";
  /** This device's flies at the table, in line, as the table last seated them. */
  mine: readonly SeatedFly[] = [];
  /** How many flies this device last asked the table for and was answered: in its hello, or by `seated`. */
  asked = 0;
  /** A count asked for and not yet answered (0: none), when it was last said (performance ms) and how many times. */
  #asking = 0;
  #askingAt = 0;
  #tries = 0;
  /** A count asked for as many times as it may be, unanswered: not asked again until the player changes it or the line comes back. */
  #unanswered = 0;
  starter = 0;
  epoch = 0;
  place: PlaceId | null = null;
  /** The room's name, whether it is listed and whether it is locked, once welcomed. */
  room: RoomInfo | null = null;
  /** A password was given to get in: if the room turns this device away as locked, it was the wrong one. */
  readonly triedPassword: boolean;
  /** Room time now, ms. */
  now = 0;
  /** The nearest any other player's fly's body came to the followed one's, as drawn here (mm; below 0 they overlapped), since last published. */
  closest = Infinity;
  readonly shared: SharedTable;
  readonly #host: TableHost;
  readonly #world: World;
  readonly #hands = new Map<number, OtherHand>();
  /** The same hands in a list, for going through each frame without making anything. */
  readonly #handList: OtherHand[] = [];
  /** This device's flies' states as they go to the table, in line. */
  readonly #mine: FlyState[] = Array.from({ length: MAX_OWN }, createFlyState);
  readonly #thrown: BallWire = { by: 0, at: 0, from: [0, 0, 0], via: [0, 0, 0], to: [0, 0, 0] };
  #mineFlying = false;
  readonly #othersAt: Vec3[] = [];
  readonly #anchor: Vec3 = { x: 0, y: 0, z: 0 };
  readonly #visits: HappeningWire[] = [];
  readonly #bites: Bite[] = Array.from({ length: MAX_BITES }, () => ({ food: 0, amount: 0 }));
  readonly #scratch = createFlyState();
  /** How this fly's state goes on the wire: the scale of the place it is in (`epoch`'s). */
  #scale: WireScale = TABLETOP_SCALE;
  /** How the others' are read: the scale of the place the table is in (the one this fly is being carried to, during a move). */
  #heardScale: WireScale = TABLETOP_SCALE;
  /** Another fly's state, kept if it is from the place the table is in: read at another place's scale, any other is wrong. */
  readonly #heard = (s: FlyState) => {
    if (s.epoch !== (this.#arrival?.epoch ?? this.epoch)) return;
    // Rounded on the wire, a fly on its feet could come out a hair inside what it stands on, and be drawn on the floor under it.
    s.y += 0.5 / this.#heardScale.position;
    this.others.heard(s, this.now);
  };
  #sentAt = -Infinity;
  #bitesAt = -Infinity;
  #seq = 0;
  #biteSeq = 0;
  #lastRoomNow = 0;
  /** The table's clock: the wall clock at a room time, and the starter's offset from UTC. */
  #clock = { at: 0, wall: 0, offset: 0 };
  /** Welcomed at least once: a later welcome is coming back after the line dropped. */
  #welcomed = false;
  /** Carried to the table's place, and what to do on arrival: where each of this device's flies is to stand (by id; none, where it stands already), and the food there. */
  #arrival: { spots: Map<number, Spot>; foods: FoodWire[]; epoch: number; scale: WireScale; bubbles: BubbleSnapshot | null } | null = null;
  #table: TableBubbles | null = null;
  /** The table's seed, for its bubbles. */
  #seed = 0;
  readonly #burst = (slot: number, cycle: number, at: number) => this.line.send({ type: "pop", slot, cycle, at: at * 1000 });

  /** `password`: a locked room's, said in the hello until the room has welcomed this device (it knows the device after that). */
  constructor(host: TableHost, open: OpenTableSocket, url: string, code: string, key: string, start: TableStart | null, password: string | null = null) {
    this.#host = host;
    this.code = code;
    this.#world = host.life.world;
    this.others = host.others;
    this.pantry = new TablePantry(this.#world);
    host.share(this.pantry);
    this.pantry.onFound = (food) => this.line.send({ type: "found", id: food.id, name: food.name, x: food.x, z: food.z, y: food.y, r: food.r, sweet: food.sweet });
    this.shared = { others: this.#othersAt, anchor: this.#anchor };
    this.triedPassword = !!password;
    let starting = start;
    let opening = password;
    this.line = new TableLine(open, url, () => {
      // Coming back after a moment away, its flies carry on where they are (in the place of the table's epoch they are in); the first time, the table says where they stand.
      const back = this.#welcomed ? { at: this.#lives().map((l) => [l.body.position.x, l.body.position.z, l.body.yaw, l.body.position.y] as Spot), epoch: this.epoch } : {};
      this.asked = host.flies();
      return { type: "hello" as const, v: PROTOCOL, table: code, key, flies: this.asked, ...back, ...(starting ? { start: starting } : {}), ...(opening ? { password: opening } : {}) };
    });
    this.line.onMessage = (m) => {
      if (m.type === "welcome") {
        starting = null;
        opening = null;
      }
      this.#message(m);
    };
    this.line.onFlies = (view) => decodeFlies(view, this.#heardScale, this.#scratch, this.#heard);
  }

  get joined() {
    return this.line.joined && this.id > 0;
  }

  /** This device's flies' lives, in line: the followed one, then its company. */
  #lives(): Life[] {
    return [this.#host.life, ...this.#host.company.list.map((c) => c.life)];
  }

  /**
   * The player wants `n` flies at the table (called each frame): it asks, and
   * is seated as many as there are seats for. One question at a time, the
   * newest count: one the room hasn't answered is asked again, later each
   * time, a few times.
   */
  recount(n: number, now = performance.now()) {
    if (!this.joined) return;
    if (this.#asking) {
      if (now - this.#askingAt < RECOUNT_WAIT * 2 ** (this.#tries - 1)) return;
      if (this.#tries >= RECOUNT_TRIES) {
        this.#unanswered = this.#asking;
        this.#asking = 0;
        this.#tries = 0;
      }
    }
    if (!this.#asking && (n === this.asked || n === this.#unanswered)) return;
    this.#unanswered = 0;
    if (n !== this.#asking) this.#tries = 0;
    this.#asking = n;
    this.#askingAt = now;
    this.#tries++;
    this.line.send({ type: "flies", count: n });
  }

  /** The room has welcomed this device, at least once: it has been at the table, not only on its way. */
  get welcomed() {
    return this.#welcomed;
  }

  /** This player started the table: theirs are the place, the light and the weather. */
  get starting() {
    return this.id > 0 && this.id === this.starter;
  }

  /** Why this device has stopped being at the table, once it has. */
  get ended(): Ended | null {
    return this.line.status === "refused" ? this.line.refusal : null;
  }

  /** The table's clock now: local hours since the epoch where its starter is, or null before the table has said. */
  hours(): number | null {
    return this.#welcomed ? tableHours(this.now, this.#clock.at, this.#clock.wall, this.#clock.offset) : null;
  }

  #roomNow() {
    return this.line.clock.now(performance.now());
  }

  #message(m: ServerMessage) {
    switch (m.type) {
      case "welcome": {
        const back = this.#welcomed;
        this.#welcomed = true;
        this.room = m.room;
        this.id = m.id;
        this.colour = m.colour;
        this.starter = m.starter;
        this.pantry.player = m.id;
        // The hello asked for `asked`, and this answers it: anything asked before the line dropped is asked again from here if it still differs.
        this.#asking = 0;
        this.#tries = 0;
        this.#unanswered = 0;
        this.#seat(m.flies);
        this.#clock = { at: m.now, wall: m.wall, offset: m.offset };
        this.now = this.#roomNow();
        // The room's clock may be a restarted room's, behind the last sends: they are due now, not once it has caught up.
        this.#sentAt = -Infinity;
        this.#bitesAt = -Infinity;
        // Whoever is here now; anyone heard of before is from before the line dropped.
        this.others.forget();
        for (const o of [...this.others.list]) if (!m.players.some((p) => p.id === o.id)) this.#leave(o.id);
        for (const p of m.players) this.#join(p.id, p.colour, p.away, p.of);
        this.#mineFlying = false;
        for (const b of m.balls) this.#hands.get(b.by)?.throw(b);
        this.#visits.length = 0;
        for (const h of m.happenings) this.#visits.push(h);
        this.#takeWorld(m.world.light, m.world.weather, true);
        this.#seed = m.seed;
        // Coming back to the place they are in, each carries on where it stands, if the table has it there.
        const spots = new Map<number, Spot>();
        const lives = this.#lives();
        for (const [i, f] of m.flies.entries()) if (!(back && m.epoch === this.epoch && lives[i] && this.#standsAt(lives[i], f.at))) spots.set(f.id, f.at);
        this.#arrive(m.place, m.epoch, m.foods, spots, m.bubbles);
        return;
      }
      case "seated": {
        this.asked = m.asked;
        if (m.asked === this.#asking) {
          this.#asking = 0;
          this.#tries = 0;
        }
        const known = new Set(this.mine.map((f) => f.id));
        this.#seat(m.flies);
        // The new ones stand where the table set them down: now, or once carried to its place.
        const lives = this.#lives();
        for (const [i, f] of m.flies.entries()) {
          if (known.has(f.id)) continue;
          if (this.#arrival) this.#arrival.spots.set(f.id, f.at);
          else lives[i]?.setDown(f.at[0], f.at[1], f.at[2], f.at[3]);
        }
        return;
      }
      case "joined":
        this.#join(m.id, m.colour, m.away, m.of);
        return;
      case "away": {
        const other = this.others.get(m.id);
        if (other) other.away = m.away;
        return;
      }
      case "left":
        this.#leave(m.id);
        return;
      case "drop":
        if (m.by !== this.id && isFood(m.kind)) this.#hands.get(m.by)?.drop(m.id, m.kind, m.x, m.z, m.y, (this.now - m.at) / 1000);
        return;
      case "found":
        this.pantry.mirror.add(fromWire(this.#world, m.food));
        return;
      case "ball":
        this.#hands.get(m.by)?.throw(m);
        return;
      case "world":
        this.#clock.offset = m.offset;
        this.#takeWorld(m.light, m.weather, false);
        return;
      case "place":
        this.others.forget();
        for (const hand of this.#handList) hand.clear();
        this.#mineFlying = false;
        this.#visits.length = 0;
        this.#arrive(m.place, m.epoch, m.foods, new Map(this.mine.filter((f) => m.spots[f.id]).map((f) => [f.id, m.spots[f.id]])), null);
        return;
      case "happening":
        this.#visits.push(m);
        return;
      case "pop":
        this.#table?.pop(m.slot, m.cycle, m.at / 1000);
        return;
      case "food":
        this.pantry.mirror.apply(m.ack, m.amounts, m.gone, m.eaten);
        return;
    }
  }

  /** This device's flies are these at the table, in line: the company follows, each in its colour. */
  #seat(flies: readonly SeatedFly[]) {
    if (flies.length === 0) return;
    this.mine = flies;
    this.#host.seat(flies);
  }

  /** Whether a fly is where the table has it already: there, on the same surface (not the floor under the table it is on). */
  #standsAt(life: Life, spot: Spot) {
    const p = life.body.position;
    if (Math.hypot(spot[0] - p.x, spot[1] - p.z) > PUT_BACK) return false;
    return spot[3] === undefined || Math.abs(this.#world.heightAt(p.x, p.z, p.y) - spot[3]) <= PUT_BACK;
  }

  /** The table is in `place` (in its `epoch`'th): there already, the food and the spot are taken now; elsewhere, once carried there. */
  #arrive(place: string, epoch: number, foods: FoodWire[], spots: Map<number, Spot>, bubbles: BubbleSnapshot | null) {
    if (!isPlaceId(place)) return;
    this.place = place;
    const scale = wireScale(WORLDS[place]);
    this.#heardScale = scale;
    this.#arrival = { spots, foods, epoch, scale, bubbles };
    if (this.#host.here() === place && !this.#host.moving()) this.arrived();
    else this.#host.moveTo(place);
  }

  /** The flies are in the table's place: each stands where the table says, among the table's food. */
  arrived() {
    const arrival = this.#arrival;
    if (!arrival) return;
    this.#arrival = null;
    this.epoch = arrival.epoch;
    this.#scale = arrival.scale;
    this.pantry.mirror.welcome(arrival.foods);
    const lives = this.#lives();
    for (const [i, f] of this.mine.entries()) {
      const spot = arrival.spots.get(f.id);
      if (spot && lives[i]) lives[i].setDown(spot[0], spot[1], spot[2], spot[3]);
    }
    // Only the picnic has bubbles: the table's, from its seed and the place's count.
    const bubbles = this.#host.bubbles;
    this.#table = this.place === "picnic" ? new TableBubbles(mix(this.#seed, this.epoch), this.#world, TABLE_BUBBLES) : null;
    if (this.#table && arrival.bubbles) this.#table.restore(arrival.bubbles);
    bubbles.table = this.#table ? { bubbles: this.#table, time: this.now / 1000, burst: this.#burst } : null;
  }

  /** Another player's fly is at the table (`of`: whose, by their first fly, whose state carries their hand). */
  #join(id: number, colour: string, away: boolean, of: number) {
    if (of === this.id || this.mine.some((f) => f.id === id)) return;
    this.others.join(id, colour, away, of);
    if (id !== of || this.#hands.has(id)) return;
    const hand = new OtherHand(this.#host.scene, this.#world, id, colour, this.pantry);
    for (const object of hand.view.seen) this.#host.eyes.see(object);
    this.#hands.set(id, hand);
    this.#handList.push(hand);
  }

  #leave(id: number) {
    this.others.leave(id);
    // Their first fly leaves only with their device: so does their hand.
    const hand = this.#hands.get(id);
    if (!hand) return;
    hand.dispose();
    this.#hands.delete(id);
    this.#handList.splice(this.#handList.indexOf(hand), 1);
  }

  /** The table's light and weather: shown on the Light and Weather tools, and followed. */
  #takeWorld(light: string, weather: string, settle: boolean) {
    const hands = this.#host.hands;
    const l = TOOLS[LIGHT_TOOL].variants.findIndex((v) => v.id === light);
    const w = TOOLS[WEATHER_TOOL].variants.findIndex((v) => v.id === weather);
    if (l >= 0) hands.variants[LIGHT_TOOL] = l;
    if (w >= 0) hands.variants[WEATHER_TOOL] = w;
    this.#host.onWorld(settle);
  }

  /** The starter chose a light or a weather: it is the table's. */
  chooseWorld(light: string, weather: string) {
    if (this.starting) this.line.send({ type: "world", light, weather });
  }

  /** The starter chose a place: the whole table goes, when the table says so. */
  choosePlace(place: PlaceId) {
    if (this.starting) this.line.send({ type: "place", place });
  }

  /** The starter takes another player's device off the table, by any of its flies: all of them go. */
  remove(id: number) {
    if (this.starting && !this.mine.some((f) => f.id === id)) this.line.send({ type: "remove", id });
  }

  /** Before this fly lives its frame: the line, the others where they were a moment ago, and what their hands do to it. */
  update(dt: number, camera: THREE.PerspectiveCamera, time: number, floorAt: (x: number, z: number, below: number) => number) {
    this.line.update(dt);
    const roomNow = this.#roomNow();
    const prev = this.#lastRoomNow || roomNow;
    this.#lastRoomNow = roomNow;
    this.now = roomNow;
    const { life, company } = this.#host;
    this.#localTools(roomNow);

    // The other players' flies, for visitors to keep clear of, and the one visits are planned round (the lowest id, the same on every device).
    this.#othersAt.length = 0;
    let anchorId = this.mine[0]?.id || 255;
    const a = this.#anchor;
    const mine = life.body.position;
    a.x = mine.x;
    a.y = mine.y;
    a.z = mine.z;
    for (let i = 0; i < company.list.length; i++) {
      const c = company.list[i];
      const p = c.life.body.position;
      if (c.id > 0 && c.id < anchorId) {
        anchorId = c.id;
        a.x = p.x;
        a.y = p.y;
        a.z = p.z;
      }
    }
    const list = this.others.list;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (!o.present) continue;
      this.#othersAt.push(o.position);
      if (o.id < anchorId) {
        anchorId = o.id;
        a.x = o.position.x;
        a.y = o.position.y;
        a.z = o.position.z;
      }
      if (Math.abs(o.position.y - mine.y) < BODY_RADIUS * 2) this.closest = Math.min(this.closest, bodyGap(mine, life.body.yaw, o.position, o.state.yaw));
    }

    // Their hands on this fly: a feather resting on it or stroking it, a puff, a ball coming.
    this.stroke = 0;
    this.air.x = this.air.y = this.air.z = 0;
    this.looming.length = 0;
    this.threat = null;
    let threatAt = Infinity;
    for (let i = 0; i < this.#handList.length; i++) {
      const hand = this.#handList[i];
      const other = this.others.get(hand.player);
      const newest = other?.present ? other.track.newest : null;
      if (newest) hand.heard(newest);
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
      // Every device bursts the table's bubbles a thrown ball meets, from its path: they agree without saying so.
      const wire = hand.ball;
      if (wire && this.#table && ballProgress(wire, roomNow) > 0) this.#table.hitBy(Math.max(wire.at, prev) / 1000, roomNow / 1000, BALL_RADIUS, wire);
    }

    const table = this.#table;
    if (table) {
      table.rain = this.#host.stage.weather.rain;
      if (this.#mineFlying) {
        if (ballProgress(this.#thrown, roomNow) >= 1) this.#mineFlying = false;
        else if (ballProgress(this.#thrown, roomNow) > 0) table.hitBy(Math.max(this.#thrown.at, prev) / 1000, roomNow / 1000, BALL_RADIUS, this.#thrown);
      }
      table.update(roomNow / 1000);
      if (this.#host.bubbles.table) this.#host.bubbles.table.time = roomNow / 1000;
    }

    // Visits the table has started, each from its own stream.
    const set = this.#host.stage.set;
    for (let i = this.#visits.length - 1; i >= 0; i--) {
      const v = this.#visits[i];
      if (roomNow < v.at || this.#arrival) continue;
      this.#visits.splice(i, 1);
      if (roomNow - v.at < LATE_VISIT) set.happen?.(v.kind, stream(mix(v.seed)));
    }
  }

  /**
   * What the other players' hands do this frame to one of this device's
   * other flies: their feather on it (returned) and their puffs' air at it,
   * added to `air`.
   */
  reach(fly: { readonly position: Vec3; readonly onFeet: boolean }, air: Vec3): number {
    let stroke = 0;
    for (let i = 0; i < this.#handList.length; i++) stroke = Math.max(stroke, this.#handList[i].hands.reach(fly, air));
    return stroke;
  }

  /** This player threw the ball or dropped food just now: the table hears of it, and the throw waits for its moment. */
  #localTools(roomNow: number) {
    const hands = this.#host.hands;
    const ev = hands.events;
    if (!this.joined) return;
    if (ev.swooped) {
      // Long enough for the others to hear of it before it dives: about a round trip.
      const lead = Math.min(600, Math.max(LEAD, this.line.clock.rtt * 1.5));
      const ball = hands.ball;
      ball.t = -lead / (SWOOP_SECONDS * 1000);
      const mine = this.#thrown;
      mine.by = this.id;
      mine.at = roomNow + lead;
      toV3(mine.from, ball.from);
      toV3(mine.via, ball.via);
      toV3(mine.to, ball.to);
      this.#mineFlying = true;
      this.line.send({ type: "ball", at: mine.at, from: mine.from, via: mine.via, to: mine.to });
    }
    if (ev.dropped) {
      const f = hands.falling[hands.falling.length - 1];
      if (f) this.line.send({ type: "drop", id: this.pantry.name(f.kind), kind: f.kind, x: f.x, z: f.z, y: f.floor, at: roomNow });
    }
  }

  /** After its flies have lived their frame and been posed: tells the table, when due. */
  send(player: PlayerNow) {
    if (!this.joined || this.#arrival || this.#host.moving()) return;
    const now = this.now;
    if (now - this.#sentAt >= SEND_EVERY - 4) {
      this.#sentAt = now;
      this.line.sendFlies(this.#scale, this.#mine, this.#states(player, now));
    }
    if (now - this.#bitesAt >= BITES_EVERY) {
      this.#bitesAt = now;
      const mirror = this.pantry.mirror;
      let n = 0;
      for (const [food, amount] of mirror.unsent) {
        if (n >= this.#bites.length) break;
        this.#bites[n].food = food;
        this.#bites[n].amount = amount;
        n++;
      }
      if (n > 0) {
        const seq = ++this.#biteSeq & 0xffff;
        this.line.sendBites(seq, this.#bites, n);
        mirror.sent(seq);
      }
    }
  }

  /** Said at once when the page is hidden, while it still can be: the fly stops living until it is back. */
  away(player: PlayerNow) {
    if (!this.joined) return;
    player.away = true;
    this.line.sendFlies(this.#scale, this.#mine, this.#states(player, this.#roomNow()));
  }

  /** The page is back: the line comes back now if it dropped meanwhile. */
  wake() {
    this.line.hurry();
  }

  /** Each of this device's flies the table has seated, as it is now, into `#mine`: how many. The first carries the player's hand. */
  #states(player: PlayerNow, now: number): number {
    const { life, fly, company, hands } = this.#host;
    const seq = ++this.#seq & 0xffff;
    const playing = (player.away ? AWAY : 0) | (player.playing ? PLAYING : 0);
    let n = 0;
    const mine = this.mine;
    for (let i = 0; i < mine.length; i++) {
      const f = mine[i];
      const c = n === 0 ? null : company.list[n - 1];
      if (n > 0 && (!c || c.id !== f.id)) break;
      const s = this.#mine[n];
      writeState(s, f.id, c?.life ?? life, c?.pose ?? fly.pose, seq, now, this.epoch, playing);
      if (n === 0) {
        s.flags |= (player.handsOut ? HANDS : 0) | (player.holding ? HOLDING : 0);
        const h = s.hand;
        h.x = hands.pointer.x;
        h.y = hands.pointer.y;
        h.z = hands.pointer.z;
        h.eyeX = player.eye.x;
        h.eyeY = player.eye.y;
        h.eyeZ = player.eye.z;
        h.tool = hands.tool;
        h.variant = hands.variants[hands.tool];
      }
      if (++n >= MAX_OWN) break;
    }
    return n;
  }

  /** Leaves the table for good. */
  leave() {
    this.line.leave();
  }

  /** Takes everything of the table out of the world: this device is alone again. */
  dispose() {
    for (const hand of this.#handList) hand.dispose();
    this.#hands.clear();
    this.#handList.length = 0;
    this.others.clear();
    this.#host.bubbles.table = null;
  }

  /** The table as this device has it, on the canvas for scripts to compare between devices. */
  publish(d: DOMStringMap) {
    const line = this.line;
    d.online = line.status;
    d.player = String(this.id);
    d.starter = String(this.starter);
    d.colour = this.colour;
    d.mine = this.mine.map((f) => `${f.id}:${f.colour}`).join(";");
    d.asked = String(this.asked);
    d.epoch = String(this.epoch);
    d.roomTime = this.now.toFixed(0);
    d.rtt = line.clock.rtt.toFixed(1);
    d.reconnects = String(line.reconnects);
    d.netIn = String(line.bytesIn);
    d.netOut = String(line.bytesOut);
    d.others = this.others.list
      .map((o) => `${o.id}:${o.present ? 1 : 0}:${o.resting ? 1 : 0}:${o.near ? 1 : 0}:${o.position.x.toFixed(2)},${o.position.z.toFixed(2)}:${o.track.delay.toFixed(0)}:${o.of}`)
      .join(";");
    d.closest = Number.isFinite(this.closest) ? this.closest.toFixed(2) : "";
    this.closest = Infinity;
    const mirror = this.pantry.mirror;
    d.predicted = mirror.predicted.toFixed(4);
    d.granted = mirror.granted.toFixed(4);
    d.tableFoods = this.pantry.foods.map((f) => `${f.id}:${f.amount.toFixed(3)}`).join(";");
  }

  /** Takes what publish() wrote off the canvas: alone again, nothing of the table may still be read there. */
  static unpublish(d: DOMStringMap) {
    for (const key of ["online", "player", "starter", "colour", "mine", "asked", "epoch", "roomTime", "rtt", "reconnects", "netIn", "netOut", "others", "closest", "predicted", "granted", "tableFoods"]) delete d[key];
  }
}

/** One fly's state as it goes to the table: where it is and how it is posed, with the player's flags (away, playing); no hand. */
function writeState(s: FlyState, id: number, life: Life, p: FlyPose, seq: number, now: number, epoch: number, player: number) {
  const body = life.body;
  s.id = id;
  s.seq = seq;
  s.t = now;
  s.epoch = epoch;
  s.flags = (body.mode === "airborne" ? AIRBORNE : 0) | (life.eating ? EATING : 0) | player;
  s.x = body.position.x;
  s.y = body.position.y;
  s.z = body.position.z;
  s.yaw = body.yaw;
  s.upX = body.up.x;
  s.upZ = body.up.z;
  s.vx = body.velocity.x;
  s.vy = body.velocity.y;
  s.vz = body.velocity.z;
  const q = s.pose;
  q.speed = p.speed;
  q.turn = p.turn;
  q.wings = p.wings;
  q.groom = p.groom;
  q.feed = p.feed;
  q.crouch = p.crouch;
  q.pitch = p.pitch;
  q.roll = p.roll;
}

const isFood = (kind: string): kind is FoodKind => kind === "sugar" || kind === "honey" || kind === "berry" || kind === "water";
const scratchClosest = { ax: 0, az: 0, bx: 0, bz: 0 };

/** The gap between two flies' bodies as capsules (mm; below 0 they overlap). */
function bodyGap(p: Vec3, yaw: number, q: Vec3, qyaw: number) {
  const h = BODY_HALF;
  const d = segmentToSegment(
    p.x - Math.sin(yaw) * h, p.z - Math.cos(yaw) * h, p.x + Math.sin(yaw) * h, p.z + Math.cos(yaw) * h,
    q.x - Math.sin(qyaw) * h, q.z - Math.cos(qyaw) * h, q.x + Math.sin(qyaw) * h, q.z + Math.cos(qyaw) * h, scratchClosest,
  );
  return d - BODY_RADIUS * 2;
}
