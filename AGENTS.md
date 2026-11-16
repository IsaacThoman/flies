# flies

A simulated fruit fly that lives on an Apple TV. Read `docs/architecture.md`
before changing anything: it says what each part is, who talks to whom, and
the rules the whole thing is built on.

## Working here

- TypeScript runs directly in Node (type stripping): no build step for
  scripts or tests. Tests are Node's test runner, next to the code or in a
  package's `tests/` folder: `npm test`. Also `npm run lint` and
  `npm run typecheck`. All three must pass.
- `npm run dev` serves the game in a browser, where the keyboard is the
  remote (arrows, Enter, Escape, space) and the mouse or a finger points at
  the screen. `scripts/play.ts` drives it at any size or as a phone or a
  tablet (taps, drags, pinches, clicks, the wheel).
- The game draws everything itself, menus included. There is no DOM to
  query: tests and scripts wait on the canvas's `data-*` state.
- The packed connectome is not in git: `npm run brain:fetch` (38 MB).
- The Apple TV has no JIT. JavaScript there costs roughly 16 times what it
  does in a desktop browser, and the cost follows the number of objects and
  draw calls, not what they draw. Merge and instance geometry, keep draw calls
  low, allocate nothing per frame, and keep per-frame JavaScript small. The
  brain does not run in JavaScript on the TV.
- Comments say why, not what. No dead code, no leftover experiments.

## Commits and pull requests

- Never add AI attribution: no co-author trailers, no "generated with" lines.
- Branches are named in conventional-commit style (`feat-...`, `fix-...`).
- Don't commit screenshots, recordings or other test evidence.
