// The weather outside, from the Apple TV app's host: WeatherKit's current
// conditions and today's sunrise and sunset where the TV is. Only what the
// game needs crosses into JavaScript; the location never does.

/** What the host's weather service is doing. */
export type OutsideStatus =
  /** Not started, or stopped (the player turned it off). */
  | "idle"
  /** Asking for permission to know where it is, or waiting for a location fix. */
  | "locating"
  /** Asking WeatherKit. */
  | "fetching"
  /** The last request was answered. */
  | "ok"
  /** Location permission was refused or is restricted. */
  | "denied"
  /** Location services couldn't say where it is. */
  | "no-location"
  /** WeatherKit couldn't be reached. */
  | "offline"
  /** WeatherKit refused the app: the capability isn't enabled for its App ID. */
  | "unauthorised"
  /** Anything else: see `error()`. */
  | "failed";

/** The conditions outside at one observation. */
export type OutsideConditions = {
  /** "weatherkit" for Apple Weather, "stand-in" for the simulator check's fake, "fed" for conditions a script handed the game. */
  readonly source: "weatherkit" | "stand-in" | "fed";
  /** When the conditions were observed, ms since the epoch. */
  readonly observedAt: number;
  /** Of the sky, 0 to 1. */
  readonly cloudCover: number;
  /** Falling now, mm an hour (rain, or snow as water). */
  readonly precipitation: number;
  /** How far one can see, m. */
  readonly visibility: number;
  /** Wind speed, m/s. */
  readonly wind: number;
  /** WeatherKit's `WeatherCondition` raw value: "clear", "foggy", "drizzle", "snow", "thunderstorms" and so on. */
  readonly condition: string;
  /** Whether it is day there now. */
  readonly daylight: boolean;
  /**
   * Today's sunrise and sunset, and when the sun is highest (or, where it
   * never comes up, twelve hours from its lowest), as local hours from the
   * day's midnight: they may run past 24 or below 0. Sunrise and sunset are
   * null where the sun doesn't rise or set that day (polar day and night).
   */
  readonly sunrise: number | null;
  readonly sunset: number | null;
  readonly noon: number | null;
};

/** What Apple requires an app that shows WeatherKit data to show (the About screen). */
export type WeatherAttribution = {
  /** The data provider's name. */
  readonly service: string;
  /** The legal attribution, for platforms such as tvOS that can't open the legal page in Safari. */
  readonly legalText: string;
  /** The legal attribution page. */
  readonly legalPage: string;
};

/**
 * `globalThis.__native.weather` in the Apple TV app, when it is built with
 * WeatherKit (docs/apple-tv.md). Every method returns at once: locating and
 * asking WeatherKit happen on the main thread and in the background.
 */
export interface NativeWeatherBridge {
  /** Asks for location permission the first time, then fetches and keeps refreshing while the app is open. */
  start(): void;
  /** Stops refreshing. The last answer is kept. */
  stop(): void;
  status(): OutsideStatus;
  /** What went wrong, or "". */
  error(): string;
  /** How many answers there have been, counting one kept from an earlier run; 0 for none. Cheap: ask it, then `conditions()` when it changes. */
  version(): number;
  /** The last answer (possibly from an earlier run), or null. A new object each call. */
  conditions(): OutsideConditions | null;
  /** Apple Weather's attribution, once WeatherKit has given it. */
  attribution(): WeatherAttribution | null;
}
