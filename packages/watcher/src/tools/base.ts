/**
 * @variantree/watcher — Tool Integration Interface
 *
 * Each AI coding tool (OpenCode, Claude Code, Cursor, Gemini, Aider…) gets
 * its own folder under src/tools/<toolname>/ which implements this interface.
 *
 * A tool module exports a single object satisfying ToolIntegration.
 */

import type { Message } from '@variantree/core';

// ─── Session Adapter ─────────────────────────────────────────────────────────

/**
 * Reads conversation messages from however the tool stores them
 * (SQLite, JSONL, markdown, etc.).
 */
export interface SessionAdapter {
  /** Machine-readable name used in log metadata, e.g. "opencode" */
  readonly name: string;

  /**
   * Return the session ID (or file path) for the most recently active session
   * at the given workspace directory. Returns null if none found.
   */
  getCurrentSessionId(workspacePath: string): Promise<string | null>;

  /**
   * Read messages from the tool's storage.
   *
   * @param workspacePath - The project directory
   * @param sessionId - If provided, read only from this session (prevents
   *   stale-session imports when a project is recreated at the same path).
   */
  readMessagesAsync(workspacePath: string, sessionId?: string): Promise<Message[]>;
}

// ─── Tool Integration ─────────────────────────────────────────────────────────

export interface ToolIntegration {
  /** Machine-readable name, e.g. "opencode", "claudecode" */
  readonly name: string;

  /**
   * Session adapter for reading conversation history.
   * Undefined for tools that don't expose readable sessions (e.g. Cursor).
   */
  readonly adapter?: SessionAdapter;

  /**
   * Register the Variantree MCP server in this tool's global config file.
   * Called once by the postinstall script.
   * Should be idempotent — safe to call multiple times.
   */
  registerGlobalMcp?(): void;

  /**
   * Write or update the standing instructions file for this tool in the
   * given project directory (e.g. AGENTS.md, CLAUDE.md, .cursor/rules/).
   * Should be idempotent — safe to call on every session start.
   */
  writeProjectInstructions(projectDir: string): void;
}
