/**
 * @variantree/watcher — Public API
 */

// Core watcher
export { VariantreeWatcher } from './watcher.js';
export type { WatcherOptions } from './watcher.js';

// Message differ
export { MessageDiffer } from './differ.js';

// Node.js storage + snapshot
export { NodeStorage } from './node/storage.js';
export { GitSnapshotProvider } from './node/git-snapshot.js';

// Session launcher
export { launchOpenCodeSession } from './node/session-launcher.js';
export type { LaunchResult } from './node/session-launcher.js';

// Tool integrations
export {
  ALL_TOOLS,
  ensureProjectInstructions,
  registerAllMcp,
} from './tools/index.js';
export type { ToolIntegration, SessionAdapter } from './tools/index.js';

// OpenCode (primary adapter — used by MCP server and CLI directly)
export { OpenCodeAdapter, mergeAgentsMd } from './tools/opencode/index.js';

// Claude Code
export { ClaudeCodeAdapter } from './tools/claudecode/index.js';

// Shared sync (adapter-agnostic — works with OpenCode, Claude Code, etc.)
export { syncConversation } from './sync.js';
export type { SyncResult } from './sync.js';

// Backwards-compat re-export (old import path: adapters/opencode)
export { VARIANTREE_MARKER, mergeInstructions } from './tools/index.js';
