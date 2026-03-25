/**
 * @variantree/watcher — Node.js StorageBackend
 *
 * Persists Variantree workspace state to .variantree/workspace.json
 * in the project directory.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { StorageBackend, Workspace } from '@variantree/core';

export class NodeStorage implements StorageBackend {
  private readonly dir: string;
  private readonly filePath: string;

  constructor(workspacePath: string) {
    this.dir = path.join(workspacePath, '.variantree');
    this.filePath = path.join(this.dir, 'workspace.json');
  }

  async save(workspaceId: string, workspace: Workspace): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    let data: Record<string, Workspace> = {};
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      data = JSON.parse(raw);
    } catch { /* first write */ }
    data[workspaceId] = workspace;
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  async load(workspaceId: string): Promise<Workspace | null> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const data: Record<string, Workspace> = JSON.parse(raw);
      return data[workspaceId] ?? null;
    } catch {
      return null;
    }
  }

  async list(): Promise<string[]> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      return Object.keys(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  async delete(workspaceId: string): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const data: Record<string, Workspace> = JSON.parse(raw);
      delete data[workspaceId];
      await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch { /* nothing to delete */ }
  }
}
