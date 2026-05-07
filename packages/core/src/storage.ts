/**
 * @variantree/core — Storage Backends
 *
 * Pluggable storage for persisting workspaces.
 * The engine never touches storage directly — it goes through the StorageBackend interface.
 */

import { StorageBackend, Workspace } from './types';

// ─── Memory Storage ──────────────────────────────────────────────────────────

/**
 * In-memory storage backend.
 * Data is lost when the process exits. Primarily for testing.
 *
 * @example
 * ```typescript
 * const storage = new MemoryStorage();
 * const engine = new VariantTree({ storage });
 * ```
 */
export class MemoryStorage implements StorageBackend {
  private store: Map<string, Workspace> = new Map();

  async save(id: string, data: Workspace): Promise<void> {
    // Deep clone to prevent mutations from affecting stored data
    this.store.set(id, JSON.parse(JSON.stringify(data)));
  }

  async load(id: string): Promise<Workspace | null> {
    const data = this.store.get(id);
    if (!data) return null;
    // Deep clone to prevent mutations from affecting stored data
    return JSON.parse(JSON.stringify(data));
  }

  async list(): Promise<string[]> {
    return Array.from(this.store.keys());
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

