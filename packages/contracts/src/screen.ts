// The screen the game is shown on, as a host that wraps the web build (the
// iPhone and iPad app) can describe it.

/**
 * What the screen's notch, home indicator and rounded corners cover, in CSS
 * pixels in from each edge. In a browser the game reads CSS
 * `env(safe-area-inset-*)`, which a page shown edge to edge
 * (`viewport-fit=cover`) is given. A host that knows better assigns this
 * shape to `window[SAFE_AREA_PROPERTY]` and then dispatches a `resize` event
 * on `window`; the game lays itself out again on the next frame. Assign
 * `undefined` to go back to CSS's.
 */
export type SafeArea = { top: number; right: number; bottom: number; left: number };
export const SAFE_AREA_PROPERTY = "__flySafeArea";
