// What each vertex in the restaurant is made of. Everything solid is one
// material and everything clear another (materials.ts); each vertex carries
// its kind, and the shader gives it its look. A far stand-in's vertices also
// carry the area they stand in for (areas.ts): kind + AREA_STRIDE × area, so
// the vertex shader can fold away the stand-ins of areas drawn in detail.
// The kinds here are the room's and those shared by its parts; each part of
// the room (parts.ts) has a range of its own for kinds only it shades.

export const KIND = {
  plain: 0,
  /** The penny-round floor: white and black glazed rounds in grout. */
  tile: 1,
  /** White marble table tops: veined, polished, ringed. */
  marble: 2,
  /** The four-tops' oak: grain, wear at the edges. */
  oak: 3,
  /** Cast iron: table bases, stool feet. */
  iron: 4,
  /** Black-lacquered bentwood beech: the chairs. */
  bentwood: 5,
  /** The chairs' woven cane seats. */
  cane: 6,
  /** The bar's hammered zinc. */
  zinc: 7,
  brass: 8,
  /** Varnished dark wood: the bar's front, the back bar, the wainscot, the shop front inside. */
  mahogany: 9,
  /** Old mirror glass, the silvering foxed. */
  mirror: 10,
  /** The upper walls' painted plaster. */
  plaster: 11,
  /** The pressed-tin ceiling. */
  tin: 12,
  /** The banquette's buttoned leather. */
  leather: 13,
  /** The chalkboard: slate, wiped and written over. */
  chalk: 14,
  /** The framed print's picture. */
  print: 15,
  /** Brushed stainless steel: the pass, the heat lamps, caps. */
  steel: 16,
  /** Glazed white china: plates, cups, saucers. */
  ceramic: 17,
  /** Paper and card: menus, the sugar packet, tickets, the book. */
  paper: 18,
  bread: 19,
  /** Sugar: grains, the caddy's heap. */
  sugar: 20,
  /** Citrus and stone fruit: peel dimpled with oil glands, a peach's fuzz. */
  fruit: 21,
  wax: 22,
  /** A lamp's glowing parts: the lit pendant's diffuser, bulbs. */
  lamp: 23,
  /** The drinks fridge's lit inside, seen through its glass doors. */
  fridge: 24,
  /** The exit sign's face: a running figure and a door, lit green. */
  exit: 25,
  linen: 26,
  /** The pendants' enamel shades. */
  enamel: 27,
  /** Bottle labels: blocks of colour. */
  label: 28,
  /** The bar mat's rubber. */
  rubber: 29,
  crumb: 30,
  cake: 31,
  /** The shop front's openings as the fly's eyes see them: bright, and drawn for them only. */
  opening: 32,
  /** Painted timber: the shop front's frames, the doors. */
  paint: 33,
  /** Glossy plastic and lacquer. */
  glossy: 34,
  matte: 35,
  /** Petals and leaves. */
  flower: 36,
  /** The kitchen beyond the pass: dim tiles and steel. */
  kitchen: 37,
  /** Opaque bottle glass far away: dark, with a glint. */
  bottleFar: 38,
  /** A squashed grape on the floor. */
  grape: 39,
  /** The clock's face: an enamel dial with its marks and hands, telling the real time. */
  dial: 40,
  /** Clear glass: wine glasses, shakers, the vase, the cloche, the caddy. */
  glass: 96,
  /** Red wine and white, left in the glasses. */
  wine: 97,
  whiteWine: 98,
  /** Water in the vase and the carafe. */
  water: 99,
  /** A thin spilt film: soda, coulis, syrup. */
  film: 100,
  /** Coloured bottle glass with what is in it. */
  bottle: 101,
  /** The fridge doors' glass. */
  fridgeGlass: 102,
} as const;

/** Clear kinds start here (they belong to the clear material). */
export const CLEAR = 96;
/** A vertex's kind attribute is its kind plus this times its area. */
export const AREA_STRIDE = 128;

/**
 * Each part's own kinds, opaque and clear: a part names its kinds in its own
 * file as these numbers and shades them in its own GLSL (parts.ts).
 */
export const PART_KINDS = {
  tables: { solid: [56, 63], clear: [104, 107] },
  tabletop: { solid: [64, 71], clear: [108, 111] },
  counter: { solid: [72, 79], clear: [112, 115] },
  backbar: { solid: [80, 87], clear: [116, 119] },
  rest: { solid: [88, 95], clear: [120, 127] },
} as const;

/** The kinds as GLSL constants (K_TILE, ...). */
export const KINDS_GLSL = Object.entries(KIND)
  .map(([name, value]) => `const int K_${name.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()} = ${value};`)
  .join("\n");
