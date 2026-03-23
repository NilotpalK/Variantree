/**
 * @variantree/core — Type definitions
 *
 * Core data structures for conversation branching and checkpoint management.
 * Designed for efficient path-based context resolution with zero message duplication.
 */

// ─── Messages ────────────────────────────────────────────────────────────────

/** A single message in a conversation. */
export interface Message {
  /** Unique identifier for this message */
  id: string;
  /** Who sent the message */
  role: 'user' | 'assistant' | 'system';
  /** Text content of the message */
  content: string;
  /** Unix timestamp (ms) when the message was created */
  timestamp: number;
  /** Extensible metadata (e.g., injected_from, model, tokens) */
  metadata?: Record<string, unknown>;
}

// ─── Branches ────────────────────────────────────────────────────────────────

/**
 * A branch represents a conversation path.
 *
 * Each branch stores ONLY the messages created within it — not the full
 * conversation history. To reconstruct full context, walk up the tree
 * via parentCheckpointId → checkpoint → parent branch.
 */
export interface Branch {
  /** Unique identifier for this branch */
  id: string;
  /** Human-readable name (e.g., "main", "explore-oauth") */
  name: string;
  /**
   * The checkpoint this branch was forked from.
   * null for the root branch ("main").
   */
  parentCheckpointId: string | null;
  /** Messages created in THIS branch only (not inherited) */
  messages: Message[];
  /** Unix timestamp (ms) when the branch was created */
  createdAt: number;
}

// ─── Checkpoints ─────────────────────────────────────────────────────────────

/**
 * A checkpoint is a named save point within a branch.
 *
 * Checkpoints mark decision points where the user might want to branch.
 * They reference a position within a branch's message array.
 */
export interface Checkpoint {
  /** Unique identifier (content-addressed hash) */
  id: string;
  /** User-facing label (e.g., "Decided on JWT") */
  label: string;
  /** Which branch this checkpoint lives on */
  branchId: string;
  /**
   * Checkpoint is placed AFTER this message index in the branch.
   * -1 means checkpoint is at the start (before any messages).
   * 0 means after the first message, etc.
   */
  messageIndex: number;
  /** Unix timestamp (ms) when the checkpoint was created */
  createdAt: number;
  /** Extensible metadata (e.g., future code snapshot references) */
  metadata?: Record<string, unknown>;
  /** Optional code snapshot — full workspace state at this checkpoint */
  snapshot?: Snapshot;
}

// ─── Code Snapshots ──────────────────────────────────────────────────────────

/**
 * A single file entry in a snapshot.
 * Stores the file path and the content hash (blob reference).
 */
export interface FileEntry {
  /** Relative path from workspace root (e.g., "src/auth.ts") */
  path: string;
  /** SHA-256 hash of the file contents — used as blob key */
  hash: string;
  /** File size in bytes */
  size: number;
}

/**
 * A snapshot is a complete manifest of every file in the workspace
 * at a specific point in time. The actual file contents are stored
 * as blobs in a SnapshotStorage backend, keyed by their content hash.
 */
export interface Snapshot {
  /** All files in the workspace at this point */
  files: FileEntry[];
  /** Total number of files */
  fileCount: number;
  /** Total size of all files in bytes */
  totalSize: number;
  /** Unix timestamp (ms) when the snapshot was taken */
  createdAt: number;
}

/**
 * Abstract blob storage for file snapshots.
 *
 * Content-addressable: blobs are stored by their SHA-256 hash.
 * Duplicate content is stored only once (deduplication).
 *
 * Implement this for your environment:
 *   - IDE extension: write blobs to `.variantree/blobs/` on disk
 *   - Browser: store in IndexedDB via Dexie
 */
export interface SnapshotStorage {
  /** Store a blob. If the hash already exists, this is a no-op. */
  writeBlob(hash: string, content: Buffer | Uint8Array): Promise<void>;
  /** Read a blob by its content hash. Returns null if not found. */
  readBlob(hash: string): Promise<Buffer | Uint8Array | null>;
  /** Check if a blob exists (avoids re-storing unchanged files). */
  hasBlob(hash: string): Promise<boolean>;
  /** Delete a blob (used during garbage collection). */
  deleteBlob(hash: string): Promise<void>;
}

/**
 * Abstract filesystem adapter for reading/writing workspace files.
 *
 * Implement this for your environment:
 *   - IDE extension: use Node.js `fs` module
 *   - Browser: use File System Access API
 */
export interface FileSystemAdapter {
  /** List all file paths in the workspace (relative paths, respecting ignores). */
  listFiles(rootPath: string): Promise<string[]>;
  /** Read a file's contents as bytes. */
  readFile(filePath: string): Promise<Buffer | Uint8Array>;
  /** Write bytes to a file (creating directories as needed). */
  writeFile(filePath: string, content: Buffer | Uint8Array): Promise<void>;
  /** Delete a file. */
  deleteFile(filePath: string): Promise<void>;
}

// ─── Workspace ───────────────────────────────────────────────────────────────

/**
 * A workspace is the top-level container for a conversation tree.
 *
 * It holds all branches and checkpoints. One workspace = one conversation
 * with all its branches and exploration history.
 */
export interface Workspace {
  /** Unique identifier for this workspace */
  id: string;
  /** User-facing title (e.g., "Auth system design") */
  title: string;
  /** All branches, keyed by branch ID */
  branches: Record<string, Branch>;
  /** All checkpoints, keyed by checkpoint ID */
  checkpoints: Record<string, Checkpoint>;
  /** The currently active branch ID */
  activeBranchId: string;
  /** Unix timestamp (ms) when the workspace was created */
  createdAt: number;
  /** Unix timestamp (ms) of last modification */
  updatedAt: number;
}

// ─── Storage ─────────────────────────────────────────────────────────────────

/**
 * Abstract storage backend interface.
 *
 * Implement this to add custom persistence (PostgreSQL, Redis, etc.).
 * The engine is storage-agnostic — it only interacts through this interface.
 */
export interface StorageBackend {
  /** Persist a workspace */
  save(id: string, data: Workspace): Promise<void>;
  /** Load a workspace by ID */
  load(id: string): Promise<Workspace | null>;
  /** List all workspace IDs */
  list(): Promise<string[]>;
  /** Delete a workspace by ID */
  delete(id: string): Promise<void>;
}

// ─── Engine Options ──────────────────────────────────────────────────────────

/** Configuration for the VariantTree engine */
export interface VariantTreeOptions {
  /** Storage backend to use for persistence */
  storage: StorageBackend;
  /** Optional: snapshot storage for code save points */
  snapshotStorage?: SnapshotStorage;
  /** Optional: filesystem adapter for reading/writing workspace files */
  fileSystem?: FileSystemAdapter;
}

