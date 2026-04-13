/**
 * Claude Code tool integration.
 */

import type { ToolIntegration } from '../base.js';
import { ClaudeCodeAdapter } from './adapter.js';
import { writeProjectInstructions } from './instructions.js';
import { registerGlobalMcp } from './config.js';

export { ClaudeCodeAdapter } from './adapter.js';
export { writeProjectInstructions } from './instructions.js';
export { registerGlobalMcp } from './config.js';

export const claudecodeTool: ToolIntegration = {
  name: 'claudecode',
  adapter: new ClaudeCodeAdapter(),
  registerGlobalMcp,
  writeProjectInstructions,
};
