/**
 * @variantree/watcher — Message Differ
 *
 * Detects new messages between consecutive reads of a session file.
 * Keeps a simple count per session file — only emits messages beyond
 * what was seen last time.
 */

import type { Message } from '@variantree/core';

export class MessageDiffer {
  private lastCount = 0;

  /**
   * Given the current full list of messages, return only the ones
   * that are new since the last call to diff().
   */
  diff(messages: Message[]): Message[] {
    const newMessages = messages.slice(this.lastCount);
    this.lastCount = messages.length;
    return newMessages;
  }

  reset(): void {
    this.lastCount = 0;
  }
}
