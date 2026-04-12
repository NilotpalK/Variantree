/**
 * Session launcher — spawns a new OpenCode session with branch context pre-loaded.
 */

import { spawn } from 'node:child_process';

const CONTEXT_PROMPT =
  'Read the file .variantree/branch-context.md to understand the context of what was done on this branch, then continue working.';

export interface LaunchResult {
  launched: boolean;
}

/**
 * Spawns `opencode run` with an initial prompt that reads the branch context file.
 * Uses `stdio: 'inherit'` so OpenCode takes over the current terminal.
 *
 * Returns `{ launched: false }` if the spawn fails (e.g. opencode not on PATH).
 */
export function launchOpenCodeSession(cwd: string): LaunchResult {
  try {
    const child = spawn('opencode', ['run', CONTEXT_PROMPT], {
      cwd,
      stdio: 'inherit',
      detached: false,
    });

    child.on('error', () => {
      // opencode not found or spawn failed — silently handled via the try/catch
    });

    return { launched: true };
  } catch {
    return { launched: false };
  }
}
