/**
 * @variantree/core — Public API
 *
 * Version control for AI conversations.
 * https://github.com/NilotpalK/Variantree
 */

// Core engine
export { VariantTree } from './engine';

export type {
  Message,
  Branch,
  Checkpoint,
  Workspace,
  StorageBackend,
  VariantTreeOptions,
  FileEntry,
  Snapshot,
  SnapshotStorage,
  FileSystemAdapter,
} from './types';

// Storage backends
export { MemoryStorage, FileStorage } from './storage';

// Utilities (exposed for advanced usage)
export { resolveContext, getBranchAncestry } from './context';
export { generateId, hashContent } from './utils';

// Snapshot engine
export { createSnapshot, restoreSnapshot, diffSnapshot } from './snapshot';
export type { RestoreSummary, SnapshotDiff } from './snapshot';
