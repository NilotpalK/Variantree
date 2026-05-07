/**
 * OpenCode tool integration.
 */

import type { ToolIntegration } from '../base.js';
import { OpenCodeAdapter } from './adapter.js';
import { writeProjectInstructions } from './instructions.js';

export { OpenCodeAdapter } from './adapter.js';
export { writeProjectInstructions, mergeAgentsMd } from './instructions.js';

export const opencodeTool: ToolIntegration = {
  name: 'opencode',
  adapter: new OpenCodeAdapter(),
  writeProjectInstructions,
};
