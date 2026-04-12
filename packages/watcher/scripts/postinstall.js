#!/usr/bin/env node
/**
 * Postinstall script — registers the Variantree MCP server in
 * OpenCode's global config (~/.config/opencode/opencode.json).
 *
 * Runs automatically after `npm install -g @variantree/watcher`.
 * Safe to re-run: skips if the entry already exists.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const MCP_ENTRY = {
  type: 'local',
  command: ['npx', '-y', '@variantree/mcp'],
  environment: { VARIANTREE_DIR: '.' },
};

function getGlobalConfigPath() {
  const configDir = process.env.XDG_CONFIG_HOME
    ?? path.join(os.homedir(), '.config');
  return path.join(configDir, 'opencode', 'opencode.json');
}

function run() {
  const configPath = getGlobalConfigPath();
  const configDir = path.dirname(configPath);

  let config = {};
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(raw);
  } catch {
    // File doesn't exist or is invalid — start fresh
  }

  if (!config.mcp) config.mcp = {};
  if (config.mcp.variantree) {
    // Already registered — don't overwrite user customisations
    return;
  }

  config.mcp.variantree = MCP_ENTRY;

  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  console.log('[variantree] MCP server registered in', configPath);
}

try {
  run();
} catch {
  // Postinstall must never break `npm install` — fail silently
}
