/**
 * @variantree/watcher — Public API
 */

// Core watcher
export { VariantreeWatcher } from './watcher.js';
export type { WatcherOptions } from './watcher.js';

// Message differ
export { MessageDiffer } from './differ.js';

// Session adapters
export { OpenCodeAdapter } from './adapters/opencode.js';
export type { SessionAdapter } from './adapters/base.js';

// Node.js adapters
export { NodeStorage } from './node/storage.js';

// Git-backed snapshot provider
export { GitSnapshotProvider } from './node/git-snapshot.js';

// Session launcher
export { launchOpenCodeSession } from './node/session-launcher.js';
export type { LaunchResult } from './node/session-launcher.js';

// AGENTS.md helpers
export { AGENTS_MD_SECTION, mergeAgentsMd } from './agents-md.js';
