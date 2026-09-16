---
phase: 01-foundation-registry-state-machine
reviewed: 2026-07-23T00:00:00Z
depth: standard
files_reviewed: 39
files_reviewed_list:
  - src/api/http/app.ts
  - src/api/http/errors.ts
  - src/api/http/routes/projects.ts
  - src/cli/api-client.ts
  - src/cli/exit-codes.ts
  - src/cli/index.ts
  - src/cli/parity.test.ts
  - src/cli/render.ts
  - src/config.ts
  - src/core/event-store/record-event.test.ts
  - src/core/event-store/record-event.ts
  - src/core/event-store/single-writer.test.ts
  - src/core/state-machine/transitions.test.ts
  - src/core/state-machine/transitions.ts
  - src/core/state-machine/types.ts
  - src/db/index.ts
  - src/db/migrations-path.test.ts
  - src/db/migrations-path.ts
  - src/db/packaging.e2e.test.ts
  - src/db/schema.ts
  - src/registry/cwd-boundary.test.ts
  - src/registry/cwd-independence.e2e.test.ts
  - src/registry/fleet-yaml.test.ts
  - src/registry/fleet-yaml.ts
  - src/registry/git-inspect.ts
  - src/registry/projects.ts
  - src/registry/registry.test.ts
  - src/spikes/evidence-trap.ts
  - src/spikes/findings-writer.ts
  - src/spikes/fixtures/stream-events.ts
  - src/spikes/permission-mode.spike.test.ts
  - src/spikes/rate-limit-classifier.test.ts
  - src/spikes/rate-limit-classifier.ts
  - src/spikes/scratch-repo.ts
  - src/spikes/session-id.spike.test.ts
  - src/spikes/spawn-claude.test.ts
  - src/spikes/spawn-claude.ts
  - src/spikes/worktree-settings.spike.test.ts
  - src/types/better-sqlite3.d.ts
  - drizzle/0000_fat_callisto.sql
findings:
  critical: 0
  warning: 5
  info: 1
  total: 6
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-07-23T00:00:00Z
**Depth:** standard
**Files Reviewed:** 39
**Status:** issues_found

## Summary

This is a re-review of Phase 1 after the CR-01/CR-02 gap-closure plans (01-05, 01-06). Both prior findings were verified against the current code, not assumed closed:

- **CR-01 (daemon cwd dependency for migrations)** — genuinely closed. `src/db/migrations-path.ts` resolves the migration trail relative to `import.meta.url`, never `process.cwd()`, with a fixed two-candidate search order (packaged `dist/drizzle` vs. checkout-root `drizzle/`), existence gated on `meta/_journal.json` (not the bare directory, closing the partial-copy hazard), and a loud `MigrationsFolderNotFoundError` on total miss. Verified against real out-of-process evidence: `migrations-path.test.ts` branch-covers every candidate-selection path, and `packaging.e2e.test.ts` runs a real `npm run build`, copies `dist/` into an isolated install root with no sibling `drizzle/`, and proves the built daemon serves `GET /health` and `GET /projects` (200, empty array — proof migrations actually ran) from a scratch cwd.
- **CR-02 (daemon-side cwd substitution for project path)** — genuinely closed. `createProjectBody`'s zod schema requires `path` and rejects anything not `isAbsolute()`; `src/registry/projects.ts` no longer has a `?? process.cwd()` fallback; the CLI (`src/cli/index.ts`) resolves the path client-side via `resolve(path ?? process.cwd())` before it ever reaches the wire. `cwd-boundary.test.ts` Test 4 is a structural repo-wide scan asserting `process.cwd()` appears in exactly one non-test source file (`src/cli/index.ts`), and `cwd-independence.e2e.test.ts` proves out-of-process, with real spawned daemon/CLI children in distinct scratch directories, that the caller's repo (not the daemon's cwd) is what gets registered, for both the omitted-argument and relative-argument cases.

No new BLOCKER-level defects were found in this pass. The five WARNING findings below are new: a sanitization gap between the inferred and caller-supplied project `slug`, an unguarded cast from a persisted `TEXT` status column into the state machine's closed `TaskState` union, a regex-based structural invariant that is easy to silently defeat, an update-patch contract that cannot actually clear a field end-to-end, and an incomplete credential-stripping regex for git remote URLs.

## Warnings

### WR-01: Caller-supplied `slug` bypasses the filesystem-safety sanitization applied to the inferred slug

**File:** `src/api/http/routes/projects.ts:26`, `src/registry/projects.ts:73`, `src/registry/git-inspect.ts:32-37`

**Issue:** `deriveSlug()` in `git-inspect.ts` exists specifically to make a slug safe as a future filesystem path segment — its own doc comment says so ("`..` and `/` cannot survive into a path segment... Phase 2's worktree root"). But that sanitizer only ever runs over the *inferred* slug (`basename(repoPath)`). When a caller supplies an explicit `slug` (via `POST /projects` body or `fleet project add --slug`), `createProjectBody`'s zod schema is `z.string().optional()` — no format constraint at all — and `createProject()` uses it verbatim: `const slug = input.slug ?? inspected.slug;` (`registry/projects.ts:73`). A value like `../../etc/foo` or an absolute path is accepted, unique-constrained, and stored as-is. Nothing in Phase 1 currently derives a filesystem path from `slug`, so this isn't exploitable yet, but it directly undermines the one mitigation this codebase has documented for that future use (T-1-SLUG), and there is no test asserting the override path is constrained the same way the inferred path is (`registry.test.ts` never exercises `--slug` with unsafe characters).

**Fix:** Route the caller-supplied `slug` through the same `deriveSlug()` normalization (or a stricter zod `.regex(/^[a-z0-9._-]+$/)` refinement) before it reaches `createProject`'s insert, so both code paths converge on one guarantee:
```ts
slug: z
  .string()
  .optional()
  .transform((s) => (s === undefined ? undefined : deriveSlug(s))),
```

### WR-02: `task.status` is cast to `TaskState` with no runtime validation and no DB-level constraint — a corrupted/out-of-range value crashes `applyEvent` with an unhandled `TypeError`

**File:** `src/core/event-store/record-event.ts:75`, `src/core/state-machine/transitions.ts:66-71`, `src/db/schema.ts:42`

**Issue:** `tasks.status` is a plain `text` column with no `CHECK` constraint (confirmed in `drizzle/0000_fat_callisto.sql:40`). `recordEvent()` reads it back and does `const currentStatus = task.status as TaskState;` — a compile-time-only assertion with zero runtime check. `applyEvent()` then does `transitions[state][event.type]`; if `state` is not one of the eight literal keys of `transitions`, `transitions[state]` is `undefined`, and indexing `.event.type` on `undefined` throws `TypeError: Cannot read properties of undefined`. This propagates uncaught out of `recordEvent`'s transaction. No code path in the reviewed files currently writes an invalid status (every writer sticks to `TaskState` values), so this is not reachable today — but it is exactly the kind of unhandled edge case (persisted data outliving the code that wrote it, a future migration bug, a manual `sqlite3` edit, or a later plan's raw-SQL seed) the review scope calls out, and there is no defensive guard anywhere in the call chain.

**Fix:** Add a `CHECK (status IN ('queued','running','needs_human','review','approved','rejected','failed','done'))` constraint at the schema/migration level, and/or validate `task.status` against `TASK_STATES` in `toContext`/`recordEvent` before casting, throwing a typed error (not a bare `TypeError`) on an unrecognized value:
```ts
if (!TASK_STATES.includes(task.status as TaskState)) {
  throw new Error(`recordEvent: task "${taskId}" has unrecognized status "${task.status}"`);
}
```

### WR-03: The STATE-05 single-writer enforcement in `single-writer.test.ts` is a regex text-scan and can be silently defeated by a trivially different code shape

**File:** `src/core/event-store/single-writer.test.ts:54-57`

**Issue:** The test's own comments describe STATE-05 as "not a convention a reviewer might miss — it is a machine-enforced invariant," and the scan is deliberately broader than a naive check specifically to have "teeth." But the actual mechanism is four regexes over raw file text: `\.update\s*\(\s*tasks\s*\)`, `\.delete\s*\(\s*tasks\s*\)`, and two raw-SQL variants. Any of the following would write `tasks.status` from a second module while producing zero matches: `db.update(schema.tasks)`, `import { tasks as t } from '../db/schema.js'; db.update(t)`, computed/bracket access, or a `sql` template that doesn't literally contain the substring `UPDATE tasks`/`DELETE FROM tasks` (e.g. built from a variable). Given the invariant is explicitly framed as load-bearing for data-model correctness (the append-only `events` log staying derivable from `tasks`), a regex scan that a single import-alias defeats is a meaningfully weaker guarantee than the comments claim.

**Fix:** At minimum, document the known blind spot inline (aliasing/computed-access evasion) so a future contributor doesn't over-trust the green check. Stronger: replace or supplement the text scan with a TypeScript-AST-based check (e.g. `ts-morph`) that resolves the callee's identifier back to the imported `tasks` symbol regardless of aliasing, or centralize every `tasks` write behind a single exported function that is the *only* symbol other modules are permitted to import for mutation (making the invariant a type/export-surface property instead of a text-pattern property).

### WR-04: `PATCH /projects/:idOrSlug` (and `fleet project update`) cannot actually clear `name`/`env_profile`/`notes`/`tags` even though the internal contract supports it

**File:** `src/api/http/routes/projects.ts:44-51,103-114`, `src/registry/projects.ts:150-155,171-183`, `src/cli/index.ts:207-241`

**Issue:** `UpdateProjectPatch` in `registry/projects.ts` is typed `name?: string | null`, `envProfile?: string | null`, etc., and `updateProject()` correctly implements "explicit `null` clears the field" (`values.name = patch.name ?? null;`). But the HTTP boundary that's the only way to reach this function never allows a caller to send `null`: `updateProjectBody`'s zod fields are all `z.string().optional()` (no `.nullable()`), and JSON has no `undefined`, so a client can only ever send a real string or omit the key entirely — omitting means "leave it alone" per the route's own `'name' in request.body` presence check. The CLI mirrors this: `--notes`, `--env-profile`, etc. only ever produce a string value in the PATCH body, with no flag or sentinel value to request clearing. The internal API's clear-to-null capability is therefore dead code from the outside — unreachable via the only two clients that exist (HTTP, CLI) — and no test in `registry.test.ts` attempts to clear a previously-set field.

**Fix:** Either (a) accept an explicit clearing sentinel at both boundaries (e.g. `z.string().nullable().optional()` plus a CLI convention like `--notes ""` mapping to `null` rather than empty string, or a dedicated `--clear-notes` flag), or (b) if clearing is intentionally out of scope for Phase 1, narrow `UpdateProjectPatch`'s type to `string | undefined` so the type signature doesn't advertise a capability nothing can invoke, and note the deferral explicitly.

### WR-05: `stripUserinfo()` doesn't fully strip credentials from a remote URL whose userinfo component itself contains a literal `@`

**File:** `src/registry/git-inspect.ts:39-42`

**Issue:** `stripUserinfo` is the named mitigation for T-1-CREDURL (not leaking a credential-bearing remote URL into the registry). Its regex is `/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^/@]*@/`, which matches only up to the *first* `@`. For a URL like `https://user:p@ssword@host/repo.git` (a literal, unencoded `@` inside the password — technically non-conformant per RFC 3986 but something `git remote add` will accept without complaint), the regex strips `user:p@` and leaves `ssword@host/repo.git` appended after the scheme — i.e. a credential fragment (`ssword`) survives in the stored `remoteUrl`, and the resulting string is also a malformed URL. This is a narrow edge case (passwords with a raw `@` are uncommon and non-standard), but it's the exact scenario the mitigation exists for.

**Fix:** Match greedily to the *last* `@` before the first `/` after the scheme, rather than the first:
```ts
function stripUserinfo(remote: string): string {
  return remote.replace(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^/]*)@(?=[^@]*\/|[^@]*$)/, (_m, scheme, _userinfo) => scheme);
}
```
or more simply, use the platform `URL` parser (`new URL(remote)`, clear `.username`/`.password`, re-serialize) which handles userinfo parsing per spec instead of a hand-rolled regex.

## Info

### IN-01: `resolvePort()` silently ignores a malformed `port` value in `config.json` instead of the "surface loudly" behavior the module's own doc comment promises

**File:** `src/config.ts:39-46,54-67`

**Issue:** `readConfigFile()`'s doc comment states: "A config file that exists but fails to parse throws — a malformed config the user placed there deliberately should surface loudly, not silently fall back to defaults." That's true for JSON-parse failures, but `resolvePort()`'s `if (typeof configPort === 'number')` check means a `config.json` containing `{"port": "8080"}` (a string, not a number — an easy mistake) silently falls through to `FLEET_DEFAULT_PORT` with no warning, rather than surfacing the type mismatch the way the module's stated intent implies.

**Fix:** Validate the `port` field's type explicitly and throw (or at minimum log a warning) when present-but-wrong-type, rather than treating it identically to "absent":
```ts
if (configPort !== undefined && typeof configPort !== 'number') {
  throw new Error(`config.json: "port" must be a number, got ${typeof configPort}`);
}
if (typeof configPort === 'number') return configPort;
```

---

_Reviewed: 2026-07-23T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
