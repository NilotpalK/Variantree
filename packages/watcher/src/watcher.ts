/**
 * @variantree/watcher — VariantreeWatcher
 *
 * Watches a session file using chokidar (push-based, same as VS Code).
 * On every change event:
 *   1. Reads and parses the session file via the adapter
 *   2. Diffs to find new messages
 *   3. Adds new messages to the active Variantree branch
 *
 * Falls back to a 2s polling interval for editors/filesystems that
 * don't emit reliable fs.watch events.
 */

import chokidar, { type FSWatcher } from 'chokidar';
import fs from 'node:fs/promises';
import { VariantTree } from '@variantree/core';
import type { SessionAdapter } from './adapters/base.js';
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

  constructor(opts: WatcherOptions) {
    this.opts = opts;
  }

  async start(): Promise<void> {
    const { workspacePath, adapter, engine, onSync, onError } = this.opts;

    const sessionFile = await adapter.findSessionFile(workspacePath);
    if (!sessionFile) {
      console.warn(`[variantree] No ${adapter.name} session found for ${workspacePath}`);
      return;
    }

    console.log(`[variantree] Watching ${adapter.name} session: ${sessionFile}`);

    const sync = async () => {
      try {
        // For SQLite-backed adapters (OpenCode), read directly from DB
        // For file-based adapters (Aider, Claude Code), read file then parse
        let allMessages;
        if ('readMessagesAsync' in adapter && typeof (adapter as any).readMessagesAsync === 'function') {
          allMessages = await (adapter as any).readMessagesAsync(workspacePath);
        } else {
          const raw = await fs.readFile(sessionFile, 'utf8');
          allMessages = adapter.parseMessages(raw);
        }
        const newMessages = this.differ.diff(allMessages);

        for (const msg of newMessages) {
          await engine.addMessage(msg.role, msg.content, { source: adapter.name });
        }

        if (newMessages.length > 0) {
          onSync?.(newMessages.length);
        }
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    };

    this.watcher = chokidar.watch(sessionFile, {
      persistent: true,
      usePolling: false,       // event-driven primary
      interval: 2000,          // polling fallback interval
      awaitWriteFinish: {
        stabilityThreshold: 100,  // wait for write to settle before reading
        pollInterval: 50,
      },
    });

    this.watcher.on('change', sync);
    this.watcher.on('error', (err) => onError?.(err instanceof Error ? err : new Error(String(err))));

    // Do an initial sync in case session file already has messages
    await sync();
  }

  async stop(): Promise<void> {
    await this.watcher?.close();
    this.watcher = null;
    this.differ.reset();
    console.log('[variantree] Watcher stopped');
  }
}
