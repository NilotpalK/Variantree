import { describe, it, expect, beforeEach } from 'vitest';
import { createSnapshot, restoreSnapshot, diffSnapshot } from '../snapshot';
import type { SnapshotStorage, FileSystemAdapter } from '../types';

// ─── In-Memory Test Implementations ─────────────────────────────────────────

/** In-memory blob store for testing */
class MemoryBlobStore implements SnapshotStorage {
  private blobs = new Map<string, Uint8Array>();

  async writeBlob(hash: string, content: Buffer | Uint8Array) {
    if (!this.blobs.has(hash)) {
      this.blobs.set(hash, new Uint8Array(content));
    }
  }

  async readBlob(hash: string) {
    return this.blobs.get(hash) ?? null;
  }

  async hasBlob(hash: string) {
    return this.blobs.has(hash);
  }

  async deleteBlob(hash: string) {
    this.blobs.delete(hash);
  }

  get size() {
    return this.blobs.size;
  }
}

/** In-memory filesystem for testing */
class MemoryFileSystem implements FileSystemAdapter {
  files = new Map<string, Uint8Array>();

  /** Helper: set a file for test setup */
  setFile(path: string, content: string) {
    this.files.set(path, new TextEncoder().encode(content));
  }

  /** Helper: get a file's string content */
  getFileContent(path: string): string | null {
    const data = this.files.get(path);
    return data ? new TextDecoder().decode(data) : null;
  }

  /** Helper: check if a file exists */
  hasFile(path: string): boolean {
    return this.files.has(path);
  }

  /** Strip root prefix: "/workspace/src/auth.ts" → "src/auth.ts" */
  private stripRoot(fullPath: string, rootPath: string): string {
    const prefix = rootPath.endsWith('/') ? rootPath : rootPath + '/';
    return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath;
  }

  async listFiles(_rootPath: string) {
    return Array.from(this.files.keys());
  }

  async readFile(filePath: string) {
    // Try full path first, then try stripping common root
    const content = this.files.get(filePath)
      ?? this.files.get(this.stripRoot(filePath, '/workspace'));
    if (!content) {
      throw new Error(`File not found: ${filePath}`);
    }
    return content;
  }

  async writeFile(filePath: string, content: Buffer | Uint8Array) {
    const key = this.stripRoot(filePath, '/workspace');
    this.files.set(key, new Uint8Array(content));
  }

  async deleteFile(filePath: string) {
    const key = this.stripRoot(filePath, '/workspace');
    this.files.delete(key);
  }
}


// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Snapshot Engine', () => {
  let blobStore: MemoryBlobStore;
  let fs: MemoryFileSystem;
  const ROOT = '/workspace';

  beforeEach(() => {
    blobStore = new MemoryBlobStore();
    fs = new MemoryFileSystem();
  });

  // ─── createSnapshot ─────────────────────────────────────────────────────

  describe('createSnapshot', () => {
    it('should create a snapshot of all workspace files', async () => {
      fs.setFile('auth.ts', 'export function auth() {}');
      fs.setFile('server.ts', 'const app = express()');
      fs.setFile('config.ts', 'export default {}');

      const snapshot = await createSnapshot(ROOT, fs, blobStore);

      expect(snapshot.fileCount).toBe(3);
      expect(snapshot.files).toHaveLength(3);
      expect(snapshot.totalSize).toBeGreaterThan(0);
      expect(snapshot.createdAt).toBeGreaterThan(0);

      // All files should have hashes
      for (const file of snapshot.files) {
        expect(file.hash).toBeDefined();
        expect(file.hash.length).toBe(64); // SHA-256 hex
        expect(file.size).toBeGreaterThan(0);
      }

      // 3 unique files → 3 blobs stored
      expect(blobStore.size).toBe(3);
    });

    it('should deduplicate identical files', async () => {
      const sameContent = 'export default {}';
      fs.setFile('config.ts', sameContent);
      fs.setFile('settings.ts', sameContent); // Same content

      const snapshot = await createSnapshot(ROOT, fs, blobStore);

      expect(snapshot.fileCount).toBe(2);
      // Same content → same hash → only 1 blob stored
      expect(blobStore.size).toBe(1);
      expect(snapshot.files[0].hash).toBe(snapshot.files[1].hash);
    });

    it('should sort files by path', async () => {
      fs.setFile('z-last.ts', 'z');
      fs.setFile('a-first.ts', 'a');
      fs.setFile('m-middle.ts', 'm');

      const snapshot = await createSnapshot(ROOT, fs, blobStore);

      expect(snapshot.files.map((f) => f.path)).toEqual([
        'a-first.ts',
        'm-middle.ts',
        'z-last.ts',
      ]);
    });

    it('should handle empty workspace', async () => {
      const snapshot = await createSnapshot(ROOT, fs, blobStore);

      expect(snapshot.fileCount).toBe(0);
      expect(snapshot.files).toEqual([]);
      expect(snapshot.totalSize).toBe(0);
      expect(blobStore.size).toBe(0);
    });

    it('should not re-store blobs that already exist', async () => {
      fs.setFile('auth.ts', 'export function auth() {}');

      // Take first snapshot
      const snap1 = await createSnapshot(ROOT, fs, blobStore);
      expect(blobStore.size).toBe(1);

      // Take second snapshot — same file, blob should not be re-stored
      const snap2 = await createSnapshot(ROOT, fs, blobStore);
      expect(blobStore.size).toBe(1); // Still 1, not 2
      expect(snap1.files[0].hash).toBe(snap2.files[0].hash);
    });
  });

  // ─── restoreSnapshot ────────────────────────────────────────────────────

  describe('restoreSnapshot', () => {
    it('should restore workspace to snapshot state', async () => {
      // Setup: original state
      fs.setFile('auth.ts', 'v1');
      fs.setFile('server.ts', 'original');

      const snapshot = await createSnapshot(ROOT, fs, blobStore);

      // Modify the workspace
      fs.setFile('auth.ts', 'v2-changed');
      fs.setFile('newfile.ts', 'should be deleted');

      // Restore
      const summary = await restoreSnapshot(ROOT, snapshot, fs, blobStore);

      // auth.ts should be back to v1
      expect(fs.getFileContent('auth.ts')).toBe('v1');
      // server.ts unchanged
      expect(fs.getFileContent('server.ts')).toBe('original');
      // newfile.ts should be deleted
      expect(fs.hasFile('newfile.ts')).toBe(false);

      expect(summary.written).toContain('auth.ts');
      expect(summary.deleted).toContain('newfile.ts');
      expect(summary.skipped).toContain('server.ts');
    });

    it('should restore deleted files', async () => {
      fs.setFile('important.ts', 'do not lose me');

      const snapshot = await createSnapshot(ROOT, fs, blobStore);

      // Delete the file
      fs.files.delete('important.ts');
      expect(fs.hasFile('important.ts')).toBe(false);

      // Restore
      await restoreSnapshot(ROOT, snapshot, fs, blobStore);

      expect(fs.hasFile('important.ts')).toBe(true);
      expect(fs.getFileContent('important.ts')).toBe('do not lose me');
    });

    it('should delete files that did not exist at checkpoint', async () => {
      fs.setFile('original.ts', 'was here');

      const snapshot = await createSnapshot(ROOT, fs, blobStore);

      // Add new files after checkpoint
      fs.setFile('added-later.ts', 'new file');
      fs.setFile('also-new.ts', 'another new file');

      // Restore
      const summary = await restoreSnapshot(ROOT, snapshot, fs, blobStore);

      expect(fs.hasFile('added-later.ts')).toBe(false);
      expect(fs.hasFile('also-new.ts')).toBe(false);
      expect(summary.deleted).toContain('added-later.ts');
      expect(summary.deleted).toContain('also-new.ts');
    });

    it('should skip unchanged files (optimization)', async () => {
      fs.setFile('stable.ts', 'never changes');
      fs.setFile('changes.ts', 'v1');

      const snapshot = await createSnapshot(ROOT, fs, blobStore);

      // Only modify one file
      fs.setFile('changes.ts', 'v2');

      const summary = await restoreSnapshot(ROOT, snapshot, fs, blobStore);

      expect(summary.skipped).toContain('stable.ts');
      expect(summary.written).toContain('changes.ts');
    });

    it('should throw if blob is missing', async () => {
      fs.setFile('auth.ts', 'content');

      const snapshot = await createSnapshot(ROOT, fs, blobStore);

      // Corrupt: delete the blob
      const hash = snapshot.files[0].hash;
      await blobStore.deleteBlob(hash);

      // Modify the file so restore tries to read the blob
      fs.setFile('auth.ts', 'different');

      await expect(
        restoreSnapshot(ROOT, snapshot, fs, blobStore)
      ).rejects.toThrow('Blob');
    });
  });

  // ─── diffSnapshot ──────────────────────────────────────────────────────

  describe('diffSnapshot', () => {
    it('should detect added, modified, deleted, and unchanged files', async () => {
      fs.setFile('unchanged.ts', 'same');
      fs.setFile('will-modify.ts', 'v1');
      fs.setFile('will-delete.ts', 'going away');

      const snapshot = await createSnapshot(ROOT, fs, blobStore);

      // Make changes
      fs.setFile('will-modify.ts', 'v2');
      fs.files.delete('will-delete.ts');
      fs.setFile('brand-new.ts', 'just created');

      const diff = await diffSnapshot(ROOT, snapshot, fs);

      expect(diff.unchanged).toContain('unchanged.ts');
      expect(diff.modified).toContain('will-modify.ts');
      expect(diff.deleted).toContain('will-delete.ts');
      expect(diff.added).toContain('brand-new.ts');
    });

    it('should report all unchanged when nothing changed', async () => {
      fs.setFile('a.ts', 'content-a');
      fs.setFile('b.ts', 'content-b');

      const snapshot = await createSnapshot(ROOT, fs, blobStore);
      const diff = await diffSnapshot(ROOT, snapshot, fs);

      expect(diff.unchanged).toHaveLength(2);
      expect(diff.added).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
      expect(diff.deleted).toHaveLength(0);
    });
  });
});
