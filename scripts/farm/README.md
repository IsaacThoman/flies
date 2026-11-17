# Flies test farm

## Running the checks on the farm

Push your branch, then run:

```sh
ssh ubuntu-thinkpad flies-check <branch> --with-dev
```

`--with-dev` merges the fetched `origin/dev` before checking and lists conflicts.
Branches, `origin/<branch>`, and pushed SHAs work. The checkout's SHA is printed.
Use `--only lint|types|unit|e2e|all` (default `all`); `types` includes tvOS.
For targeted runs, use `--files path/to/a.test.ts path/to/b.test.ts` (or `.e2e.ts`
paths). With default `all`, this retains lint, typechecks and build but runs only
the selected test files; a test stage with no selected files is explicitly skipped.
You can also combine it with `--only unit` or `--only e2e`. All runs exit nonzero on
failure. Each stage reports status, seconds and failure context. Container stages
time out after 30 minutes; complete logs
remain under `~/flies-farm/logs/<id>/`. Remove old logs when no longer needed.

Four advisory file locks in `~/flies-farm/locks/` cap simultaneous runs; others
wait. Kernel locks release when the run's processes exit. Each run uses a detached git
worktree, independent `npm ci --prefer-offline` installation with the warm npm
cache, and the shared connectome mounted read-only. Worktrees and containers are
removed on exit, including errors, Ctrl-C and SSH disconnect. SIGKILL cannot run
cleanup: remove that run's named container and worktree manually if necessary.
Checks continue after a failed stage so one invocation collects all failures.

All check stages run in a Node 24 / Playwright container limited to four CPUs
and 6 GiB. Unit files use four workers to use that CPU allowance. No ports are
published and networking is disabled; test
servers can communicate only inside their own container. The official browser
cache is `/ms-playwright`; `scripts/play.ts` finds it through
`PLAYWRIGHT_BROWSERS_PATH`, retaining its Linux GPU flags. No `CHROMIUM_PATH`
override or system Chromium installation is needed.

## Host setup

Requires Bash, git, Node 24/npm, Docker access, `flock` and a populated clone at
`~/repos/flies` with `npm ci` and `npm run brain:fetch` already completed.
Install atomically so existing runs keep their script open:

```sh
mkdir -p ~/bin
install -m 755 scripts/farm/flies-check ~/bin/flies-check.new
mv ~/bin/flies-check.new ~/bin/flies-check
```

Put `export PATH="$HOME/bin:$PATH"`
at the **top** of `~/.bashrc`, before its non-interactive early return, so SSH
commands can find it. No service or published port is needed.

Build the image once (and again when the locked Playwright version changes):

```sh
version=$(node -p 'require("./package-lock.json").packages["node_modules/playwright"].version')
docker build --build-arg PLAYWRIGHT_VERSION="$version" \
  -t "flies-farm:$version" scripts/farm
```

The image adds clang for the native brain tests and Node 24 to the matching
Playwright Noble image. Apt runs inside the image; host sudo is unnecessary.

## Architecture limits

Validation results and precise Apple silicon exclusions are recorded below.

The unsuppressed x86 probe failed these five **WebAssembly** test names;
only these exact names are excluded with Node's `--test-skip-pattern`:

| File in `packages/brain-native/tests/` | Test |
| --- | --- |
| `math.test.ts` | exp, log, log1p, expm1, sin and cos are V8's to the bit (WebAssembly) |
| `connectome.test.ts` | on the real connectome every tick is the TypeScript's, bit for bit, the eyes shut and open (WebAssembly) |
| `synthetic.test.ts` | every tick of 70 simulated seconds is the TypeScript's, bit for bit, for several seeds (WebAssembly) |
| `synthetic.test.ts` | with its eyes open every tick is the TypeScript's, bit for bit, for several seeds (WebAssembly) |
| `synthetic.test.ts` | broken or odd eye columns come out as in TypeScript (WebAssembly) |

The committed WASM implements Apple silicon's fused math, while x86 Node's
Math rounds differently. Native x86 comparisons, WASM engine/eyes/refusal tests,
and the browser C-interface tests remain enabled. The tests' existing arm64
instruction-inspection and optional-source/toolchain skips remain as upstream.
The math probe found 5,018 one-bit differences for WASM; native math passed.

`*.budget.ts` files are not run here. The full budget probe retried and skipped
all three measured budgets: reference medians ranged from 6.00 to 14.00 CPU ms,
exceeding the local 4.8 ms acceptance bound. A standalone reference measured
13.01 ms against the M5 Pro's 4.00 ms. Run these budgets, the five excluded
bit-exact comparisons, and Apple simulator checks on Apple silicon.
