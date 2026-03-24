/**
 * @variantree/watcher — OpenCode Session Adapter
 *
 * OpenCode stores all data in a SQLite database.
 * Location varies by OS:
 *   macOS/Linux: ~/.local/share/opencode/opencode.db
 *   Windows:     %APPDATA%/opencode/opencode.db
 *
 * Uses sql.js (pure JS, no native compilation) for maximum portability.
 *
 * Schema:
 *   session → message (data JSON: {role, time, ...})
 *             → part (data JSON: {type:"text", text:"..."})
 */

import initSqlJs, { type SqlJsStatic } from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Message } from '@variantree/core';
import type { SessionAdapter } from './base.js';

/** Cached sql.js module — initialised once, reused forever. */
let cachedSQL: SqlJsStatic | null = null;
async function getSQL(): Promise<SqlJsStatic> {
  if (!cachedSQL) cachedSQL = await initSqlJs();
  return cachedSQL;
}

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
  // macOS and Linux both use XDG_DATA_HOME or ~/.local/share
  const dataHome = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share');
  return path.join(dataHome, 'opencode');
}

export class OpenCodeAdapter implements SessionAdapter {
  readonly name = 'opencode';

  private getDbPath(): string {
    return path.join(getOpenCodeDataDir(), 'opencode.db');
  }

  /**
   * Returns the path to the WAL file — this changes on every DB write,
   * making it the perfect file for chokidar to watch.
   */
  async findSessionFile(workspacePath: string): Promise<string | null> {
    const dbPath = this.getDbPath();
    try {
      fs.accessSync(dbPath);
      const SQL = await getSQL();
      const buffer = fs.readFileSync(dbPath);
      const db = new SQL.Database(buffer);

      const result = db.exec(
        `SELECT id FROM session WHERE directory = '${esc(workspacePath)}' ORDER BY time_updated DESC LIMIT 1`
      );
      db.close();

      if (result.length === 0 || result[0].values.length === 0) return null;
      // Prefer WAL file (changes on every write), fall back to the DB itself
      const walPath = dbPath + '-wal';
      try { fs.accessSync(walPath); return walPath; } catch { return dbPath; }
    } catch {
      return null;
    }
  }

  /**
   * parseMessages reads from the SQLite DB directly.
   * The `raw` parameter is ignored — we always query the DB.
   */
  parseMessages(_raw: string): Message[] {
    // Can't do async in parseMessages — use readMessagesAsync instead
    return [];
  }

  /**
   * Async version of readMessages — preferred by the watcher.
   */
  async readMessagesAsync(workspacePath?: string): Promise<Message[]> {
    try {
      const dbPath = this.getDbPath();
      const buffer = fs.readFileSync(dbPath);
      const SQL = await getSQL();
      const db = new SQL.Database(buffer);

      // Find the most recently active session
      let sessionQuery: string;
      if (workspacePath) {
        sessionQuery = `SELECT id FROM session 
           WHERE directory = '${esc(workspacePath)}' ORDER BY time_updated DESC LIMIT 1`;
      } else {
        sessionQuery = `SELECT id FROM session ORDER BY time_updated DESC LIMIT 1`;
      }

      const sessionResult = db.exec(sessionQuery);
      if (sessionResult.length === 0 || sessionResult[0].values.length === 0) {
        db.close();
        return [];
      }
      const sessionId = sessionResult[0].values[0][0] as string;

      // Get all messages for this session
      const msgResult = db.exec(
        `SELECT id, session_id, data, time_created FROM message 
         WHERE session_id = '${esc(sessionId)}' ORDER BY time_created ASC`
      );

      // Get all text parts for this session
      const partResult = db.exec(
        `SELECT id, message_id, data FROM part 
         WHERE session_id = '${esc(sessionId)}' ORDER BY time_created ASC`
      );

      db.close();

      // Group text parts by message ID
      const partsByMsg = new Map<string, string[]>();
      for (const row of (partResult[0]?.values ?? [])) {
        const messageId = row[1] as string;
        const partDataStr = row[2] as string;
        try {
          const partData = JSON.parse(partDataStr);
          if (partData.type === 'text' && partData.text) {
            if (!partsByMsg.has(messageId)) partsByMsg.set(messageId, []);
            partsByMsg.get(messageId)!.push(partData.text);
          }
        } catch { /* skip malformed parts */ }
      }

      // Build Message array
      const result: Message[] = [];
      for (const row of (msgResult[0]?.values ?? [])) {
        const msgId = row[0] as string;
        const msgDataStr = row[2] as string;
        const timeCreated = row[3] as number;

        try {
          const msgData = JSON.parse(msgDataStr);
          const textParts = partsByMsg.get(msgId) ?? [];
          const content = textParts.join('');
          if (!content) continue;

          result.push({
            id: msgId,
            role: msgData.role === 'user' ? 'user' : 'assistant',
            content,
            timestamp: timeCreated,
          });
        } catch { /* skip malformed messages */ }
      }

      return result;
    } catch {
      return [];
    }
  }
}

/** Escape single quotes for SQL string literals. */
function esc(s: string): string {
  return s.replace(/'/g, "''");
}
