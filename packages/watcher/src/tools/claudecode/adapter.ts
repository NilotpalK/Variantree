/**
 * Claude Code session adapter.
 *
 * Claude Code (Anthropic CLI) stores conversations as JSONL files:
 *   ~/.claude/projects/<path-hash>/<session-id>.jsonl
 *
 * Each line is a JSON object:
 *   { "type": "user"|"assistant", "message": { "content": [...] }, "timestamp": "..." }
 *
 * The path hash is the workspace path with slashes replaced by hyphens,
 * percent-encoded, stored under ~/.claude/projects/.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Message } from '@variantree/core';
import type { SessionAdapter } from '../base.js';

function getProjectsDir(): string {
  return path.join(os.homedir(), '.claude', 'projects');
}

/**
 * Claude Code encodes the workspace path by replacing path separators with
 * hyphens. E.g. /Users/alice/my-project → -Users-alice-my-project
 */
function encodeProjectPath(workspacePath: string): string {
  return workspacePath.replace(/\//g, '-');
}

function getSessionDir(workspacePath: string): string {
  return path.join(getProjectsDir(), encodeProjectPath(workspacePath));
}

export class ClaudeCodeAdapter implements SessionAdapter {
  readonly name = 'claudecode';

  /** Overridable in tests to point at a temp directory. */
  protected getSessionDir(workspacePath: string): string {
    return getSessionDir(workspacePath);
  }

  /**
   * Returns the path to the most recently modified JSONL session file,
   * usable as a session ID for subsequent reads.
   */
  async getCurrentSessionId(workspacePath: string): Promise<string | null> {
    const sessionDir = this.getSessionDir(workspacePath);
    try {
      const entries = fs.readdirSync(sessionDir);
      const jsonlFiles = entries
        .filter(f => f.endsWith('.jsonl'))
        .map(f => path.join(sessionDir, f));
      if (jsonlFiles.length === 0) return null;

      let newest = jsonlFiles[0];
      let newestMtime = fs.statSync(newest).mtimeMs;
      for (const f of jsonlFiles.slice(1)) {
        const mtime = fs.statSync(f).mtimeMs;
        if (mtime > newestMtime) { newest = f; newestMtime = mtime; }
      }
      return newest;
    } catch {
      return null;
    }
  }

  async readMessagesAsync(workspacePath: string, sessionId?: string): Promise<Message[]> {
    try {
      const filePath = sessionId ?? await this.getCurrentSessionId(workspacePath);
      if (!filePath) return [];

      const raw = fs.readFileSync(filePath, 'utf8');
      const messages: Message[] = [];

      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const entry = JSON.parse(trimmed);

          // JSONL format: { type, message: { role, content }, timestamp }
          const role: string = entry.message?.role ?? entry.type;
          const content = extractContent(entry.message?.content ?? entry.content);
          if (!content) continue;

          const ts = entry.timestamp
            ? new Date(entry.timestamp).getTime()
            : Date.now();

          messages.push({
            id: `cc-${messages.length}-${ts}`,
            role: role === 'human' || role === 'user' ? 'user' : 'assistant',
            content,
            timestamp: ts,
          });
        } catch { /* skip malformed lines */ }
      }

      return messages;
    } catch {
      return [];
    }
  }
}

function extractContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: { type?: string; text?: string }) => b.type === 'text' && b.text)
      .map((b: { text: string }) => b.text)
      .join('');
  }
  return '';
}
