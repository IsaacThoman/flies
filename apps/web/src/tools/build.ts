// The Build tool: pieces of the kit (packages/world/src/kit.ts) set down,
// turned and taken away in the place the fly lives in, and kept there between
// launches. A piece set down is part of the world the fly's body meets, its
// eyes see and the camera keeps out of; this keeps the place's pieces, puts
// them into the world, and says where the next one would go. How they look is
// scene/kit.ts.
//
// Builds are the player's own and stay on the device: at a table with others
// every fly has to meet the same world, so there the place is as it is made,
// and the pieces come back when the fly is alone again (docs/online.md).

import { BUILD_GRID, MAX_PIECES, World, covers, fits, isPieceKind, keepPieces, keptPieces, pieceAt, restingHeight, snap, withPieces } from "@fly/world";
import type { Piece, PieceKind, Place, Vec3 } from "@fly/world";
import { loadBuilds, saveBuilds } from "../settings.ts";

/** What the Build tool can do besides setting a piece down. */
export type BuildAction = PieceKind | "turn" | "remove" | "clear";
/** How near (mm) the hand must be to a piece to turn it or take it away. */
const TARGET_REACH = 1.5;
/** Following the fly, a piece that doesn't fit just in front of it goes this much further out (mm) at a time, this far at most. */
const NUDGE = BUILD_GRID;
const NUDGES = 10;

type Flies = readonly Readonly<Vec3>[];
type Foods = readonly { x: number; y: number; z: number; r: number }[];

/** Where the next piece would go, or which piece the hand is on, as the view shows it. */
export type Aim = {
  /** A piece to set down (and where), one already down to turn or take away (`target`), or nothing. */
  readonly piece: Piece;
  showing: "piece" | "target" | "none";
  /** It can go there now, or be turned or taken away. */
  ok: boolean;
  /** The piece the hand is on, or -1. */
  target: number;
};

export class Builder {
  /** This place's pieces, in the order they were set down. */
  pieces: Piece[] = [];
  /** The place's own world, without the pieces: where one may go is judged against it alone, since none rests on another. */
  readonly base: World;
  /** Built pieces are in the world: alone, not at a table. */
  active = true;
  /** Counts each change to what is in the world, for the view to build it again. */
  version = 0;
  /** What else in the world a piece must keep out of, besides the place, the other pieces, the flies and their food: the player's fingertip (tools/finger.ts). */
  keepOut: (piece: Piece) => boolean = () => false;
  /** The way new pieces are set down, in eighths of a turn: the way the last was turned. */
  turns = 0;
  readonly aim: Aim = { piece: { kind: "tile-blue", x: 0, z: 0, turns: 0, y: 0 }, showing: "none", ok: false, target: -1 };
  readonly #world: World;
  #place: Place;
  #id = "";
  readonly #saved: Record<string, unknown>;
  readonly #save: (builds: Record<string, unknown>) => void;
  /** What the aim was last worked out for: a piece's place is looked for again only when the hand has moved a grid step, or the pieces have changed. */
  readonly #aimFor = { kind: "", x: NaN, z: NaN, y: NaN, turns: -1, version: -1, following: false };
  readonly #found: Piece = { kind: "tile-blue", x: 0, z: 0, turns: 0, y: 0 };
  #foundOk = false;

  /** `world`: the game's one world, which the pieces go into; `saved`, every place's pieces as kept, and where they are kept again. */
  constructor(world: World, saved: Record<string, unknown> = loadBuilds(), save: (builds: Record<string, unknown>) => void = saveBuilds) {
    this.#world = world;
    this.#place = world.place;
    this.base = new World(world.place);
    this.#saved = saved;
    this.#save = save;
  }

  /** The fly is in this place now (built behind the veil, or at launch): its pieces, as kept. */
  enter(id: string, place: Place) {
    this.#id = id;
    this.#place = place;
    this.base.load(place);
    this.pieces = keptPieces(this.#saved[id], this.base);
    this.#apply();
  }

  /** Whether the pieces are in the world (alone) or put away (at a table). */
  setActive(active: boolean) {
    if (active === this.active) return;
    this.active = active;
    this.#apply();
  }

  /**
   * Works out what the tool in hand would do where the hand is (`at`, on the
   * surface there), for the view to show and for `use` to do: where a piece
   * would go (following the fly, just in front of it where there is room, out
   * from `fly`), or which piece the hand is on.
   */
  point(action: BuildAction, at: Readonly<Vec3>, following: boolean, fly: Readonly<Vec3>, flies: Flies, foods: Foods): Aim {
    const aim = this.aim;
    aim.target = -1;
    if (!this.active) {
      aim.showing = "none";
      aim.ok = false;
      return aim;
    }
    if (action === "clear") {
      aim.showing = "none";
      aim.ok = this.pieces.length > 0;
      return aim;
    }
    if (action === "turn" || action === "remove") {
      aim.target = pieceAt(this.pieces, at.x, at.y, at.z, TARGET_REACH);
      aim.showing = aim.target >= 0 ? "target" : "none";
      aim.ok = aim.target >= 0;
      if (aim.target >= 0) copy(aim.piece, this.pieces[aim.target]);
      return aim;
    }
    const was = this.#aimFor;
    const x = snap(at.x);
    const z = snap(at.z);
    if (was.kind !== action || was.x !== x || was.z !== z || Math.abs(was.y - at.y) > 0.01 || was.turns !== this.turns || was.version !== this.version || was.following !== following) {
      was.kind = action;
      was.x = x;
      was.z = z;
      was.y = at.y;
      was.turns = this.turns;
      was.version = this.version;
      was.following = following;
      this.#foundOk = this.#find(action, at, following, fly, flies, foods);
    }
    copy(aim.piece, this.#found);
    aim.showing = "piece";
    // Flies and food move: whether it covers them now is asked every time.
    aim.ok = this.#foundOk && this.pieces.length < MAX_PIECES && !covers(aim.piece, flies, this.#place.start, foods) && !this.keepOut(aim.piece);
    return aim;
  }

  /** Where a piece of this kind goes for the hand at `at`: true if it fits there. */
  #find(kind: PieceKind, at: Readonly<Vec3>, following: boolean, fly: Readonly<Vec3>, flies: Flies, foods: Foods): boolean {
    this.#found.kind = kind;
    this.#found.turns = this.turns;
    if (this.#tryAt(at.x, at.z, at.y, flies, foods)) return true;
    if (!following) return false;
    // Following the fly, the hand is just in front of it: the piece goes on out that way until it has room.
    const dx = at.x - fly.x;
    const dz = at.z - fly.z;
    const d = Math.hypot(dx, dz) || 1;
    for (let k = 1; k <= NUDGES; k++) if (this.#tryAt(at.x + (dx / d) * NUDGE * k, at.z + (dz / d) * NUDGE * k, at.y, flies, foods)) return true;
    return this.#tryAt(at.x, at.z, at.y, flies, foods);
  }

  /** Puts the piece being looked for at (x, z), on the place's surface there at or a little above `y`: whether it fits. */
  #tryAt(x: number, z: number, y: number, flies: Flies, foods: Foods): boolean {
    const found = this.#found;
    found.x = snap(x);
    found.z = snap(z);
    const rest = restingHeight(this.base, found.x, found.z, y + 0.3);
    found.y = rest ?? y;
    return rest !== null && fits(this.base, this.pieces, found) && !covers(found, flies, this.#place.start, foods) && !this.keepOut(found);
  }

  /** Does what `point` last found: sets the piece down, turns it, takes it away, or clears them all. Whether it did. */
  use(action: BuildAction, flies: Flies, foods: Foods): boolean {
    const aim = this.aim;
    if (!this.active || !aim.ok) return false;
    if (action === "clear") this.pieces = [];
    else if (action === "remove") this.pieces.splice(aim.target, 1);
    else if (action === "turn") {
      const piece = this.pieces[aim.target];
      const turned: Piece = { ...piece };
      // The next way round it fits, an eighth of a turn at a time.
      let found = false;
      for (let k = 1; k < 8 && !found; k++) {
        turned.turns = (piece.turns + k) % 8;
        found = fits(this.base, this.pieces, turned, aim.target) && !covers(turned, flies, this.#place.start, foods) && !this.keepOut(turned);
      }
      if (!found) return false;
      this.pieces[aim.target] = turned;
      this.turns = turned.turns;
    } else this.pieces.push({ ...aim.piece });
    this.#apply();
    this.#keep();
    return true;
  }

  #apply() {
    this.#world.load(this.active ? withPieces(this.#place, this.pieces) : this.#place);
    this.version++;
  }

  #keep() {
    this.#saved[this.#id] = keepPieces(this.pieces);
    this.#save(this.#saved);
  }
}

/** The Build tool's kind, as what it does. */
export function buildAction(variant: string): BuildAction | null {
  return isPieceKind(variant) || variant === "turn" || variant === "remove" || variant === "clear" ? variant : null;
}

function copy(to: Piece, from: Readonly<Piece>) {
  to.kind = from.kind;
  to.x = from.x;
  to.z = from.z;
  to.turns = from.turns;
  to.y = from.y;
}
