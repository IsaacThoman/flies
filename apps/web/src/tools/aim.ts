// Where a pointer on the screen points in the fly's world: along the ray
// from the camera through it, the fly itself if the ray passes close by it
// before it meets anything else, else the first thing it meets. A finger on
// the fly means the fly, not the table some way behind it that the ray would
// otherwise reach: the feather strokes it, food lands on it, the ball dives
// at it.

import { FLY_LENGTH } from "@fly/body";
import { createSurface } from "@fly/world";
import type { RayHit, Vec3, World } from "@fly/world";

/** How near (mm) to the fly's middle a ray must pass to point at it: about its length across, generous for a fingertip. */
export const FLY_REACH = FLY_LENGTH * 0.6;
/** Its middle, above its feet (mm). */
const MIDDLE = 0.3 * FLY_LENGTH;

const under = createSurface();

/** What a ray from `origin` along the unit `dir` points at, written into `out`: the place under the fly (`fly`, its feet) if it passes by the fly first, else what it hits; null if it hits nothing. */
export function aimAt(world: World, origin: Vec3, dir: Vec3, fly: Vec3, out: RayHit): RayHit | null {
  const hit = world.raycast(origin, dir, out);
  const cx = fly.x - origin.x;
  const cy = fly.y + MIDDLE - origin.y;
  const cz = fly.z - origin.z;
  const t = cx * dir.x + cy * dir.y + cz * dir.z;
  if (t <= 0 || (hit && t > hit.t + FLY_REACH)) return hit;
  const off = Math.hypot(dir.x * t - cx, dir.y * t - cy, dir.z * t - cz);
  if (off > FLY_REACH) return hit;
  world.surface(fly.x, fly.z, under, fly.y);
  out.point.x = fly.x;
  out.point.y = under.y;
  out.point.z = fly.z;
  out.normal.x = under.normal.x;
  out.normal.y = under.normal.y;
  out.normal.z = under.normal.z;
  out.solid = under.solid;
  out.t = t;
  return out;
}
