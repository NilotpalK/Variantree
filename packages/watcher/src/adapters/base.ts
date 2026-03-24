/**
 * @variantree/watcher — Session Adapter Interface
 *
 * Each AI coding tool writes its conversation to disk in a different format.
 * Adapters normalise these into the common Message type used by @variantree/core.
 */

import type { Message } from '@variantree/core';

export interface SessionAdapter {
  /** Display name of the tool (e.g. 'opencode', 'claude-code', 'aider') */
  readonly name: string;

  /**
   * Find the most recent active session file for a given workspace path.
   * Returns null if no session is found.
   */
  findSessionFile(workspacePath: string): Promise<string | null>;

  /**
   * Parse the raw content of a session file into an ordered array of messages.
   * Must be pure — no side effects, called on every file change event.
   */
  parseMessages(raw: string): Message[];
}
