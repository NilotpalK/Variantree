/**
 * OpenCode global MCP registration.
 *
 * Writes the Variantree MCP server entry into ~/.config/opencode/opencode.json.
 * Called once by the postinstall script.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const MCP_ENTRY = {
  type: 'local',
  command: ['npx', '-y', '@variantree/mcp'],
  environment: { VARIANTREE_CALLER: 'opencode' },
};

function getConfigPath(): string {
  const configDir = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
  return path.join(configDir, 'opencode', 'opencode.json');
}

export function registerGlobalMcp(): void {
  const configPath = getConfigPath();
  const configDir = path.dirname(configPath);

  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {}

  if (!config.mcp) config.mcp = {};
  const mcp = config.mcp as Record<string, unknown>;
  if (mcp.variantree) return; // already registered

  mcp.variantree = MCP_ENTRY;
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  console.log('[variantree] OpenCode: MCP server registered in', configPath);
}
