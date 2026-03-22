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

// ─── File Storage ────────────────────────────────────────────────────────────

/**
 * File-system storage backend (Node.js only).
 *
 * Stores each workspace as a JSON file:
 *   basePath/
 *     {workspace-id}.json
 *
 * @example
 * ```typescript
 * const storage = new FileStorage('./.variantree');
 * const engine = new VariantTree({ storage });
 * ```
 */
export class FileStorage implements StorageBackend {
  private basePath: string;

  constructor(basePath: string = './.variantree') {
    this.basePath = basePath;
  }

  async save(id: string, data: Workspace): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');

    const dirPath = this.basePath;
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    const filePath = path.join(dirPath, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async load(id: string): Promise<Workspace | null> {
    const fs = await import('fs');
    const path = await import('path');

    const filePath = path.join(this.basePath, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as Workspace;
  }

  async list(): Promise<string[]> {
    const fs = await import('fs');

    if (!fs.existsSync(this.basePath)) {
      return [];
    }

    return fs.readdirSync(this.basePath)
      .filter((f: string) => f.endsWith('.json'))
      .map((f: string) => f.replace('.json', ''));
  }

  async delete(id: string): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');

    const filePath = path.join(this.basePath, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}
