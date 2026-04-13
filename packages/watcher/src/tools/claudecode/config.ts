/**
 * Claude Code global MCP registration.
 *
 * Writes the Variantree MCP server entry into ~/.claude.json under
 * the `mcpServers` key.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const MCP_ENTRY = {
  command: 'npx',
  args: ['-y', '@variantree/mcp'],
  env: { VARIANTREE_DIR: '.' },
};

function getConfigPath(): string {
  return path.join(os.homedir(), '.claude.json');
}

export function registerGlobalMcp(): void {
  const configPath = getConfigPath();

  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {}

  if (!config.mcpServers) config.mcpServers = {};
  const servers = config.mcpServers as Record<string, unknown>;
  if (servers.variantree) return; // already registered

  servers.variantree = MCP_ENTRY;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  console.log('[variantree] Claude Code: MCP server registered in', configPath);
}
