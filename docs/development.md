# Development and checks

Read [the architecture](architecture.md) before changing the game.
The [repository guide](../AGENTS.md) sets the working rules.

## Checks

```sh
npm test
npm run lint
npm run typecheck
npm run tvos:typecheck
```

Tests run TypeScript directly in Node. The normal tests run first; calibrated
CPU budgets in `*.budget.ts` then run serially (`scripts/cpuBudget.ts`).
For a small change, run the relevant file with `node --test <path>` first.
CI skips macOS tests and browser e2e for draft pull requests, then runs them
when the request is marked ready. Native-package changes also trigger the
path-filtered WebAssembly reproduction workflow when the request is ready.
Local checks still apply.

Browser checks need the connectome and Playwright Chromium:

```sh
npm run brain:fetch
npx playwright install chromium
npm run e2e
```

The browser suites use the real brain: keyboard play, phone and desktop
pointers, the built site's download/offline/lifecycle behaviour, and online
rooms. They observe canvas `data-*` attributes because the game draws its UI.

| Task | Reference |
| --- | --- |
| Drive and screenshot browser play | `scripts/play.ts` (usage at its top) |
| Measure browsers and CPU throttling | `scripts/measure.ts`, [web measurements](web.md#measured) |
| Reproduce a headless body/brain failure | [Fuzzing](fuzzing.md) |
| Watch browser resources over time | [Browser soak](web-soak.md) |
| Verify Apple hosts | [Apple TV checks](apple-tv.md#device-and-simulator-checks), [iOS checks](ios.md#checking-it) |
| Change the brain in both languages | [Native brain workflow](../packages/brain-native/README.md#when-the-model-changes) |


## Test map

| File or directory | What to look for |
| --- | --- |
| `apps/web/e2e/play.e2e.ts` | Keyboard menus, feeding, take-off, screensaver, corner pictures, X-ray, places, settings and frame budgets with the real brain |
| `apps/web/e2e/pointer.e2e.ts` | Phone taps/drags/pinches and desktop mouse, wheel and keyboard camera input |
| `apps/web/e2e/web.e2e.ts` | Built-site downloads, interrupted first load, offline revisit, injected visibility changes, wake lock, graphics-context recovery and startup failures including missing WebGL 2 |
| `apps/web/e2e/tables.e2e.ts` | Online rooms, shared objects, joining/leaving, room lists and socket lifecycle |
| `apps/web/tests` | Game systems in isolation: input, menus, camera, eyes, weather, downloads, Online and resource ownership |
| `packages/body/tests` | Senses, behavior, flight, hunger, crowd contact and daily rhythm |
| `packages/world/tests` | Solids, spatial queries, food contact and place geometry |

The [brain reference's tests](../packages/brain/README.md#tests) describe
model coverage; [native parity checks](../packages/brain-native/README.md#how-it-is-tested)
compare the two implementations. Browser lifecycle tests inject visibility
state; they do not establish every operating system's real suspension behavior.

## Feed weather in a browser

A browser has no native weather service. In solo play, scripts can provide conditions
through `__fly.outside.feed`, taking `OutsideConditions` without `source`
(`packages/contracts/src/weather.ts`). For example:

```sh
node scripts/play.ts 'eval:__fly.outside.feed({observedAt:Date.now(),cloudCover:0.8,precipitation:1,visibility:5000,wind:3,condition:"drizzle",daylight:true,sunrise:6,sunset:18,noon:12})'
```

The fields use milliseconds since the epoch, cloud fraction, mm/hour, metres,
m/s and local civil clock hours from midnight. `feed` settles the supplied observation's internal blend immediately by default;
its optional second argument `false` eases that blend. Game polling and sky
easing can still delay the rendered result. In that page,
`__fly.outside.feed(null)` removes the supplied observation and returns to
any host service, or the forecast without one. Use Weather → Now and Light →
Now to follow it. If outside conditions were disabled in saved settings,
set `__fly.outside.enabled = true` for the page; the Real weather setting is
shown only on a host with the native service.

The canvas reports `data-weather-from` (`outside`, `forecast`, `chosen`),
`data-sun-from` (`outside`, `clock`, `chosen`), `data-outside` (`fed`, `none`,
`off`, or the host status including `idle`) and `data-outside-age` (seconds,
empty with no observation). These show which source is in use and how old
the observation is in solo play; the feed does not contact a weather provider.
At an online table the room owns weather and clock, so the feed is not used
for them. The source attributes can still reflect the local Outside flags
in that case, a suspected reporting bug; do not use them as evidence that
room weather came from the feed.

## Documentation checks

`npm test` includes a fast documentation check. Run only that check with
`node --test scripts/docs.test.ts`. It checks local Markdown links and
anchors, source-file references in inline code and repository paths in command examples, and documented `npm run`
commands, including common npm flags and explicit package-directory overrides.
It parses Markdown for links/headings, so code examples do not invent links or
anchors. Command/file checks still inspect the examples. It does not fetch
external URLs or execute documented commands.

Use a relative Markdown link when pointing readers to another document.
Write source paths in inline code relative to the repository root, or to
the document; a matching basename elsewhere is not sufficient. Label generated paths and example placeholders as such; they
are not existing source files. For an exact generated-path exemption, add
`<!-- docs-check: generated path/to/output -->` to that document. Local
Markdown links are always checked, including links to generated paths. Use
`<!-- docs-check: external file.csv -->` for a specifically named input
provided outside the repository. Exemptions are exact paths in that document,
not directory-wide exclusions. All documented npm commands run from the
repository root unless the command says otherwise.
