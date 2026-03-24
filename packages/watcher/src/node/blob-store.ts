/**
 * @variantree/watcher — Node.js BlobStore
 *
 * Stores content-addressed blobs in .variantree/blobs/<hash>
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { SnapshotStorage } from '@variantree/core';

export class NodeBlobStore implements SnapshotStorage {
  private readonly blobsDir: string;

  constructor(workspacePath: string) {
    this.blobsDir = path.join(workspacePath, '.variantree', 'blobs');
  }

  private blobPath(hash: string): string {
    // Split into 2-char prefix dir for better filesystem performance
    return path.join(this.blobsDir, hash.slice(0, 2), hash.slice(2));
  }

  async writeBlob(hash: string, content: Buffer | Uint8Array): Promise<void> {
    const p = this.blobPath(hash);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, content);
  }

  async readBlob(hash: string): Promise<Uint8Array | null> {
    try {
      const buf = await fs.readFile(this.blobPath(hash));
      return new Uint8Array(buf);
    } catch {
      return null;
    }
  }

  async hasBlob(hash: string): Promise<boolean> {
    try {
      await fs.access(this.blobPath(hash));
      return true;
    } catch {
      return false;
    }
  }

  async deleteBlob(hash: string): Promise<void> {
    try {
      await fs.unlink(this.blobPath(hash));
    } catch { /* already gone */ }
  }
}
