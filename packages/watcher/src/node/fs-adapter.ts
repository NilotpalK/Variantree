/**
 * @variantree/watcher — Node.js FileSystemAdapter
 *
 * Implements FileSystemAdapter using Node.js fs module.
 * Respects .gitignore and always skips .variantree/, node_modules/, .git/.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { FileSystemAdapter } from '@variantree/core';

const ALWAYS_SKIP = new Set([
  'node_modules',
  '.variantree',
  '.venv',
  'venv',
  '.git',
  '.DS_Store',
  'dist',
  'opencode.json',
  '.opencode',
  '.vscode',
  '.idea',
]);

export class NodeFileSystem implements FileSystemAdapter {
  private gitignorePatterns: string[] | null = null;

  private async loadGitignore(rootPath: string): Promise<string[]> {
    if (this.gitignorePatterns) return this.gitignorePatterns;
    try {
      const raw = await fs.readFile(path.join(rootPath, '.gitignore'), 'utf8');
      this.gitignorePatterns = raw
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
    } catch {
      this.gitignorePatterns = [];
    }
    return this.gitignorePatterns;
  }

  private shouldIgnore(relativePath: string, patterns: string[]): boolean {
    const parts = relativePath.split(path.sep);
    // Skip if any path segment is in ALWAYS_SKIP
    for (const part of parts) {
      if (ALWAYS_SKIP.has(part)) return true;
    }
    // Simple gitignore matching: check if filename or relative path matches a pattern
    const basename = parts[parts.length - 1];
    for (const pattern of patterns) {
      if (pattern.endsWith('/')) {
        // Directory pattern
        const dirName = pattern.slice(0, -1);
        if (parts.includes(dirName)) return true;
      } else if (pattern.startsWith('*.')) {
        // Extension glob
        const ext = pattern.slice(1); // e.g. ".log"
        if (basename.endsWith(ext)) return true;
      } else if (pattern.includes('/')) {
        // Path pattern
        if (relativePath.startsWith(pattern)) return true;
      } else {
        // Exact name match
        if (basename === pattern || parts.includes(pattern)) return true;
      }
    }
    return false;
  }

  async listFiles(rootPath: string): Promise<string[]> {
    const patterns = await this.loadGitignore(rootPath);
    const results: string[] = [];

    const walk = async (dir: string) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        const rel = path.relative(rootPath, full);
        if (this.shouldIgnore(rel, patterns)) continue;
        if (entry.isDirectory()) {
          await walk(full);
        } else {
          results.push(rel);
        }
      }
    };

    await walk(rootPath);
    return results;
  }

  async readFile(filePath: string): Promise<Uint8Array> {
    const buf = await fs.readFile(filePath);
    return new Uint8Array(buf);
  }

  async writeFile(filePath: string, content: Buffer | Uint8Array): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch { /* already gone */ }
  }
}
