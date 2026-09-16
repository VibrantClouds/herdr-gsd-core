/** Public surface of the Claude Code adapter (consumed by packages/cli). */
export { doctor, install, uninstall, settingsPath, hookCommand, hookScriptPath, desiredEntries, applyInstall, applyUninstall, EVENTS, OWNER_MARKER, HOOK_TIMEOUT_SECONDS, PRE_TOOL_MATCHER, POST_TOOL_MATCHER } from './install';
export type { AdapterOptions, DoctorFinding, DoctorResult, InstallResult, UninstallResult } from './install';
export { run as runHook } from './hook';
export type { HookKind } from './hook';
export { redactDetail, redactBash, relativePath, shellSplit, MAX_DETAIL } from './redact';
export { defaultSpoolDir, resolveSpoolDir, shortHash, spoolFileForCwd } from './emit';
export type { ActivityEvent, ActivityKind, Harness } from './emit';
