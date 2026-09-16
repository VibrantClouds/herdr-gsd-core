/**
 * OpenCode plugin entry (spec §5.3, docs/spikes/M0-A-hooks.md §3, M0-G-gsd.md §6).
 *
 * Compiled + inlined by `scripts/bundle-hooks.cjs` into a single CommonJS file
 * `dist/herdr-gsd-core.js`, which the installer copies to `<root>/plugins/`
 * next to a `herdr-gsd-core.config.json` holding `{ "spoolDir": "..." }`.
 *
 * Export shape mirrors the live, verified-loading GSD CommonJS plugin
 * (`@opengsd/gsd-core/.opencode/plugins/gsd-core.js`): `module.exports` is a
 * VARIABLE holding `{ server: <plugin fn> }` with a NON-ENUMERABLE `id`, so the
 * loader's `for (const entry of Object.values(mod)) getServerPlugin(entry)`
 * resolves under both raw-CJS (`[fn]`) and ESM-interop (`[{ server }]`) import,
 * and no stray non-function value can reach `getServerPlugin`.
 *
 * Writes spool lines in-process (no subprocess spawn → no CJS marker needed).
 * Never throws: an exception out of `tool.execute.before` ABORTS the tool call,
 * and this plugin must never be able to block the harness.
 */
import { createHooks } from './plugin-core';
import type { PluginContext, PluginHooks } from './plugin-core';

const HerdrGsdCorePlugin = async (ctx: PluginContext = {}): Promise<PluginHooks> => createHooks(ctx, __dirname, process.env);

const pluginExport: { server: typeof HerdrGsdCorePlugin } = { server: HerdrGsdCorePlugin };
Object.defineProperty(pluginExport, 'id', {
  value: 'herdr-gsd-core',
  enumerable: false,
  writable: false,
  configurable: false,
});

export = pluginExport;
