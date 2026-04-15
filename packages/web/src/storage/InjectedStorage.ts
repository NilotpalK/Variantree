import type { StorageBackend, Workspace } from '@variantree/core';

/**
 * Read-only storage adapter that reads workspace data injected into the page
 * via `window.__VARIANTREE_DATA__`. Used when the web UI is opened from the
 * MCP tool / CLI (`?source=injected`), so it shows real file-system data
 * instead of the browser's IndexedDB.
 */
declare global {
  interface Window {
    __VARIANTREE_DATA__?: Workspace;
  }
}

export class InjectedStorage implements StorageBackend {
  async load(_id: string): Promise<Workspace | null> {
    return window.__VARIANTREE_DATA__ ?? null;
  }

  async save(_id: string, _data: Workspace): Promise<void> {
    // Read-only view — writes are intentionally ignored
  }

  async list(): Promise<string[]> {
    return window.__VARIANTREE_DATA__ ? ['injected'] : [];
  }

  async delete(_id: string): Promise<void> {
    // Read-only view — deletes are intentionally ignored
  }
}

export const injectedStorage = new InjectedStorage();
