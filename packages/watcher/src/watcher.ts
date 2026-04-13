/**
 * @variantree/watcher — VariantreeWatcher
 *
 * Watches an AI tool's session for new messages using chokidar.
 * On every change event:
 *   1. Reads messages via the adapter's readMessagesAsync
 *   2. Diffs to find new messages
 *   3. Adds new messages to the active Variantree branch
 */

import chokidar, { type FSWatcher } from 'chokidar';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { VariantTree } from '@variantree/core';
import type { SessionAdapter } from './tools/base.js';
import { MessageDiffer } from './differ.js';

export interface WatcherOptions {
  /** Absolute path to the workspace being watched */
  workspacePath: string;
  /** Session adapter for the AI tool (e.g. OpenCodeAdapter) */
  adapter: SessionAdapter;
  /** Pre-configured VariantTree engine instance */
  engine: VariantTree;
  /** Called when new messages are synced (optional, for logging) */
  onSync?: (count: number) => void;
  /** Called on errors (optional) */
  onError?: (err: Error) => void;
}

export class VariantreeWatcher {
  private watcher: FSWatcher | null = null;
  private readonly differ = new MessageDiffer();
  private readonly opts: WatcherOptions;
  private sessionId: string | null = null;

  constructor(opts: WatcherOptions) {
    this.opts = opts;
  }

  async start(): Promise<void> {
    const { workspacePath, adapter, engine, onSync, onError } = this.opts;

    this.sessionId = await adapter.getCurrentSessionId(workspacePath);
    if (!this.sessionId) {
      console.warn(`[variantree] No ${adapter.name} session found for ${workspacePath}`);
      return;
    }

    // For OpenCode: watch the WAL file (changes on every DB write)
    // For Claude Code: watch the JSONL session file directly
    const watchTarget = this.resolveWatchTarget(workspacePath);
    console.log(`[variantree] Watching ${adapter.name} session for ${workspacePath}`);

    const sync = async () => {
      try {
        // Re-discover session on each tick in case a new session started
        const currentId = await adapter.getCurrentSessionId(workspacePath);
        if (currentId && currentId !== this.sessionId) {
          this.sessionId = currentId;
          this.differ.reset();
        }
        if (!this.sessionId) return;

        const allMessages = await adapter.readMessagesAsync(workspacePath, this.sessionId);
        const newMessages = this.differ.diff(allMessages);

        for (const msg of newMessages) {
          await engine.addMessage(msg.role, msg.content, { source: adapter.name });
        }
        if (newMessages.length > 0) onSync?.(newMessages.length);
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    };

    this.watcher = chokidar.watch(watchTarget, {
      persistent: true,
      usePolling: false,
      interval: 2000,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    });

    this.watcher.on('change', sync);
    this.watcher.on('error', (err) => onError?.(err instanceof Error ? err : new Error(String(err))));

    await sync();
  }

  async stop(): Promise<void> {
    await this.watcher?.close();
    this.watcher = null;
    this.differ.reset();
    console.log('[variantree] Watcher stopped');
  }

  /**
   * Pick the best file to watch for changes.
   * OpenCode: the WAL file changes on every DB write.
   * Claude Code: the session JSONL file itself.
   * Fallback: poll the workspace directory.
   */
  private resolveWatchTarget(workspacePath: string): string {
    const ocWal = path.join(
      process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share'),
      'opencode', 'opencode.db-wal',
    );
    if (fs.existsSync(ocWal)) return ocWal;
    if (this.sessionId && fs.existsSync(this.sessionId)) return this.sessionId;
    return workspacePath;
  }
}
