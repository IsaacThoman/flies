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
when the request is marked ready. Local checks still apply.

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

## Documentation checks

`npm test` includes a fast documentation check. Run only that check with
`node --test scripts/docs.test.ts`. It checks local Markdown links and
anchors, source-file references in inline code and repository paths in command examples, and documented `npm run`
commands. It does not fetch external URLs or run the documented commands.

Use a relative Markdown link when pointing readers to another document.
Write source paths in inline code relative to the repository root, or to
the document. Label generated paths and example placeholders as such; they
are not existing source files. For an exact generated-path exemption, add
`<!-- docs-check: generated path/to/output -->` to that document. Local
Markdown links are always checked, including links to generated paths. Use
`<!-- docs-check: external file.csv -->` for a specifically named input
provided outside the repository. Exemptions are exact paths in that document,
not directory-wide exclusions. All documented npm commands run from the
repository root unless the command says otherwise.
