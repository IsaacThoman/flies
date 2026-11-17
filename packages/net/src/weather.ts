// Shared precipitation choices keep the room clock and its clients in step.
import { KINDS as BASE, forecast as baseForecast } from "@fly/world";
import type { Mix as BaseMix, WeatherKind as BaseKind } from "@fly/world";

export type WeatherKind = BaseKind | "heavyRain" | "storm" | "snow" | "sleet";
export type Mix = BaseMix & { heavy?: number; storm?: number; snow?: number };
export const KINDS: Readonly<Record<WeatherKind, Readonly<Mix>>> = {
  ...BASE,
  heavyRain: { cloud: 1, mist: 0.35, rain: 1, wind: 0.9, heavy: 1 },
  storm: { cloud: 1, mist: 0.3, rain: 1, wind: 1, heavy: 1, storm: 1 },
  snow: { cloud: 0.95, mist: 0.3, rain: 0, wind: 0.4, snow: 1 },
  sleet: { cloud: 1, mist: 0.3, rain: 0.6, wind: 0.7, snow: 0.55, heavy: 0.4 },
};
const clamp = (x: number) => Math.max(0, Math.min(1, x));

/** Northern temperate seasons for the invented forecast, never an inferred local temperature. */
export function forecast(hours: number, out: Mix): Mix {
  baseForecast(hours, out);
  const day = hours / 24;
  const winter = clamp((Math.cos((day - 15) * Math.PI * 2 / 365.2425) - 0.25) / 0.6);
  const system = clamp((Math.sin(day * 0.73 + 1.7) - 0.15) * 2);
  const summer = clamp((-Math.cos((day - 15) * Math.PI * 2 / 365.2425) - 0.1) * 1.5);
  out.snow = out.rain * winter;
  out.rain *= 1 - winter;
  out.heavy = out.rain * system;
  out.storm = out.heavy * summer;
  return out;
}

