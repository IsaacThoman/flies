// Which recorded action "Why?" plays back, which neurons its command is read
// from, and what came in during the run-up to it. All of it is read off the
// recording: the action is when the body began doing something with a command
// (recorder.ts), its neurons are the ones the brain package reads that command
// from (packages/brain/README.md, Commands), a sense is shown only if its
// input, as the body sent it, went up just before, and so is a region where
// senses come in (the eyes' pathway as far as the visual projection neurons,
// the antennae, the bristles, the taste organs, the legs' and wings' sensors)
// whose glow went up. With its eyes open the fly sees a loom through them, not
// through the Loom bars, so the eyes' regions are what show it. Nothing says
// what came in caused it; the player sees what came before and what fired.

import { REGIONS } from "@fly/brain";
import { SOMA_GROUPS } from "@fly/fly";
import { COMMAND_ORDER } from "@fly/contracts";
import { SENSES } from "../stats/panel.ts";
import { ACTIONS, AT, SAMPLE_HZ } from "./recorder.ts";
import type { Action, Clip } from "./recorder.ts";

/** Seconds shown before the action began, and after. */
export const BEFORE = 2;
export const AFTER = 1;
/** A sense counts if it rose by ROSE (a tenth of its bar) within RUN_UP seconds before the action, from where it was in the BEFORE seconds. */
export const RUN_UP = 1.5;
export const ROSE = 0.1;
/** At most this many senses, and regions, are picked out. */
export const MOST_SENSES = 3;
/**
 * The senses that can be picked out: not the light, the mean over every facet,
 * which a loom at one eye hardly moves (the eyes' regions show what they saw,
 * side by side), nor hunger and thirst, which are internal state and move over
 * minutes.
 */
const PICKED_SENSES = SENSES.map(([key]) => key !== "light" && key !== "hunger" && key !== "thirst");
/**
 * Where senses come in: a region counts if its glow (rate over its full scale)
 * rose by REGION_ROSE. At rest with its eyes open the eyes' regions wander by
 * up to about 0.13 in a second and a half; a ball looming at one eye raises
 * that side's lamina, medulla or lobula by 0.2 to 0.45 before it takes off.
 */
export const INPUT_REGIONS = ["retina", "lamina", "medulla", "lobula", "lobula-plate", "optic-other", "visual-projection"]
  .flatMap((id) => [`${id}-left`, `${id}-right`])
  .concat(["antenna-smell", "johnston-left", "johnston-right", "head-bristles", "mouthparts", "leg-sensory", "thorax-sensory", "abdomen-sensory", "proprioceptors", "bristles"]);
export const REGION_ROSE = 0.15;
const INPUTS = INPUT_REGIONS.map((id) => REGIONS.findIndex((r) => r.id === id)).filter((r) => r >= 0);

type CommandKey = (typeof COMMAND_ORDER)[number];

/** Each action's commands, and the neurons (their rates' names) each is read from. */
export const DRIVEN_BY: Readonly<Record<Action, { commands: readonly CommandKey[]; rates: readonly string[] }>> = {
  takeoff: { commands: ["escape", "wings"], rates: ["DNp01", "flight"] },
  feed: { commands: ["feed"], rates: ["MN9"] },
  back: { commands: ["back"], rates: ["MDN"] },
  groom: { commands: ["groom"], rates: ["DNg12"] },
  sing: { commands: ["sing"], rates: ["pIP10"] },
  turnLeft: { commands: ["turn"], rates: ["DNa02 left"] },
  turnRight: { commands: ["turn"], rates: ["DNa02 right"] },
  walk: { commands: ["walk"], rates: ["DNg100"] },
};

export type Why = {
  /** What it did, or null when the recording holds nothing it did. */
  action: Action | null;
  /** The sample, in the clip, it began at; -1 when it was already under way when the recording began. */
  onset: number;
  /** The samples shown, `from` up to `to`. */
  from: number;
  to: number;
  /** Its neurons, as indices into SOMA_GROUPS, and its commands, into COMMAND_ORDER. */
  groups: number[];
  commands: number[];
  /** The senses that rose before it, into SENSES, and the regions where senses come in, into REGIONS, the most risen first. */
  senses: number[];
  regions: number[];
};

/** The latest sample at which `action` began, or -1. A take-off is a moment, so any sample holding one; anything else, a sample where it was not going the sample before. */
function lastOnset(clip: Clip, action: number): number {
  for (let i = clip.length - 1; i >= 0; i--) {
    if (!clip.doing(i, action)) continue;
    if (ACTIONS[action] === "takeoff") return i;
    if (i > 0 && !clip.doing(i - 1, action)) return i;
  }
  return -1;
}

/** How far a recorded value (over `scale`) rose within RUN_UP before `onset`, from its lowest in the BEFORE seconds up to then. */
export function rise(clip: Clip, field: number, onset: number, scale = 1): number {
  const from = Math.max(0, onset - BEFORE * SAMPLE_HZ);
  const runUp = onset - RUN_UP * SAMPLE_HZ;
  let low = Infinity, most = 0;
  for (let i = from; i < onset; i++) {
    const v = Math.min(1, clip.at(i, field) / scale);
    low = Math.min(low, v);
    if (i >= runUp) most = Math.max(most, v - low);
  }
  return most;
}

/**
 * What to play back: the most striking action begun in the recording (a
 * take-off before feeding, before backing, grooming, singing, a turn and
 * walking; the latest of the same), or, if none began, the most striking one
 * still going.
 */
export function explain(clip: Clip): Why {
  const n = clip.length;
  let action = -1, onset = -1;
  for (let a = 0; a < ACTIONS.length && action < 0; a++) {
    const at = lastOnset(clip, a);
    if (at >= 0) {
      action = a;
      onset = at;
    }
  }
  for (let a = 0; a < ACTIONS.length && action < 0 && n > 0; a++) if (clip.doing(n - 1, a)) action = a;
  const span = (BEFORE + AFTER) * SAMPLE_HZ;
  const from = onset >= 0 ? Math.max(0, onset - BEFORE * SAMPLE_HZ) : Math.max(0, n - span);
  const to = onset >= 0 ? Math.min(n, onset + AFTER * SAMPLE_HZ + 1) : n;
  if (action < 0) return { action: null, onset: -1, from, to, groups: [], commands: [], senses: [], regions: [] };
  const id = ACTIONS[action];
  const driven = DRIVEN_BY[id];
  const senses: { i: number; rose: number }[] = [];
  const regions: { i: number; rose: number }[] = [];
  if (onset >= 0) {
    for (let s = 0; s < SENSES.length; s++) {
      const rose = PICKED_SENSES[s] ? rise(clip, AT.senses + s, onset) : 0;
      if (rose >= ROSE) senses.push({ i: s, rose });
    }
    for (const r of INPUTS) {
      const rose = rise(clip, AT.regions + r, onset, REGIONS[r].fullHz);
      if (rose >= REGION_ROSE) regions.push({ i: r, rose });
    }
  }
  const most = (picked: { i: number; rose: number }[]) => picked.sort((a, b) => b.rose - a.rose).slice(0, MOST_SENSES).map((p) => p.i);
  return {
    action: id,
    onset,
    from,
    to,
    groups: driven.rates.map((rate) => SOMA_GROUPS.findIndex((g) => g.rate === rate)),
    commands: driven.commands.map((c) => COMMAND_ORDER.indexOf(c)),
    senses: most(senses),
    regions: most(regions),
  };
}
