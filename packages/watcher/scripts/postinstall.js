#!/usr/bin/env node
/**
 * Postinstall script — registers the Variantree MCP server in all supported
 * AI tool global configs (OpenCode, Claude Code).
 *
 * Runs automatically after `npm install -g @variantree/watcher`.
 * Each registration is idempotent — skips if already configured.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const MCP_COMMAND_NPXARGS = ['-y', '@variantree/mcp'];
const MCP_ENV = { VARIANTREE_DIR: '.' };

// ─── OpenCode ────────────────────────────────────────────────────────────────

function registerOpenCode() {
  const configDir = process.env.XDG_CONFIG_HOME
    ?? path.join(os.homedir(), '.config');
  const configPath = path.join(configDir, 'opencode', 'opencode.json');

  let config = {};
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}

  if (!config.mcp) config.mcp = {};
  if (config.mcp.variantree) return;

  config.mcp.variantree = {
    type: 'local',
    command: ['npx', ...MCP_COMMAND_NPXARGS],
    environment: MCP_ENV,
  };

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  console.log('[variantree] OpenCode: MCP server registered in', configPath);
}

// ─── Claude Code ─────────────────────────────────────────────────────────────

function registerClaudeCode() {
  const configPath = path.join(os.homedir(), '.claude.json');

  let config = {};
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}

  if (!config.mcpServers) config.mcpServers = {};
  if (config.mcpServers.variantree) return;

  config.mcpServers.variantree = {
    command: 'npx',
    args: MCP_COMMAND_NPXARGS,
    env: MCP_ENV,
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  console.log('[variantree] Claude Code: MCP server registered in', configPath);
}

// ─── Run ─────────────────────────────────────────────────────────────────────

try { registerOpenCode(); } catch {}
try { registerClaudeCode(); } catch {}
