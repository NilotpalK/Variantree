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
export { NodeBlobStore } from './node/blob-store.js';
export { NodeFileSystem } from './node/fs-adapter.js';
