/**
 * @variantree/watcher — Aider Session Adapter
 *
 * Aider writes conversation history as markdown to:
 *   .aider.chat.history.md  (in the project root)
 *
 * Format:
 *   #### user
 *   message content
 *
 *   #### assistant
 *   response content
 */

import path from 'node:path';
import type { Message } from '@variantree/core';
import type { SessionAdapter } from './base.js';

export class AiderAdapter implements SessionAdapter {
  readonly name = 'aider';

  async findSessionFile(workspacePath: string): Promise<string | null> {
    return path.join(workspacePath, '.aider.chat.history.md');
  }

  parseMessages(raw: string): Message[] {
    const messages: Message[] = [];
    // Split on #### user or #### assistant headings
    const blocks = raw.split(/^#### (user|assistant)\s*$/m).filter(Boolean);

    // blocks = ['user', 'content...', 'assistant', 'content...', ...]
    for (let i = 0; i + 1 < blocks.length; i += 2) {
      const role = blocks[i].trim() as 'user' | 'assistant';
      const content = blocks[i + 1].trim();
      if (role !== 'user' && role !== 'assistant') continue;
      if (!content) continue;

      messages.push({
        id: `aider-${messages.length}`,
        role,
        content,
        timestamp: Date.now(),
      });
    }

    return messages;
  }
}
