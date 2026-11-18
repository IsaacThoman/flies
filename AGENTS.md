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
- Browsers run the brain's C++ built as WebAssembly, committed in
  `packages/brain-native/wasm/`: after changing anything in
  `packages/brain-native`, `npm run brain:wasm` (it downloads wasi-sdk once)
  and commit what it makes; the tests fail until then.
- The Apple TV has no JIT. JavaScript there costs roughly 16 times what it
  does in a desktop browser, and the cost follows the number of objects and
  draw calls, not what they draw. Merge and instance geometry, keep draw calls
  low, allocate nothing per frame, and keep per-frame JavaScript small. The
  brain does not run in JavaScript on the TV.
- Tests wait on game time or canvas state, not wall-clock sleeps. Speed budgets
  are in M5 Pro CPU time: this thread's CPU time, scaled by a reference load
  run beside it (`scripts/cpuBudget.ts`). They live in `*.budget.ts` files,
  which `npm test` runs one at a time after the rest. Contended measurements,
  including any taken while other processes keep more than a core busy,
  retry three times, each after waiting for the machine to go quiet, then skip
  locally (rerun when idle) or fail explicitly in CI; `scripts/cpuBudget.ts`
  states the acceptance bounds.
  The brain chooses: observe its inputs and commands, and bound retries for its choices.
- Comments say why, not what. No dead code, no leftover experiments.
- Shut down what you start as soon as you no longer need it: dev and
  preview servers, room servers, headless browsers, probes, Docker
  containers and Compose projects (with their scratch volumes), and
  simulators you booted (`xcrun simctl shutdown <udid>`; leave ones you
  didn't boot). Start long-running things so they can be stopped (note the
  PID), check with `lsof -nP -iTCP -sTCP:LISTEN` and `xcrun simctl list
  devices booted` before you finish, and never leave a background process
  orphaned. The machine is shared with many other agents.

## Commits and pull requests

- Never add AI attribution: no co-author trailers, no "generated with" lines.
- Branches are named in conventional-commit style (`feat-...`, `fix-...`).
- Don't commit screenshots, recordings or other test evidence to `dev` or a
  feature branch. To show them in a pull request, push them alone to an
  orphan branch named `pr-assets-<topic>` (a commit with no parent, holding
  only the images: "PR assets: ...") and put them inline in the PR's
  description as Markdown images, before and after side by side in a table
  where that helps. The repository is private, so link them as
  `https://github.com/IsaacThoman/flies/blob/pr-assets-<topic>/<file>?raw=true`
  (a raw.githubusercontent.com link doesn't load). Not in gists.
