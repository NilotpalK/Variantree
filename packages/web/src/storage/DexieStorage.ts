import Dexie, { Table } from 'dexie';
import { StorageBackend, Workspace } from '@variantree/core';

/**
 * Dexie (IndexedDB) storage backend for Variantree.
 *
 * Stores each workspace as a single JSON-serialised row in the
 * `workspaces` table, keyed by the workspace ID.
 *
 * Data persists across page reloads in the browser's IndexedDB.
 */

interface WorkspaceRow {
  id: string;
  data: string;       // JSON-serialised Workspace
  updatedAt: number;  // ms timestamp for LRU / "last used" queries
}

class VariantreeDB extends Dexie {
  workspaces!: Table<WorkspaceRow, string>;

  constructor() {
    super('variantree');
    this.version(1).stores({
      // Only id is indexed — data is an opaque blob
      workspaces: 'id, updatedAt',
    });
  }
}

const db = new VariantreeDB();

export class DexieStorage implements StorageBackend {
  async save(id: string, workspace: Workspace): Promise<void> {
    await db.workspaces.put({
      id,
      data: JSON.stringify(workspace),
      updatedAt: Date.now(),
    });
  }

  async load(id: string): Promise<Workspace | null> {
    const row = await db.workspaces.get(id);
    if (!row) return null;
    return JSON.parse(row.data) as Workspace;
  }

  async list(): Promise<string[]> {
    const rows = await db.workspaces
      .orderBy('updatedAt')
      .reverse()
      .primaryKeys();
    return rows as string[];
  }

  async delete(id: string): Promise<void> {
    await db.workspaces.delete(id);
  }

  /** Returns the most-recently-used workspace ID, or null if none exist. */
  async getLastWorkspaceId(): Promise<string | null> {
    const row = await db.workspaces.orderBy('updatedAt').last();
    return row?.id ?? null;
  }
}

/** Singleton instance shared across the app */
export const dexieStorage = new DexieStorage();
