/** Public surface of the OpenCode adapter (consumed by packages/cli). */
export { doctor, install, uninstall, opencodeRoot, pluginsDir, installedPluginPath, installedConfigPath, bundlePath, classifyPluginDirMarker, markerFinding, configContents, PLUGIN_FILENAME, CONFIG_FILENAME, PLUGIN_DIRNAME } from './install';
export type { AdapterOptions, DoctorFinding, DoctorResult, InstallResult, MarkerClass, UninstallResult } from './install';
export { createHooks, readSpoolDir } from './plugin-core';
export type { PluginContext, PluginHooks } from './plugin-core';
export { redactDetail, redactBash, relativePath, shellSplit, MAX_DETAIL } from './redact';
export { defaultSpoolDir, resolveSpoolDir, shortHash, spoolFileForCwd } from './emit';
export type { ActivityEvent, ActivityKind, Harness } from './emit';
