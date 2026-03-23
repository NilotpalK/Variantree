/**
 * @variantree/core — Snapshot Engine
 *
 * Content-addressable file snapshots for workspace save points.
 * Works like Git's object model: files are hashed, stored as blobs,
 * and checkpoints reference a tree manifest of {path, hash} entries.
 *
 * Deduplication: identical files across checkpoints are stored only once.
 */

import { createHash } from 'crypto';
import {
  FileEntry,
  Snapshot,
  SnapshotStorage,
  FileSystemAdapter,
} from './types';
import { now } from './utils';

/**
 * Hash file contents using SHA-256.
 * This is the content-addressable key used for deduplication.
 */
function hashBytes(content: Buffer | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Create a snapshot of the workspace at the current moment.
 *
 * 1. Lists all files in the workspace (respecting ignores)
 * 2. Hashes each file's content
 * 3. Stores only NEW blobs (skips if hash already exists)
 * 4. Returns a manifest of all files with their content hashes
 *
 * @param rootPath - Absolute path to the workspace root
 * @param fs - Filesystem adapter for reading files
 * @param blobStore - Blob storage backend
 * @returns A snapshot manifest
 */
export async function createSnapshot(
  rootPath: string,
  fs: FileSystemAdapter,
  blobStore: SnapshotStorage,
): Promise<Snapshot> {
  const filePaths = await fs.listFiles(rootPath);
  const files: FileEntry[] = [];
  let totalSize = 0;

  // Process files in parallel for speed
  await Promise.all(
    filePaths.map(async (relativePath) => {
      const fullPath = `${rootPath}/${relativePath}`;
      const content = await fs.readFile(fullPath);
      const hash = hashBytes(content);
      const size = content.byteLength;

      // Dedup: only store blob if it's new
      const exists = await blobStore.hasBlob(hash);
      if (!exists) {
        await blobStore.writeBlob(hash, content);
      }

      files.push({ path: relativePath, hash, size });
      totalSize += size;
    }),
  );

  // Sort files by path for consistent manifests
  files.sort((a, b) => a.path.localeCompare(b.path));

  return {
    files,
    fileCount: files.length,
    totalSize,
    createdAt: now(),
  };
}

/**
 * Restore a workspace to the state captured in a snapshot.
 *
 * Performs a 3-way reconciliation:
 *   - Files in snapshot but not on disk → WRITE (restored)
 *   - Files on disk but not in snapshot → DELETE (didn't exist at that point)
 *   - Files in both, different hash    → OVERWRITE (was modified)
 *   - Files in both, same hash         → SKIP (unchanged, save I/O)
 *
 * @param rootPath - Absolute path to the workspace root
 * @param snapshot - The snapshot to restore
 * @param fs - Filesystem adapter for writing/deleting files
 * @param blobStore - Blob storage backend
 * @returns Summary of what was changed
 */
export async function restoreSnapshot(
  rootPath: string,
  snapshot: Snapshot,
  fs: FileSystemAdapter,
  blobStore: SnapshotStorage,
): Promise<RestoreSummary> {
  const summary: RestoreSummary = {
    written: [],
    deleted: [],
    skipped: [],
  };

  // Build a map of the snapshot's desired state
  const snapshotMap = new Map<string, FileEntry>();
  for (const entry of snapshot.files) {
    snapshotMap.set(entry.path, entry);
  }

  // Get current files on disk
  const currentFiles = await fs.listFiles(rootPath);
  const currentSet = new Set(currentFiles);

  // Phase 1: Write/overwrite files from snapshot
  await Promise.all(
    snapshot.files.map(async (entry) => {
      const fullPath = `${rootPath}/${entry.path}`;

      if (currentSet.has(entry.path)) {
        // File exists — check if hash matches
        const currentContent = await fs.readFile(fullPath);
        const currentHash = hashBytes(currentContent);

        if (currentHash === entry.hash) {
          summary.skipped.push(entry.path);
          return; // Unchanged, skip
        }
      }

      // File missing or changed — restore from blob
      const blob = await blobStore.readBlob(entry.hash);
      if (!blob) {
        throw new Error(
          `Blob "${entry.hash}" not found for file "${entry.path}". Snapshot may be corrupted.`,
        );
      }
      await fs.writeFile(fullPath, blob);
      summary.written.push(entry.path);
    }),
  );

  // Phase 2: Delete files not in the snapshot
  for (const currentPath of currentFiles) {
    if (!snapshotMap.has(currentPath)) {
      await fs.deleteFile(`${rootPath}/${currentPath}`);
      summary.deleted.push(currentPath);
    }
  }

  return summary;
}

/** Summary of what a restore operation changed. */
export interface RestoreSummary {
  /** Files that were written or overwritten */
  written: string[];
  /** Files that were deleted (didn't exist in the snapshot) */
  deleted: string[];
  /** Files that were unchanged (same hash, skipped) */
  skipped: string[];
}

/**
 * Compute the diff between the current workspace and a snapshot.
 * Useful for showing what would change before restoring.
 *
 * @param rootPath - Workspace root
 * @param snapshot - The snapshot to compare against
 * @param fs - Filesystem adapter
 * @returns Lists of added, modified, deleted, and unchanged files
 */
export async function diffSnapshot(
  rootPath: string,
  snapshot: Snapshot,
  fs: FileSystemAdapter,
): Promise<SnapshotDiff> {
  const diff: SnapshotDiff = {
    added: [],
    modified: [],
    deleted: [],
    unchanged: [],
  };

  const snapshotMap = new Map<string, FileEntry>();
  for (const entry of snapshot.files) {
    snapshotMap.set(entry.path, entry);
  }

  const currentFiles = await fs.listFiles(rootPath);
  const currentSet = new Set(currentFiles);

  // Files on disk: are they in the snapshot?
  for (const filePath of currentFiles) {
    const snapshotEntry = snapshotMap.get(filePath);

    if (!snapshotEntry) {
      // On disk but not in snapshot → would be deleted on restore
      diff.added.push(filePath); // "added since snapshot"
      continue;
    }

    // Both exist — compare hashes
    const content = await fs.readFile(`${rootPath}/${filePath}`);
    const currentHash = hashBytes(content);

    if (currentHash === snapshotEntry.hash) {
      diff.unchanged.push(filePath);
    } else {
      diff.modified.push(filePath);
    }
  }

  // Files in snapshot but not on disk → would be restored
  for (const [path] of snapshotMap) {
    if (!currentSet.has(path)) {
      diff.deleted.push(path); // "deleted since snapshot"
    }
  }

  return diff;
}

/** Diff between current workspace state and a snapshot. */
export interface SnapshotDiff {
  /** Files added since the snapshot (will be deleted on restore) */
  added: string[];
  /** Files modified since the snapshot (will be overwritten on restore) */
  modified: string[];
  /** Files deleted since the snapshot (will be restored) */
  deleted: string[];
  /** Files unchanged since the snapshot */
  unchanged: string[];
}
