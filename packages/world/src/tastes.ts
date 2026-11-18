// How each food tastes to a fly, worked out from what it is made of, one way
// for every food: what 100 g of it holds (USDA FoodData Central, "FDC" and the
// entry's ID, unless said otherwise), its sugars and caffeine dissolved in its
// own water, and that solution's strength turned into how hard the fly's taste
// neurons answer it, from recordings of those neurons. docs/world.md (Food)
// has the table and what it leaves out.
//
// `sweet`, `bitter` and `water` (0 to 1) each drive their taste neurons at that
// fraction of the brain's maximum rate (packages/brain/README.md, Senses), so
// each is a neuron's measured answer as a fraction of the most it answered.
//
// The solution at a food's surface: a fly tastes what is dissolved, with
// sensilla at the tips of its labellum and tarsi, so each food is its sugars
// dissolved in the water it holds, by FDC's water and sugars. Where it holds
// too little water to dissolve them (sugar, honey, sweets, dried juice), its
// surface is a saturated solution, as a fly's saliva on dry sugar makes one;
// past 1 M of sugar every sugar's answer has flattened (below), so how much
// more doesn't change anything here.

/** What 100 g of a food holds, g (caffeine, mg). */
export type Contents = {
  water: number;
  sucrose?: number;
  glucose?: number;
  fructose?: number;
  /** Sugars no recording here was made with: they thin the water (water taste) but drive nothing sweet. */
  maltose?: number;
  galactose?: number;
  lactose?: number;
  caffeine?: number;
};

export type Tastes = { sweet: number; water: number; bitter: number };

const SUGARS = ["sucrose", "glucose", "fructose", "maltose", "galactose", "lactose"] as const;
type Sugar = (typeof SUGARS)[number];
/** g/mol. */
const MOLAR_MASS: Record<Sugar | "caffeine", number> = { sucrose: 342.3, glucose: 180.16, fructose: 180.16, maltose: 342.3, galactose: 180.16, lactose: 342.3, caffeine: 194.19 };
/** Sucrose dissolves to about 2 g in a gram of water at room temperature: a food with more sugar than that is a saturated solution at its surface. */
const SOLUBLE = 2;
/** Dissolved sugar takes up about 0.63 ml a gram (sucrose's partial specific volume; glucose's and fructose's are within 0.02): the solution is the water and this. */
const SUGAR_VOLUME = 0.63;

/**
 * The labellum's L-type taste sensilla's sugar neuron, spikes/s, at 10, 30,
 * 100, 300 and 1000 mM: Hiroi, Marion-Poll & Tanimura 2002, Zool Sci 19:1009,
 * Figure 6A to C, read off the figure (to about 2 spikes/s). The one study to
 * record sucrose, glucose and fructose from the same sensilla the same way
 * across that range. None falls off by 1 M, so above it each holds there.
 */
export const SUGAR_SPIKES = {
  mM: [10, 30, 100, 300, 1000],
  sucrose: [25, 47.5, 69, 75, 82],
  glucose: [7, 21, 47, 81.5, 84],
  fructose: [9, 17.5, 42, 50.5, 61],
} as const;
/** The most any sugar drove it to: `sweet` 1. */
const SUGAR_MOST = 84;
type Swept = "sucrose" | "glucose" | "fructose";
const SWEPT: readonly Swept[] = ["sucrose", "glucose", "fructose"];

/**
 * Caffeine's answer from the bitter neurons, spikes/s, at 1, 3 and 10 mM:
 * the I8 sensillum's, Dweck, Sang & Carlson 2021, eLife 10:e64317, Figure 4,
 * figure supplement 1, read off the figure; the only series across
 * concentrations found. `bitter` 1 is 10 mM, an espresso's caffeine (pantry.ts).
 * Below 1 mM the threshold lies between 0.1 and 1 mM for most bitter compounds
 * and sensilla (Weiss et al. 2011, Neuron 69:258), so what an answer there
 * would be isn't known, and none is assumed; above 10 mM none was recorded,
 * and it holds at 1.
 */
export const CAFFEINE_SPIKES = { mM: [1, 3, 10], spikes: [29, 32, 43] } as const;

/**
 * The water-sensing neurons' answer (ppk28; calcium, peak ΔF/F, %) to water
 * and to sucrose in it at 0.2, 0.5 and 1 M: Cameron et al. 2010, Nature
 * 465:91, Figure 1e, read off the figure. Up to 0.2 M of sugar they answer
 * as to water; by 0.5 M a third as much. Past 1 M of sugar nothing was
 * recorded, and the answer is taken as none, as a concentrated food's has
 * been here all along: in the same figure 1 M of salt, about 2 osmolar,
 * takes it to a sixth, and a polyethylene glycol solution to nothing.
 */
export const WATER_SIGNAL = { molar: [0, 0.2, 0.5, 1], signal: [13.3, 14.8, 5, 4.5] } as const;

/** Linear between points, on a log scale of concentration. */
function onLog(xs: readonly number[], ys: readonly number[], x: number): number {
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let i = 0;
  while (x > xs[i + 1]) i++;
  const t = Math.log(x / xs[i]) / Math.log(xs[i + 1] / xs[i]);
  return ys[i] + t * (ys[i + 1] - ys[i]);
}

/**
 * How much of a sugar alone gives `spikes`, mM: its recordings read backwards,
 * on a log scale of concentration between them and straight down to none at
 * none below 10 mM (not recorded); Infinity past the most it gives, which it
 * holds above 1 M. Each sugar's answer only rises.
 */
function sugarFor(sugar: Swept, spikes: number): number {
  const xs = SUGAR_SPIKES.mM;
  const ys = SUGAR_SPIKES[sugar];
  if (spikes >= ys[ys.length - 1]) return Infinity;
  if (spikes < ys[0]) return (xs[0] * spikes) / ys[0];
  let i = 0;
  while (spikes >= ys[i + 1]) i++;
  return xs[i] * (xs[i + 1] / xs[i]) ** ((spikes - ys[i]) / (ys[i + 1] - ys[i]));
}

/**
 * The sugar neuron's answer to a mixture of sugars, spikes/s. Mixtures drive
 * one neuron (Dahanukar et al. 2007, Neuron 56:503, all spikes one size), but
 * how its answers to each add hasn't been recorded; each is taken to stand in
 * for as much of another as gives the same answer (concentration addition,
 * the usual null model for agonists of one cell): the answer R where
 * Σ cᵢ / Cᵢ(R) = 1, Cᵢ(R) being how much of sugar i alone gives R.
 */
export function mixtureSpikes(mM: Partial<Record<Swept, number>>): number {
  const present = SWEPT.filter((s) => (mM[s] ?? 0) > 0);
  if (!present.length) return 0;
  let lo = 0;
  let hi = Math.max(...present.map((s) => SUGAR_SPIKES[s][SUGAR_SPIKES[s].length - 1]));
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const share = present.reduce((sum, s) => sum + (mM[s] ?? 0) / sugarFor(s, mid), 0);
    if (share > 1) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The solution at a food's surface: each sugar's and caffeine's concentration, mM, and all its sugar's, M. */
export function solution(c: Contents): { mM: Record<Sugar | "caffeine", number>; sugar: number } {
  const grams = SUGARS.reduce((sum, s) => sum + (c[s] ?? 0), 0);
  // A dried food's film is whatever water saturates its sugar.
  const water = c.water > 0 ? c.water : grams / SOLUBLE;
  // Too little water for its sugar: the sugar it can dissolve, the rest still solid.
  const dissolved = Math.min(1, (water * SOLUBLE) / Math.max(grams, 1e-9));
  const litres = (water + grams * dissolved * SUGAR_VOLUME) / 1000;
  const mM = {} as Record<Sugar | "caffeine", number>;
  let sugar = 0;
  for (const s of SUGARS) {
    mM[s] = (1000 * (c[s] ?? 0) * dissolved) / MOLAR_MASS[s] / litres;
    sugar += mM[s] / 1000;
  }
  mM.caffeine = (c.caffeine ?? 0) / MOLAR_MASS.caffeine / litres;
  return { mM, sugar };
}

const round = (x: number) => Math.round(x * 100) / 100;

/** How a food of these contents tastes to a fly, each 0 to 1, to two places. */
export function tastesOf(c: Contents): Tastes {
  const { mM, sugar } = solution(c);
  const sweet = mixtureSpikes(mM) / SUGAR_MOST;
  const caffeine = mM.caffeine;
  const bitter = caffeine < CAFFEINE_SPIKES.mM[0] ? 0 : onLog(CAFFEINE_SPIKES.mM, CAFFEINE_SPIKES.spikes, caffeine) / CAFFEINE_SPIKES.spikes[CAFFEINE_SPIKES.spikes.length - 1];
  const water = sugar > WATER_SIGNAL.molar[WATER_SIGNAL.molar.length - 1] ? 0 : Math.min(1, linear(WATER_SIGNAL.molar, WATER_SIGNAL.signal, sugar) / WATER_SIGNAL.signal[0]);
  return { sweet: round(Math.min(1, sweet)), water: round(water), bitter: round(Math.min(1, bitter)) };
}

function linear(xs: readonly number[], ys: readonly number[], x: number): number {
  let i = 0;
  while (i < xs.length - 2 && x > xs[i + 1]) i++;
  const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
  return ys[i] + t * (ys[i + 1] - ys[i]);
}

/** Foods mixed, grams of each: what 100 g of the mixture holds. */
export function mix(...parts: readonly (readonly [grams: number, contents: Contents])[]): Contents {
  const total = parts.reduce((sum, [g]) => sum + g, 0);
  const out: Contents = { water: 0 };
  for (const [g, c] of parts) {
    for (const k of Object.keys(c) as (keyof Contents)[]) out[k] = (out[k] ?? 0) + ((c[k] ?? 0) * g) / total;
  }
  return out;
}

/** A food dried where it lay: its water gone, so as much as is left dissolves its sugar to saturation. */
export const dried = (c: Contents): Contents => ({ ...c, water: 0 });

/** Sugars scaled to a total, kept in the proportions of another entry that has them. */
const splitAs = (c: Contents, total: number, water: number): Contents => {
  const of = SUGARS.reduce((sum, s) => sum + (c[s] ?? 0), 0);
  const out: Contents = { water };
  for (const s of SUGARS) if (c[s]) out[s] = (c[s] * total) / of;
  return out;
};

/** What each food is made of. Per 100 g; FDC entries are SR Legacy unless said to be Foundation. */
export const CONTENTS = {
  /** FDC 169655, granulated. */
  sugar: { water: 0.02, sucrose: 99.8 },
  /** FDC 169640. */
  honey: { water: 17.1, sucrose: 0.89, glucose: 35.75, fructose: 40.94, maltose: 1.44, galactose: 3.1 },
  /** FDC 167755, raw. (Foundation 2346410 has less sugar, 2.68 g.) */
  raspberry: { water: 85.75, sucrose: 0.2, glucose: 1.86, fructose: 2.35 },
  water: { water: 100 },
  /** FDC 171891, espresso, restaurant-prepared: 212 mg of caffeine, about 10.9 mM. */
  espresso: { water: 97.8, caffeine: 212 },
  /** FDC 169641, jams and preserves; it doesn't split its sugars, taken as sucrose (it is well past 1 M, where the split hardly matters). */
  jam: { water: 30.47, sucrose: 48.5 },
  /** FDC 167762, strawberries, raw: the juice of one. */
  strawberry: { water: 90.95, sucrose: 0.47, glucose: 1.99, fructose: 2.44 },
  /** FDC 173667, lemonade from frozen concentrate, prepared. */
  lemonade: { water: 88.88, sucrose: 1.64, glucose: 4.11, fructose: 4.44, maltose: 0.1 },
  /** FDC 746771 (Foundation), navel oranges, raw. */
  orange: { water: 86.7, sucrose: 4.19, glucose: 2.02, fructose: 2.36 },
  /** FDC 173944, raw. */
  banana: { water: 74.91, sucrose: 2.39, glucose: 4.98, fructose: 4.85, maltose: 0.01 },
  /** FDC 169928, yellow, raw: the fruit, and the juice of one. */
  peach: { water: 88.87, sucrose: 4.76, glucose: 1.95, fructose: 1.53, maltose: 0.08, galactose: 0.06 },
  /** FDC 173042, unsweetened. */
  grapeJuice: { water: 84.51, sucrose: 0.04, glucose: 6.81, fructose: 7.36 },
  /** FDC 2003597 (Foundation), not from concentrate. */
  orangeJuice: { water: 88.48, sucrose: 4.14, glucose: 1.81, fructose: 2.12 },
  /** FDC 174924, white bread (its soft crumbs). */
  bread: { water: 36.42, glucose: 1.57, fructose: 2.43, maltose: 1.67 },
  /** FDC 169949, raw: the juice of one. */
  plum: { water: 87.23, sucrose: 1.57, glucose: 5.07, fructose: 3.07, maltose: 0.08, galactose: 0.14 },
  /** FDC 170457, red, ripe, raw: the juice of a fallen one. */
  tomato: { water: 94.52, glucose: 1.25, fructose: 1.37 },
  /** FDC 174683, raw. */
  grape: { water: 80.54, sucrose: 0.15, glucose: 7.2, fructose: 8.13 },
  /** FDC 168556, catsup. */
  ketchup: { water: 68.51, sucrose: 2.3, glucose: 10.25, fructose: 8.72 },
  /** FDC 167747, lemon juice, raw: what a cut slice's face is wet with. */
  lemon: { water: 92.31, sucrose: 0.43, glucose: 0.99, fructose: 1.1 },
  /** FDC 169661, maple syrup: the bar's and the menu's syrup (FDC has no coffee syrup; any syrup is far past 1 M). */
  syrup: { water: 32.39, sucrose: 58.32, glucose: 1.6, fructose: 0.52 },
  /** FDC 174934, chocolate cake with chocolate frosting (6 mg of caffeine, under 1 mM in its water; its 215 mg of theobromine the bitter neurons don't answer at 10 mM: Weiss et al. 2011). */
  cake: { water: 22.04, sucrose: 37.12, glucose: 1.42, fructose: 0.82, maltose: 0.12, lactose: 0.46, caffeine: 6 },
  /** FDC 174967, shortbread: for the tart's sweet pastry and the picnic's biscuit (FDC's pie crust is unsweetened). */
  shortbread: { water: 3.6, sucrose: 20.99, glucose: 0.36, fructose: 0.3 },
  /** FDC 167990, hard candies; not split, taken as sucrose (well past 1 M either way). */
  mints: { water: 1.3, sucrose: 62.9 },
  /** FDC 174852, cola: 9 mg of caffeine, 0.5 mM, below the 1 mM where caffeine's answer was recorded (above). */
  cola: { water: 89.36, glucose: 4.1, fructose: 5.84, caffeine: 9 },
  /** FDC 168820, molasses; its maltose isn't reported. */
  molasses: { water: 21.87, sucrose: 29.4, glucose: 11.92, fructose: 12.79 },
} as const satisfies Record<string, Contents>;

const C = CONTENTS;
/** Foods made of others. */
export const MADE = {
  /** FDC 173021, raw figs: 79.11 g of water and 16.26 g of sugar, split as dried figs' (FDC 174665), the nearest entry that splits them. */
  fig: splitAs({ water: 30.05, sucrose: 0.07, glucose: 24.79, fructose: 22.93 }, 16.26, 79.11),
  /** FDC 174925, toasted white bread: 30.4 g of water and 6.2 g of sugar, split as untoasted bread's. */
  toast: splitAs(C.bread, 6.2, 30.4),
  /**
   * Raspberry coulis: sieved raspberries (FDC 167808, purée) with sugar, as
   * much as FDC's sweetened raspberries hold (167757: 72.75 g of water and
   * 21.76 g of sugar in 100 g, which don't split it).
   */
  coulis: mix([81.1, { water: 89.7, sucrose: 0.18, glucose: 2.81, fructose: 3.05 }], [16.9, C.sugar]),
  /** Espresso with sugar left in it, more than it dissolves: the dregs of a sugared cup, and Feed's lump of sugar soaked in coffee. */
  sugaredEspresso: mix([100, C.espresso], [300, C.sugar]),
  /**
   * The lab's fly food: the Bloomington stock center's cornmeal, molasses and
   * yeast food (bdsc.indiana.edu, "molassesfood"), per litre of water 75.2 ml
   * of molasses (about 1.4 g/ml), 61.3 g of cornmeal, 12.4 g of yeast and 6 g
   * of agar; only the molasses' sugars counted.
   */
  flyFood: mix([1000, C.water], [105, C.molasses], [61.3, { water: 10 }], [12.4, { water: 5 }], [6, { water: 0 }]),
  /**
   * Grape juice agar for flies to lay on: 150 ml of 100% grape juice (about
   * 1.06 g/ml) with 350 ml of water and 12.5 g of agar (Njogu & Shropshire
   * 2025, protocols.io, doi:10.17504/protocols.io.eq2lyqb5evx9/v1).
   */
  grapeAgar: mix([159, C.grapeJuice], [350, C.water], [12.5, { water: 0 }]),
  /** The ring a glass of orange juice left on the table, dried. */
  juiceRing: dried(C.orangeJuice),
} as const satisfies Record<string, Contents>;

const all = { ...CONTENTS, ...MADE };

// How each food smells to a fly: how strongly it gives off each odorant the
// brain's smell neurons were recorded answering (packages/brain/README.md,
// Smell), where 1 is as strong, at the food's edge, as the 10^-2 dilutions
// they were recorded with. Which odorants a food gives off is from what it is
// (docs/world.md, Smell, has the sources); how strongly is chosen, in three
// steps (1 what it smells of most, 0.3 less, 0.1 a trace), as nothing measured
// turns a food's own air into the recordings' scale. What none of the five
// carries (sugar, honey's and toast's aromas, a fresh fruit's butanoates)
// the fly can't smell here, and those foods give off nothing.

/** The odorants, in the order of the brain's `ODORANTS` (packages/brain olfaction.ts; a body test holds them alike). */
export const ODORANTS = ["ethylAcetate", "aceticAcid", "ethanol", "isoamylAcetate", "co2"] as const;
export type Odorant = (typeof ODORANTS)[number];
/** Each odorant's strength at the food's edge, 0 to 1, in ODORANTS' order. */
export type Odor = readonly number[];
const smell = (o: Partial<Record<Odorant, number>>): Odor => ODORANTS.map((k) => o[k] ?? 0);
export const NO_ODOR: Odor = smell({});
/** Ripe fruit: a trace of the ethanol and ethyl acetate it makes more of as it over-ripens; its own esters are others. */
const FRUIT = smell({ ethylAcetate: 0.1, ethanol: 0.1 });

/** How each food smells. Those left out give off none of the odorants. */
const SMELLS: Partial<Record<keyof typeof all, Odor>> = {
  raspberry: FRUIT,
  strawberry: FRUIT,
  orange: FRUIT,
  peach: FRUIT,
  grape: FRUIT,
  plum: FRUIT,
  fig: FRUIT,
  tomato: FRUIT,
  lemon: FRUIT,
  grapeJuice: FRUIT,
  orangeJuice: FRUIT,
  coulis: FRUIT,
  grapeAgar: FRUIT,
  /** Isoamyl acetate is banana's own smell, the most of its esters. */
  banana: smell({ isoamylAcetate: 1, ethylAcetate: 0.1, ethanol: 0.1 }),
  /** Ketchup is made with vinegar. */
  ketchup: smell({ aceticAcid: 1 }),
  /** Soda gives off the carbon dioxide it is made fizzy with, less once it is spilt. */
  cola: smell({ co2: 0.3 }),
  /** The lab's food ferments once flies and their yeasts live on it: yeast's ethanol and CO2, its esters, and the acetic acid that follows. */
  flyFood: smell({ ethylAcetate: 1, aceticAcid: 1, ethanol: 1, isoamylAcetate: 1, co2: 1 }),
};

/** How each food tastes, from what it is made of, and how it smells. */
export const TASTES = Object.fromEntries(Object.entries(all).map(([k, c]) => [k, { ...tastesOf(c), odor: SMELLS[k as keyof typeof all] ?? NO_ODOR }])) as Record<keyof typeof all, Tastes & { odor: Odor }>;

/** What the places put out to be found, by the name they give it: each device rebuilds its tastes from that. */
export const FOUND_TASTES: Readonly<Record<string, Tastes & { odor: Odor }>> = {
  "strawberry juice": TASTES.strawberry,
  "biscuit crumb": TASTES.shortbread,
};
