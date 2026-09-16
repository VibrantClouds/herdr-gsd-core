verdict: real-worker-supported
builder_mode_changed: yes

# 04-04 Worker Spike: Real Module Worker Under Headless Karma

## Question

Does a real module Worker constructed with `new Worker(new URL(...), { type: 'module' })` bundle,
instantiate, and round-trip a message under this repository's actual headless `ng test`
invocation? (D-14, 04-RESEARCH.md Open Question 1 / Common Pitfall 1.)

`@angular-devkit/build-angular:karma`'s `builderMode` option defaults to `"browser"` (the legacy
webpack builder), while this project's `build`/`serve` targets use
`"@angular-devkit/build-angular:application"` (esbuild). Before anything downstream depended on
real-worker specs working under Karma, this had to be measured, not assumed.

## Method

A throwaway spike (`src/app/workers/spike-echo.worker.ts` + `spike-echo.worker.spec.ts`, both
deleted at the end of this task) was built:

- `spike-echo.worker.ts`: `export {};` (module marker under `isolatedModules`) followed by
  `self.onmessage` assigned to a handler that echoes `event.data` back via `self.postMessage`.
  No triple-slash lib-reference directive. No `tsconfig.worker.json`. No `webWorkerTsConfig` entry.
- `spike-echo.worker.spec.ts`: one `it` that constructs the worker via
  `new Worker(new URL('./spike-echo.worker', import.meta.url), { type: 'module' })`, posts
  `{ ping: 'spike' }`, asserts the echoed response in `onmessage`, fails via `worker.onerror`,
  and fails via a 4000ms guard timer if the worker never responds. `worker.terminate()` is called
  on every exit path.

### Commands run, in order

1. `pnpm run typecheck` (`tsc --noEmit`) — with the spike worker present, before any Karma run.
   - The `pnpm run` script itself could not resolve the `tsc` binary from this worktree
     (`sh: line 1: tsc: command not found` — `node_modules` lives at the main repo root, not
     inside this worktree, and `pnpm run`'s script PATH does not do the ancestor-directory
     `node_modules/.bin` lookup that Node's `require()`/`ng`/`pnpm exec` machinery does here).
     This is a worktree/environment artifact of the execution harness, not a type error. The
     compiler was invoked directly at its resolved path
     (`/home/user/Development/SizeComparisonSite/node_modules/.bin/tsc --noEmit`) and exited
     0 with no diagnostics, confirming the worker file type-checks cleanly under the existing
     `tsconfig.json` (no `include`/`files` key, so every `.ts` under the repo root — including
     worker sources — is in the same compiler program as DOM-typed application code).
2. Scoped headless Karma run for the spike spec only:
   `CHROME_BIN=... pnpm exec ng test --no-watch --browsers=ChromeHeadless --include='**/spike-echo.worker.spec.ts'`
   **Before any `angular.json` change** (Task 1 measurement) — **FAILED**, classified as a
   build/bundling error naming the worker file:
   ```
   Chrome Headless 148.0.0.0 (Linux 0.0.0) spike-echo.worker (throwaway spike) instantiates a real module Worker and echoes a posted message FAILED
   SecurityError: Failed to construct 'Worker': Script at 'file:///home/user/Development/SizeComparisonSite/.claude/worktrees/agent-a2379c1cc660b8195/src/app/workers/spike-echo.worker' cannot be accessed from origin 'http://localhost:9876'.
   TOTAL: 1 FAILED, 0 SUCCESS
   ```
   The default (webpack, `builderMode: "browser"`) Karma builder did not rewrite
   `new URL('./spike-echo.worker', import.meta.url)` into a servable bundle asset — the raw
   `file://` disk path leaked through into the browser context, which then refused to
   construct a cross-origin `Worker` from it. This is exactly Common Pitfall 1's predicted
   failure mode: the test bundler and the production bundler disagree on worker handling.
3. Escalation (Branch B of Task 2): added `"builderMode": "application"` to
   `projects.size-comparison-tool.architect.test.options` in `angular.json`, then re-ran the
   identical scoped command:
   ```
   Lazy chunk files    | Names             | Raw size
   worker-2LIWGATX.js  | spike-echo-worker | 159 bytes

   Chrome Headless 148.0.0.0 (Linux 0.0.0): Executed 1 of 1 SUCCESS (0.011 secs)
   TOTAL: 1 SUCCESS
   ```
   With the esbuild `application` builder active for Karma, the worker file is recognized and
   bundled as its own lazy chunk — the same mechanism `ng build`/`ng serve` already use — and
   the round-trip spec passed cleanly.
4. Because switching the test bundler from webpack to esbuild affects every existing spec, the
   FULL suite was run next (hard gate, not optional):
   `CHROME_BIN=... pnpm exec ng test --no-watch --browsers=ChromeHeadless`
   ```
   TOTAL: 29 FAILED, 420 SUCCESS   (449 total)
   ```
   Before this phase's baseline (captured by the orchestrator on `main` @ 07d38b3, `builderMode`
   unset): **448 total / 419 SUCCESS / 29 FAILED**. After the `builderMode: "application"` change
   plus the (still-present) spike spec: **449 total / 420 SUCCESS / 29 FAILED**. The one extra
   total/success pair is exactly the spike spec itself (it counts as a 449th test and passes).
   The 29 failing test names were diffed against the orchestrator's baseline list and are
   **identical, by full test name, to the pre-existing baseline failure set**
   (`AttachmentSidebarComponent Scale Slider Settings` ×2, `CategoryDropdownComponent should
   create` ×1, `CompareModalComponent Horizontal Flip` ×5, `CompareModalComponent On Top Toggle`
   ×4, `ComparisonPanelComponent Integration with Size Slider` ×5, `ImageDisplayComponent Overlay
   Positioning` ×1, `ImageDisplayComponent Scaling Constraints and Container Positioning` ×2,
   `ManageModalComponent` ×4, `SizeSliderComponent Measurement Formatting` ×2,
   `UploadModalComponent` ×3 — 29 total). **Zero new failures introduced by the builder-mode
   change.** The full suite is green relative to this phase's gate ("failing-spec set ⊆ recorded
   baseline").
5. Spike files deleted (`git rm` via task cleanup); `pnpm run typecheck` (direct `tsc` binary
   invocation, same environment note as step 1) and the full suite were re-run after deletion —
   0 type errors, and the suite returns to the exact pre-phase baseline shape (448 total / 419
   SUCCESS / 29 FAILED, same 29 names) with the spike spec gone.

## Verdict

**`real-worker-supported`**, **`builder_mode_changed: yes`**.

A real module Worker instantiates and round-trips a message under this repo's headless Karma
command, provided `"builderMode": "application"` is set on the `test` architect target so Karma's
bundler matches the `build`/`serve` esbuild bundler. That change has been kept in `angular.json`
because it was proven safe: the full suite before and after the change fails the exact same 29
pre-existing tests (all inherited from Phases 1–2, none newly introduced), and the change is what
makes the worker-under-test story match the worker-under-production story instead of diverging
from it.

## Typing guidance confirmed

- **No triple-slash lib-reference directive** was added to the worker file. `tsconfig.json`
  declares no `include`/`files` key, so the worker source compiles into the same TypeScript
  program as every DOM-typed application file; pulling in the dedicated `webworker` lib on top
  of `dom` produces duplicate global declarations. The spike worker type-checked cleanly without
  one.
- **No `tsconfig.worker.json`** was created and **no `webWorkerTsConfig`** entry was added to
  `angular.json`. That option belongs to the legacy `browser`/webpack builder path and is not
  read by the `application` (esbuild) builder this project's `build`/`serve` targets use (and
  which `test` now also uses).
- The existing DOM lib (no lib-list changes anywhere in this phase) already declares
  `OffscreenCanvas`, `OffscreenCanvasRenderingContext2D`, `createImageBitmap`, `ImageBitmap`, and
  `convertToBlob` — confirmed by `tsc --noEmit` passing with the worker file present, with no
  additional lib entries.

## What this means for 04-08 and 04-09

- **04-08** (worker entry point + `offscreen-image-processor.ts`): may write a real-worker
  round-trip spec against `src/app/workers/image-processing.worker.ts` using the exact
  `new Worker(new URL(...), { type: 'module' })` + `builderMode: "application"` pattern proven
  here — it is empirically known to bundle and run under this repo's headless Karma command.
  This is now a supported option, not a hard requirement; 04-08 may still choose to mock the
  `Worker` constructor at the `ImageProcessingService` boundary if that better fits its test
  design, but it is no longer blocked from writing a real one.
- **04-09** (parity test): the D-11 geometry-fidelity contract is verified either way, per the
  plan's pre-decided fallback — 04-09's parity test compares `offscreen-image-processor.ts`
  (imported directly as a plain module, no `Worker` needed) against the main-thread path. That
  test's design is unaffected by this verdict. If 04-09 also exercises the `Worker` boundary at
  the `ImageProcessingService` level (e.g. to test cancellation/termination), it may now do so
  with a real `Worker` instead of a mock, per this spike's proof.
- Because the verdict is `real-worker-supported`, the `mock-only` degradation path described in
  this plan's `<objective>` does **not** apply — 04-08 and 04-09 are not required to fall back to
  mocking the `Worker` constructor, though they remain free to if it simplifies a specific test.
