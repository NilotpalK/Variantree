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

  /**
   * Get the ID of the most recently active session for a workspace directory.
   * Returns null if no session exists. Used for session-aware sync.
   */
  getCurrentSessionId?(workspacePath: string): Promise<string | null>;

  /**
   * Read messages async, optionally scoped to a specific session ID.
   * When sessionId is provided, only messages from that session are returned.
   */
  readMessagesAsync?(workspacePath?: string, sessionId?: string): Promise<Message[]>;
}
