/** Public surface of the Codex adapter (consumed by packages/cli). */
export { doctor, install, uninstall, hooksFilePath, hookCommand, hookScriptPath, desiredEntries, applyInstall, applyUninstall, featuresFlagFinding, EVENTS, OWNER_MARKER, HOOK_TIMEOUT_SECONDS, PROVEN_EVENT } from './install';
export type { AdapterOptions, DoctorFinding, DoctorResult, InstallResult, UninstallResult } from './install';
export { run as runHook } from './hook';
export type { HookKind } from './hook';
export { redactDetail, redactBash, relativePath, shellSplit, MAX_DETAIL } from './redact';
export { defaultSpoolDir, resolveSpoolDir, shortHash, spoolFileForCwd } from './emit';
export type { ActivityEvent, ActivityKind, Harness } from './emit';
