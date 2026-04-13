/**
 * All registered tool integrations.
 *
 * To add a new tool: create src/tools/<toolname>/ implementing ToolIntegration,
 * then add it to the ALL_TOOLS array below.
 */

export type { ToolIntegration, SessionAdapter } from './base.js';
export { VARIANTREE_MARKER, VARIANTREE_INSTRUCTIONS_SECTION, mergeInstructions } from './instructions.js';

export { opencodeTool, OpenCodeAdapter, mergeAgentsMd } from './opencode/index.js';
export { claudecodeTool, ClaudeCodeAdapter } from './claudecode/index.js';

import { opencodeTool } from './opencode/index.js';
import { claudecodeTool } from './claudecode/index.js';
import type { ToolIntegration } from './base.js';

/** Every tool Variantree knows about. Used by postinstall and ensureInstructions. */
export const ALL_TOOLS: ToolIntegration[] = [opencodeTool, claudecodeTool];

/**
 * Write standing instructions for all tools into the project directory.
 * Called on every MCP session start and `variantree init`.
 */
export function ensureProjectInstructions(projectDir: string): void {
  for (const tool of ALL_TOOLS) {
    try {
      tool.writeProjectInstructions(projectDir);
    } catch {
      // Never let instruction writing break the main flow
    }
  }
}

/**
 * Register MCP server in all tools' global configs.
 * Called once by the postinstall script.
 */
export function registerAllMcp(): void {
  for (const tool of ALL_TOOLS) {
    try {
      tool.registerGlobalMcp?.();
    } catch {
      // Postinstall must never fail
    }
  }
}
