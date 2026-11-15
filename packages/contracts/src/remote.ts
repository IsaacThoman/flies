// The Apple TV remote, as the game sees it.
//
// Everything arrives as DOM events on `window`, so the same game code runs in
// a browser (keyboard and mouse) and in the tvOS host (which has no real DOM
// and synthesises these events from the remote).

export type RemoteButton = "up" | "down" | "left" | "right" | "select" | "back" | "playPause";

/**
 * Buttons are `keydown` / `keyup` KeyboardEvents with these `key` values.
 * `repeat` is true on the repeats of a held button (the host generates them:
 * first after 400 ms, then every 100 ms).
 *
 * On the remote: the clickpad's ring (or a swipe) is the arrows, its centre is
 * select, Back (or Menu on older remotes) is back, and Play/Pause is itself.
 * In a browser the same keys do the same things, with the space bar as
 * Play/Pause.
 */
export const REMOTE_KEYS: Readonly<Record<string, RemoteButton>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "select",
  Escape: "back",
  MediaPlayPause: "playPause",
  " ": "playPause",
};

/**
 * A finger on the remote's touch surface: a `remotetouch` CustomEvent on
 * `window`, sent whenever the finger lands, moves or lifts. `x` and `y` run
 * from -1 to 1 across the surface with y up, (0, 0) at its centre; they keep
 * their last value when `touching` goes false. In a browser the mouse over
 * the canvas stands in for it (pressed = touching).
 */
export type RemoteTouch = { x: number; y: number; touching: boolean };
export const REMOTE_TOUCH_EVENT = "remotetouch";

/**
 * The host leaves the app when Back is pressed at the root of the game (as
 * tvOS apps must). The game tells it whether it is there by setting this
 * property on `window`; the host reads it when the press begins. In a browser
 * nothing reads it.
 */
export const AT_ROOT_PROPERTY = "__flyAtRoot";
