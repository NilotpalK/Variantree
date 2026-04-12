#!/usr/bin/env node
/**
 * @variantree/watcher — CLI
 *
 * On-demand mode: no background watcher needed.
 * Every command reads the conversation from OpenCode's SQLite on demand.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import fsSync from 'node:fs';
import readline from 'node:readline';
import { VariantTree } from '@variantree/core';
import { NodeStorage } from './node/storage.js';
import { GitSnapshotProvider } from './node/git-snapshot.js';
import { OpenCodeAdapter } from './adapters/opencode.js';
import { MessageDiffer } from './differ.js';
import { VariantreeWatcher } from './watcher.js';
import { launchOpenCodeSession } from './node/session-launcher.js';
import { mergeAgentsMd } from './agents-md.js';

// ─── Theme ────────────────────────────────────────────────────────────────

const WORKSPACE_ID = 'default';

const brand = chalk.hex('#A78BFA');       // purple
const accent = chalk.hex('#34D399');      // green
const dim = chalk.dim;
const warn = chalk.hex('#FBBF24');        // amber
const err = chalk.hex('#F87171');         // red
const info = chalk.hex('#60A5FA');        // blue

const LOGO = brand('◆ variantree');
const CHECK = accent('✓');
const CROSS = err('✗');
const DOT = dim('·');
const ARROW = dim('→');
const BRANCH_ICON = brand('⎇');
const SNAP = dim('◈');
const TREE_VERT = dim('│');
const TREE_FORK = dim('├──');
const TREE_END = dim('└──');

// ─── Helpers ──────────────────────────────────────────────────────────────

function header(text: string) {
  console.log('');
  console.log(`  ${LOGO}  ${dim('·')}  ${text}`);
  console.log('');
}

function success(text: string) {
  console.log(`  ${CHECK} ${text}`);
}

function detail(label: string, value: string) {
  console.log(`    ${dim(label.padEnd(14))} ${value}`);
}

function errorMsg(text: string) {
  console.log(`  ${CROSS} ${err(text)}`);
}

function hint(text: string) {
  console.log(`  ${dim(text)}`);
}

function divider() {
  console.log('');
}

function nextSteps() {
  console.log(`  ${ARROW} ${chalk.white('Next steps:')}`);
  console.log(`     1. Restart OpenCode ${dim('(quit and reopen)')}`);
  console.log(`     2. Tell it: ${info('"Read .variantree/branch-context.md for context"')}`);
}

interface BranchInfo {
  id: string;
  name: string;
  parentCheckpointId: string | null;
  messageCount: number;
  isActive: boolean;
}

interface CheckpointInfo {
  id: string;
  label: string;
  branchId: string;
  snapshotRef?: string | null;
  createdAt: number;
}

function printBranchNode(
  branch: BranchInfo,
  allBranches: BranchInfo[],
  allCheckpoints: CheckpointInfo[],
  indent: string,
  isLast: boolean,
) {
  const connector = indent === '' ? '' : (isLast ? TREE_END : TREE_FORK) + ' ';
  const nameColor = branch.isActive ? accent : chalk.white;
  const activeTag = branch.isActive ? accent(' ●') : '';

  console.log(`  ${dim(indent)}${connector}${nameColor.bold(branch.name)} ${dim(`(${branch.messageCount} msgs)`)}${activeTag}`);

  const branchCps = allCheckpoints
    .filter(cp => cp.branchId === branch.id)
    .sort((a, b) => a.createdAt - b.createdAt);

  const childIndent = indent === ''
    ? '  '
    : indent + (isLast ? '    ' : '│   ');

  for (let i = 0; i < branchCps.length; i++) {
    const cp = branchCps[i];
    const childBranches = allBranches.filter(b => b.parentCheckpointId === cp.id);
    const cpIsLast = i === branchCps.length - 1 && childBranches.length === 0;
    const cpConnector = cpIsLast ? TREE_END : TREE_FORK;
    const snap = cp.snapshotRef ? ` ${SNAP}` : '';
    const time = dim(formatTime(cp.createdAt));

    console.log(`  ${dim(childIndent)}${cpConnector} ${warn(cp.label)}${snap}  ${time}`);

    const continuation = cpIsLast ? '    ' : '│   ';
    for (let j = 0; j < childBranches.length; j++) {
      printBranchNode(
        childBranches[j],
        allBranches,
        allCheckpoints,
        childIndent + continuation,
        j === childBranches.length - 1,
      );
    }
  }

  if (branchCps.length === 0) {
    console.log(`  ${dim(childIndent)}${TREE_END} ${dim('no checkpoints')}`);
  }
}

/** Build a fully-configured engine. */
function createEngine(cwd: string) {
  const storage = new NodeStorage(cwd);
  const snapshotProvider = new GitSnapshotProvider(cwd);
  const engine = new VariantTree({
    storage,
    snapshotProvider,
  });
  return { engine, storage, snapshotProvider };
}

/** Load or auto-initialise workspace. */
async function ensureWorkspace(cwd: string) {
  const { engine, storage } = createEngine(cwd);
  let ws = await engine.loadWorkspace(WORKSPACE_ID);
  if (!ws) {
    ws = await engine.createWorkspace('My Project');
    ws.id = WORKSPACE_ID;
    await storage.save(WORKSPACE_ID, ws);
    await engine.loadWorkspace(WORKSPACE_ID);
    console.log(`  ${dim('workspace initialised')}`);
  }
  return { engine, storage };
}

/** Sync the latest conversation from OpenCode's SQLite into the Variantree branch. */
async function syncConversation(engine: VariantTree, cwd: string) {
  const adapter = new OpenCodeAdapter();
  const workspace = engine.getWorkspace();

  // Gate 1: session ID tracking — pin the workspace to a specific OpenCode session.
  let sessionId = workspace.openCodeSessionId;
  if (!sessionId) {
    const currentId = await adapter.getCurrentSessionId(cwd);
    if (!currentId) return 0;
    await engine.setOpenCodeSessionId(currentId);
    sessionId = currentId;
  }

  let messages = await adapter.readMessagesAsync(cwd, sessionId);

  // Fallback: stored session may be stale (user started a new OpenCode session).
  // Re-discover the current session and retry.
  if (messages.length === 0) {
    const freshId = await adapter.getCurrentSessionId(cwd);
    if (!freshId || freshId === sessionId) return 0;
    await engine.setOpenCodeSessionId(freshId);
    sessionId = freshId;
    messages = await adapter.readMessagesAsync(cwd, sessionId);
  }
  if (messages.length === 0) return 0;

  const existing = engine.getContext();
  const differ = new MessageDiffer();
  differ.diff(existing);
  const newMessages = differ.diff(messages);

  for (const msg of newMessages) {
    await engine.addMessage(msg.role, msg.content, { source: 'opencode' });
  }
  return newMessages.length;
}

/** Generate .variantree/branch-context.md */
function generateContextFile(cwd: string, branchName: string, messages: Array<{ role: string; content: string }>) {
  const contextDir = path.join(cwd, '.variantree');
  if (!fsSync.existsSync(contextDir)) fsSync.mkdirSync(contextDir, { recursive: true });

  const lines: string[] = [
    `# Variantree Branch Context`,
    ``,
    `**Branch:** ${branchName}`,
    `**Generated:** ${new Date().toISOString()}`,
    ``,
    `> This file was auto-generated by Variantree. It contains the conversation`,
    `> history up to the point where this branch was created. Read this to`,
    `> understand the context of what has been done so far.`,
    ``,
    `---`,
    ``,
    `## Conversation History`,
    ``,
  ];

  if (messages.length === 0) {
    lines.push('_No messages recorded at this checkpoint._');
  } else {
    for (const msg of messages) {
      const prefix = msg.role === 'user' ? '**User:**' : '**Assistant:**';
      const content = msg.content.length > 500
        ? msg.content.slice(0, 500) + '...'
        : msg.content;
      lines.push(`${prefix} ${content}`, '');
    }
  }

  const filePath = path.join(contextDir, 'branch-context.md');
  fsSync.writeFileSync(filePath, lines.join('\n'), 'utf8');
  return filePath;
}

/** Prompt the user with a yes/no question. Defaults to yes (enter = Y). */
async function promptConfirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() !== 'n');
    });
  });
}

/**
 * Count messages on the active branch that have been added since the last checkpoint.
 * These would be lost if the user switches/branches without checkpointing first.
 */
function countUnsavedMessages(engine: VariantTree): number {
  const branch = engine.getActiveBranch();
  const branchCheckpoints = engine
    .getCheckpointsForBranch(branch.id)
    .sort((a, b) => a.createdAt - b.createdAt);
  if (branchCheckpoints.length === 0) return branch.messages.length;
  const lastCp = branchCheckpoints[branchCheckpoints.length - 1];
  return Math.max(0, branch.messages.length - 1 - lastCp.messageIndex);
}

function formatTime(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}

// ─── CLI ──────────────────────────────────────────────────────────────────

const program = new Command();
program
  .name('variantree')
  .description(brand('Version control for AI conversations'))
  .version('0.1.0');

// ── init ──────────────────────────────────────────────────────────────────
program
  .command('init')
  .description('Initialise a Variantree workspace')
  .option('-d, --dir <path>', 'workspace directory', process.cwd())
  .action(async (opts) => {
    const cwd = path.resolve(opts.dir);
    header('init');
    await ensureWorkspace(cwd);
    success('Workspace ready');

    const opencodePath = path.join(cwd, 'opencode.json');
    try {
      const devServerPath = path.join(cwd, 'packages', 'mcp', 'src', 'server.ts');
      const isDev = fsSync.existsSync(devServerPath);
      const command = isDev 
        ? ["npx", "tsx", "packages/mcp/src/server.ts"] 
        : ["npx", "-y", "@variantree/mcp"];

      const mcpConfig = {
        type: "local",
        command,
        environment: { VARIANTREE_DIR: "." }
      };

      if (fsSync.existsSync(opencodePath)) {
        const existingInfo = JSON.parse(fsSync.readFileSync(opencodePath, 'utf8'));
        if (!existingInfo.mcp) existingInfo.mcp = {};
        if (!existingInfo.mcp.variantree) {
           existingInfo.mcp.variantree = mcpConfig;
           fsSync.writeFileSync(opencodePath, JSON.stringify(existingInfo, null, 2), 'utf8');
           success('OpenCode MCP server added to existing opencode.json');
        } else {
           hint('OpenCode MCP configuration already exists');
        }
      } else {
         const newConfig = {
            "$schema": "https://opencode.ai/config.json",
            mcp: { variantree: mcpConfig }
         };
         fsSync.writeFileSync(opencodePath, JSON.stringify(newConfig, null, 2), 'utf8');
         success('Created opencode.json with Variantree MCP server');
      }
    } catch (err) {
      hint('Could not auto-configure opencode.json. You may need to add the MCP server manually.');
    }

    // Write or merge AGENTS.md with Variantree standing instructions
    const agentsPath = path.join(cwd, 'AGENTS.md');
    try {
      let existing: string | null = null;
      try { existing = fsSync.readFileSync(agentsPath, 'utf8'); } catch {}
      if (existing?.includes('<!-- variantree:agents -->')) {
        hint('AGENTS.md already has Variantree instructions');
      } else {
        fsSync.writeFileSync(agentsPath, mergeAgentsMd(existing), 'utf8');
        success(existing ? 'Variantree instructions added to existing AGENTS.md' : 'Created AGENTS.md with Variantree instructions');
      }
    } catch {
      hint('Could not write AGENTS.md.');
    }

    hint(`Run ${chalk.white('variantree checkpoint "label"')} after coding to save your progress`);
    divider();
  });

// ── checkpoint ────────────────────────────────────────────────────────────
program
  .command('checkpoint <label>')
  .description('Sync conversation from OpenCode + snapshot code')
  .option('-d, --dir <path>', 'workspace directory', process.cwd())
  .action(async (label: string, opts) => {
    const cwd = path.resolve(opts.dir);
    header('checkpoint');
    const { engine } = await ensureWorkspace(cwd);

    const synced = await syncConversation(engine, cwd);
    await engine.createCheckpoint(label, { workspacePath: cwd });
    success(`Checkpoint ${chalk.white.bold(`"${label}"`)} created`);
    if (synced > 0) {
      detail('synced', `${synced} message(s) from OpenCode`);
    }
    detail('snapshot', `code saved ${SNAP}`);
    divider();
  });

// ── branch ────────────────────────────────────────────────────────────────
program
  .command('branch <name>')
  .description('Create a branch, restore code, and generate context')
  .option('-d, --dir <path>', 'workspace directory', process.cwd())
  .option('-c, --checkpoint <label>', 'branch from a specific checkpoint (default: latest on active branch)')
  .option('--force', 'skip the unsaved-work checkpoint prompt')
  .option('--no-launch', 'skip auto-launching a new OpenCode session')
  .action(async (name: string, opts) => {
    const cwd = path.resolve(opts.dir);
    header('branch');
    const { engine } = await ensureWorkspace(cwd);
    await syncConversation(engine, cwd);

    // Guard: prompt if there are messages on this branch not yet captured in a checkpoint
    if (!opts.force) {
      const unsaved = countUnsavedMessages(engine);
      if (unsaved > 0) {
        const answer = await promptConfirm(
          `  ${warn(`${unsaved} message(s) are not checkpointed and won't carry to the new branch.`)} Checkpoint now? ${dim('[Y/n]')} `
        );
        if (answer) {
          const autoLabel = `Auto: before branch "${name}"`;
          await engine.createCheckpoint(autoLabel, { workspacePath: cwd });
          success(`Checkpoint ${chalk.white.bold(`"${autoLabel}"`)} created`);
        }
      }
    }

    // Use checkpoints on the active branch only; fall back to engine auto-create if none exist
    const allCheckpoints = engine.getCheckpoints();
    const activeBranch = engine.getActiveBranch();
    const branchCheckpoints = engine
      .getCheckpointsForBranch(activeBranch.id)
      .sort((a, b) => a.createdAt - b.createdAt);

    let cpId: string | undefined;
    let cpLabel = 'current position';

    if (opts.checkpoint) {
      const cp = allCheckpoints.find((c) => c.label === opts.checkpoint);
      if (!cp) { errorMsg(`Checkpoint "${opts.checkpoint}" not found.`); process.exit(1); }
      cpId = cp.id;
      cpLabel = cp.label;
    } else if (branchCheckpoints.length > 0) {
      const lastCp = branchCheckpoints[branchCheckpoints.length - 1];
      cpId = lastCp.id;
      cpLabel = lastCp.label;
    }

    const newBranch = await engine.branch(name, cpId);
    success(`Branch ${brand.bold(`"${name}"`)} created from ${dim(`"${cpLabel}"`)}`);

    if (cpId) {
      const summary = await engine.restoreCheckpoint(cpId, cwd);
      // restoreCheckpoint switches to the checkpoint's parent branch as a side-effect — switch back
      await engine.switchBranch(newBranch.id);
      if (summary) {
        detail('restored', `${summary.written.length} written, ${summary.deleted.length} deleted, ${summary.skipped.length} unchanged`);
      }
    }

    const context = engine.getContext();
    const contextPath = generateContextFile(cwd, name, context);
    detail('context', path.relative(cwd, contextPath));

    if (opts.launch !== false) {
      divider();
      const result = launchOpenCodeSession(cwd);
      if (result.launched) {
        console.log(`  ${ARROW} Opening new OpenCode session...`);
      } else {
        hint('Could not launch OpenCode automatically.');
        nextSteps();
      }
    } else {
      divider();
      nextSteps();
    }
    divider();
  });

// ── restore ───────────────────────────────────────────────────────────────
program
  .command('restore <label>')
  .description('Restore code to a checkpoint + generate context')
  .option('-d, --dir <path>', 'workspace directory', process.cwd())
  .option('--force', 'skip the unsaved-work checkpoint prompt')
  .option('--no-launch', 'skip auto-launching a new OpenCode session')
  .action(async (label: string, opts) => {
    const cwd = path.resolve(opts.dir);
    header('restore');
    const { engine } = await ensureWorkspace(cwd);
    await syncConversation(engine, cwd);

    // Guard: prompt if there are messages on this branch not yet captured in a checkpoint
    if (!opts.force) {
      const unsaved = countUnsavedMessages(engine);
      if (unsaved > 0) {
        const answer = await promptConfirm(
          `  ${warn(`${unsaved} message(s) are not checkpointed and will be lost after restore.`)} Checkpoint now? ${dim('[Y/n]')} `
        );
        if (answer) {
          const autoLabel = `Auto: before restore to "${label}"`;
          await engine.createCheckpoint(autoLabel, { workspacePath: cwd });
          success(`Checkpoint ${chalk.white.bold(`"${autoLabel}"`)} created`);
        }
      }
    }

    const checkpoints = engine.getCheckpoints();
    const cp = checkpoints.find((c) => c.label === label);
    if (!cp) { errorMsg(`Checkpoint "${label}" not found.`); process.exit(1); }

    const summary = await engine.restoreCheckpoint(cp.id, cwd);
    if (summary) {
      success(`Restored to ${chalk.white.bold(`"${label}"`)}`);
      detail('written', `${summary.written.length} file(s)`);
      detail('deleted', `${summary.deleted.length} file(s)`);
      detail('unchanged', `${summary.skipped.length} file(s)`);
    } else {
      success(`Switched to ${chalk.white.bold(`"${label}"`)} ${dim('(no code snapshot)')}`);
    }

    const context = engine.getContext();
    const branchName = engine.getActiveBranch().name;
    const contextPath = generateContextFile(cwd, branchName, context);
    detail('context', path.relative(cwd, contextPath));

    if (opts.launch !== false) {
      divider();
      const result = launchOpenCodeSession(cwd);
      if (result.launched) {
        console.log(`  ${ARROW} Opening new OpenCode session...`);
      } else {
        hint('Could not launch OpenCode automatically.');
        nextSteps();
      }
    } else {
      divider();
      nextSteps();
    }
    divider();
  });

// ── status ────────────────────────────────────────────────────────────────
program
  .command('status')
  .description('Show active branch, messages, and checkpoints')
  .option('-d, --dir <path>', 'workspace directory', process.cwd())
  .action(async (opts) => {
    const cwd = path.resolve(opts.dir);
    const { engine } = createEngine(cwd);
    const ws = await engine.loadWorkspace(WORKSPACE_ID);
    if (!ws) {
      header('status');
      hint('No workspace found.');
      hint(`Run ${chalk.white('variantree init')} or ${chalk.white('variantree checkpoint "label"')} to get started.`);
      divider();
      return;
    }

    const branch = engine.getActiveBranch();
    const context = engine.getContext();
    const branches = engine.getBranches();
    const checkpoints = engine.getCheckpoints();

    header('status');

    console.log(`  ${BRANCH_ICON}  ${chalk.white.bold(branch.name)}  ${dim(`(${context.length} messages)`)}`);
    divider();

    // Hierarchical tree
    const root = branches.find(b => !b.parentCheckpointId);
    if (root) {
      printBranchNode(root, branches, checkpoints, '', true);
    }

    divider();
    const snapshotCount = checkpoints.filter(cp => cp.snapshotRef).length;
    hint(`${branches.length} branch${branches.length !== 1 ? 'es' : ''} · ${checkpoints.length} checkpoint${checkpoints.length !== 1 ? 's' : ''}${snapshotCount > 0 ? ` (${snapshotCount} with snapshots)` : ''}`);
    divider();
  });

// ── tree ──────────────────────────────────────────────────────────────────
program
  .command('tree')
  .description('Visualise the branch tree')
  .option('-d, --dir <path>', 'workspace directory', process.cwd())
  .action(async (opts) => {
    const cwd = path.resolve(opts.dir);
    const { engine } = createEngine(cwd);
    const ws = await engine.loadWorkspace(WORKSPACE_ID);
    if (!ws) {
      header('tree');
      hint('No workspace found.');
      divider();
      return;
    }

    const branches = engine.getBranches();
    const checkpoints = engine.getCheckpoints();

    header('tree');

    const root = branches.find(b => !b.parentCheckpointId);
    if (root) {
      printBranchNode(root, branches, checkpoints, '', true);
    } else {
      hint('No branches found.');
    }
    divider();
  });

// ── watch (optional) ──────────────────────────────────────────────────────
program
  .command('watch')
  .description('(Optional) Real-time watcher for web UI')
  .option('-d, --dir <path>', 'workspace directory', process.cwd())
  .action(async (opts) => {
    const cwd = path.resolve(opts.dir);
    header('watch');
    const { engine } = await ensureWorkspace(cwd);

    const watcher = new VariantreeWatcher({
      workspacePath: cwd,
      adapter: new OpenCodeAdapter(),
      engine,
      onSync: (count) => console.log(`  ${CHECK} Synced ${accent(String(count))} message(s)`),
      onError: (e) => console.error(`  ${CROSS} ${e.message}`),
    });

    await watcher.start();
    console.log(`  ${dim('Watching for changes... Press')} ${chalk.white('Ctrl+C')} ${dim('to stop.')}`);
    divider();

    process.on('SIGINT', async () => {
      await watcher.stop();
      console.log(`\n  ${dim('Watcher stopped.')}`);
      divider();
      process.exit(0);
    });
  });

program.parse();
