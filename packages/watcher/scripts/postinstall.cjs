#!/usr/bin/env node
/**
 * Postinstall script — registers the Variantree MCP server in all supported
 * AI tool global configs (OpenCode, Claude Code).
 *
 * Runs automatically after `npm install -g @variantree/watcher`.
 * Always updates the config to ensure the latest MCP args are set.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const MCP_ARGS = ['-y', '@variantree/mcp@latest'];

// ─── OpenCode ────────────────────────────────────────────────────────────────

function registerOpenCode() {
  const configDir = process.env.XDG_CONFIG_HOME
    ?? path.join(os.homedir(), '.config');
  const configPath = path.join(configDir, 'opencode', 'opencode.json');

  let config = {};
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}

  if (!config.mcp) config.mcp = {};

  config.mcp.variantree = {
    type: 'local',
    command: ['npx', ...MCP_ARGS],
    environment: { VARIANTREE_CALLER: 'opencode' },
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

  config.mcpServers.variantree = {
    command: 'npx',
    args: MCP_ARGS,
    env: { VARIANTREE_CALLER: 'claudecode' },
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  console.log('[variantree] Claude Code: MCP server registered in', configPath);
}

// ─── Run ─────────────────────────────────────────────────────────────────────

try { registerOpenCode(); } catch (e) { console.warn('[variantree] OpenCode config skipped:', e.message); }
try { registerClaudeCode(); } catch (e) { console.warn('[variantree] Claude Code config skipped:', e.message); }
