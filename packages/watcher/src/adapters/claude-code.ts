/**
 * @variantree/watcher — Claude Code Session Adapter
 *
 * Claude Code stores conversations as JSON at:
 *   ~/.claude/projects/<project-hash>/conversations/<session-id>.json
 *
 * Format:
 *   { "messages": [{ "role": "human"|"assistant", "content": [{"type":"text","text":"..."}] }] }
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import type { Message } from '@variantree/core';
import type { SessionAdapter } from './base.js';

interface ClaudeContentBlock {
  type: 'text' | string;
  text?: string;
}

interface ClaudeMessage {
  role: 'human' | 'assistant';
  content: string | ClaudeContentBlock[];
}

interface ClaudeSession {
  messages: ClaudeMessage[];
}

export class ClaudeCodeAdapter implements SessionAdapter {
  readonly name = 'claude-code';

  async findSessionFile(workspacePath: string): Promise<string | null> {
    // Claude Code hashes paths with SHA-256, using the first 16 chars
    const hash = crypto.createHash('sha256').update(workspacePath).digest('hex').slice(0, 16);
    const conversationsDir = path.join(
      os.homedir(),
      '.claude',
      'projects',
      hash,
      'conversations',
    );

    try {
      const entries = await fs.readdir(conversationsDir);
      const jsonFiles = entries
        .filter((f) => f.endsWith('.json'))
        .map((f) => path.join(conversationsDir, f));

      if (jsonFiles.length === 0) return null;

      const stats = await Promise.all(
        jsonFiles.map(async (f) => ({ file: f, mtime: (await fs.stat(f)).mtime })),
      );
      stats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
      return stats[0].file;
    } catch {
      return null;
    }
  }

  parseMessages(raw: string): Message[] {
    try {
      const session: ClaudeSession = JSON.parse(raw);
      return (session.messages ?? []).map((m, i) => ({
        id: `claude-${i}`,
        role: m.role === 'human' ? 'user' : 'assistant',
        content: extractText(m.content),
        timestamp: Date.now(),
      }));
    } catch {
      return [];
    }
  }
}

function extractText(content: string | ClaudeContentBlock[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text!)
    .join('');
}
