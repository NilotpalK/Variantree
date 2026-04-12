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
  /**
   * Opaque ref to a code snapshot (e.g., a git commit SHA).
   * Managed by a SnapshotProvider implementation.
   */
  snapshotRef?: string;
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
  /**
   * The OpenCode session ID this workspace is tracking.
   * Set on first sync. Used to avoid re-importing messages from old sessions
   * when a project folder is deleted and recreated at the same path.
   */
  openCodeSessionId?: string;
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

// ─── Snapshot Provider (new, git-backed) ─────────────────────────────────────

/** Summary of what a restore operation changed. */
export interface RestoreSummary {
  /** Files that were written or overwritten */
  written: string[];
  /** Files that were deleted (didn't exist in the snapshot) */
  deleted: string[];
  /** Files that were unchanged (same hash, skipped) */
  skipped: string[];
}

/** Diff between two snapshot states. */
export interface SnapshotDiff {
  /** Files added since the base snapshot */
  added: string[];
  /** Files modified since the base snapshot */
  modified: string[];
  /** Files deleted since the base snapshot */
  deleted: string[];
  /** Files unchanged between snapshots */
  unchanged: string[];
}

/**
 * Snapshot provider that captures and restores entire workspace state.
 *
 * Operates on whole workspace snapshots as atomic units. The default
 * implementation (GitSnapshotProvider) uses git as a hidden storage engine
 * — no user-visible commits, branches, or history pollution.
 */
export interface SnapshotProvider {
  /** Capture the entire workspace state. Returns an opaque ref string. */
  capture(workspacePath: string, label: string): Promise<string>;

  /** Restore workspace files to a previously captured state. */
  restore(workspacePath: string, ref: string): Promise<RestoreSummary>;

  /** Diff between the current workspace and a captured state. */
  diff(workspacePath: string, ref: string): Promise<SnapshotDiff>;

  /** Diff between two captured states. */
  diffRefs(refA: string, refB: string): Promise<SnapshotDiff>;

  /** Delete a captured state (cleanup / garbage collection). */
  drop(ref: string): Promise<void>;
}

// ─── Engine Options ──────────────────────────────────────────────────────────

/** Configuration for the VariantTree engine */
export interface VariantTreeOptions {
  /** Storage backend to use for persistence */
  storage: StorageBackend;
  /** Snapshot provider for code save points (recommended: GitSnapshotProvider) */
  snapshotProvider?: SnapshotProvider;
}

