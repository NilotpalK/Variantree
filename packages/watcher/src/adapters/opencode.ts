/**
 * @variantree/watcher — OpenCode Session Adapter
 *
 * OpenCode stores all data in a SQLite database (WAL mode).
 * Location varies by OS:
 *   macOS/Linux: ~/.local/share/opencode/opencode.db
 *   Windows:     %APPDATA%/opencode/opencode.db
 *
 * Uses better-sqlite3 (native binding) so WAL-mode writes are visible
 * immediately — sql.js only reads the main DB file and misses WAL data.
 *
 * Schema:
 *   session → message (data JSON: {role, time, ...})
 *             → part (data JSON: {type:"text", text:"..."})
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Message } from '@variantree/core';
import type { SessionAdapter } from './base.js';

/**
 * Get the OpenCode data directory based on the current OS.
 *
 * macOS/Linux: ~/.local/share/opencode/
 * Windows:     %APPDATA%/opencode/
 */
function getOpenCodeDataDir(): string {
  const platform = os.platform();
  if (platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'opencode');
  }
  const dataHome = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share');
  return path.join(dataHome, 'opencode');
}

export class OpenCodeAdapter implements SessionAdapter {
  readonly name = 'opencode';

  private getDbPath(): string {
    return path.join(getOpenCodeDataDir(), 'opencode.db');
  }

  private openDb(): InstanceType<typeof Database> {
    const dbPath = this.getDbPath();
    return new Database(dbPath, { readonly: true });
  }

  /**
   * Returns the path to the WAL file — this changes on every DB write,
   * making it the perfect file for chokidar to watch.
   */
  async findSessionFile(workspacePath: string): Promise<string | null> {
    const dbPath = this.getDbPath();
    try {
      fs.accessSync(dbPath);
      const db = this.openDb();
      const row = db.prepare(
        `SELECT id FROM session WHERE directory = ? ORDER BY time_updated DESC LIMIT 1`
      ).get(workspacePath) as { id: string } | undefined;
      db.close();

      if (!row) return null;
      const walPath = dbPath + '-wal';
      try { fs.accessSync(walPath); return walPath; } catch { return dbPath; }
    } catch {
      return null;
    }
  }

  /**
   * parseMessages reads from the SQLite DB directly.
   * The `raw` parameter is ignored — use readMessagesAsync instead.
   */
  parseMessages(_raw: string): Message[] {
    return [];
  }

  /**
   * Get the ID of the most recently active OpenCode session for a directory.
   * Returns null if no session exists yet.
   */
  async getCurrentSessionId(workspacePath: string): Promise<string | null> {
    try {
      const db = this.openDb();
      const row = db.prepare(
        `SELECT id FROM session WHERE directory = ? ORDER BY time_updated DESC LIMIT 1`
      ).get(workspacePath) as { id: string } | undefined;
      db.close();
      return row?.id ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Read messages from OpenCode's DB, optionally scoped to a specific session.
   *
   * @param workspacePath - Filter to sessions for this directory
   * @param sessionId - If provided, read from this specific session instead of
   *   querying for the latest. Prevents stale messages from old sessions.
   */
  async readMessagesAsync(workspacePath?: string, sessionId?: string): Promise<Message[]> {
    try {
      const db = this.openDb();

      let resolvedSessionId: string;
      if (sessionId) {
        const check = db.prepare(`SELECT id FROM session WHERE id = ? LIMIT 1`).get(sessionId) as { id: string } | undefined;
        if (!check) { db.close(); return []; }
        resolvedSessionId = sessionId;
      } else {
        let row: { id: string } | undefined;
        if (workspacePath) {
          row = db.prepare(
            `SELECT id FROM session WHERE directory = ? ORDER BY time_updated DESC LIMIT 1`
          ).get(workspacePath) as { id: string } | undefined;
        } else {
          row = db.prepare(
            `SELECT id FROM session ORDER BY time_updated DESC LIMIT 1`
          ).get() as { id: string } | undefined;
        }
        if (!row) { db.close(); return []; }
        resolvedSessionId = row.id;
      }

      const msgRows = db.prepare(
        `SELECT id, data, time_created FROM message WHERE session_id = ? ORDER BY time_created ASC`
      ).all(resolvedSessionId) as Array<{ id: string; data: string; time_created: number }>;

      const partRows = db.prepare(
        `SELECT message_id, data FROM part WHERE session_id = ? ORDER BY time_created ASC`
      ).all(resolvedSessionId) as Array<{ message_id: string; data: string }>;

      db.close();

      // Group text parts by message ID
      const partsByMsg = new Map<string, string[]>();
      for (const row of partRows) {
        try {
          const partData = JSON.parse(row.data);
          if (partData.type === 'text' && partData.text) {
            if (!partsByMsg.has(row.message_id)) partsByMsg.set(row.message_id, []);
            partsByMsg.get(row.message_id)!.push(partData.text);
          }
        } catch { /* skip malformed parts */ }
      }

      // Build Message array
      const result: Message[] = [];
      for (const msg of msgRows) {
        try {
          const msgData = JSON.parse(msg.data);
          const textParts = partsByMsg.get(msg.id) ?? [];
          const content = textParts.join('');
          if (!content) continue;

          result.push({
            id: msg.id,
            role: msgData.role === 'user' ? 'user' : 'assistant',
            content,
            timestamp: msg.time_created,
          });
        } catch { /* skip malformed messages */ }
      }

      return result;
    } catch {
      return [];
    }
  }
}
