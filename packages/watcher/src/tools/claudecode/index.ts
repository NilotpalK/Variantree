/**
 * Claude Code tool integration.
 */

import type { ToolIntegration } from '../base.js';
import { ClaudeCodeAdapter } from './adapter.js';
import { writeProjectInstructions } from './instructions.js';

export { ClaudeCodeAdapter } from './adapter.js';
export { writeProjectInstructions } from './instructions.js';

export const claudecodeTool: ToolIntegration = {
  name: 'claudecode',
  adapter: new ClaudeCodeAdapter(),
  writeProjectInstructions,
};
