/**
 * Integration test — full Variantree pipeline.
 *
 * Exercises: workspace → messages → checkpoints → snapshots → branch →
 * switch → restore → context resolution → unsaved guard.
 *
 * Uses a real temp directory with GitSnapshotProvider (real git commands).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { VariantTree } from '@variantree/core';
import { NodeStorage } from '../node/storage.js';
import { GitSnapshotProvider } from '../node/git-snapshot.js';
import { mergeAgentsMd } from '../agents-md.js';

const WORKSPACE_ID = 'test';

let tmpDir: string;
let engine: VariantTree;
let storage: NodeStorage;
let snapshotProvider: GitSnapshotProvider;

function writeFile(name: string, content: string) {
  fsSync.writeFileSync(path.join(tmpDir, name), content, 'utf8');
}

function readFile(name: string): string {
  return fsSync.readFileSync(path.join(tmpDir, name), 'utf8');
}

function fileExists(name: string): boolean {
  return fsSync.existsSync(path.join(tmpDir, name));
}

/**
 * Count messages on the active branch after the last checkpoint.
 * Mirrors the logic in cli.ts and server.ts.
 */
function countUnsavedMessages(): number {
  const branch = engine.getActiveBranch();
  const branchCheckpoints = engine
    .getCheckpointsForBranch(branch.id)
    .sort((a, b) => a.createdAt - b.createdAt);
  if (branchCheckpoints.length === 0) return branch.messages.length;
  const lastCp = branchCheckpoints[branchCheckpoints.length - 1];
  return Math.max(0, branch.messages.length - 1 - lastCp.messageIndex);
}

async function setup() {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'variantree-test-'));
  storage = new NodeStorage(tmpDir);
  snapshotProvider = new GitSnapshotProvider(tmpDir);
  engine = new VariantTree({ storage, snapshotProvider });

  const ws = await engine.createWorkspace('Integration Test');
  ws.id = WORKSPACE_ID;
  await storage.save(WORKSPACE_ID, ws);
  await engine.loadWorkspace(WORKSPACE_ID);
}

async function teardown() {
  await fs.rm(tmpDir, { recursive: true, force: true });
}

// ─── Full pipeline ───────────────────────────────────────────────────────

describe('Full pipeline: code + conversation', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('checkpoint captures code + messages, restore brings them back', async () => {
    // Simulate: user asks to write add.py
    await engine.addMessage('user', 'Write a python script to add 2 numbers');
    await engine.addMessage('assistant', 'Here is add.py');
    writeFile('add.py', 'def add(a, b):\n    return a + b\n\nprint(add(2, 3))\n');

    // Checkpoint v1
    const cp1 = await engine.createCheckpoint('v1-add', { workspacePath: tmpDir });
    expect(cp1.snapshotRef).toBeDefined();
    expect(cp1.messageIndex).toBe(1);

    // Verify code exists
    expect(readFile('add.py')).toContain('def add');

    // Simulate: user asks to modify the file
    await engine.addMessage('user', 'Add a subtract function');
    await engine.addMessage('assistant', 'Done, added subtract');
    writeFile('add.py', 'def add(a, b):\n    return a + b\n\ndef subtract(a, b):\n    return a - b\n\nprint(add(2, 3))\nprint(subtract(5, 2))\n');

    // Checkpoint v2
    const cp2 = await engine.createCheckpoint('v2-subtract', { workspacePath: tmpDir });
    expect(cp2.messageIndex).toBe(3);

    // Code now has subtract
    expect(readFile('add.py')).toContain('def subtract');

    // Restore to v1 — subtract should vanish
    const summary = await engine.restoreCheckpoint(cp1.id, tmpDir);
    expect(summary).not.toBeNull();
    expect(summary!.written.length).toBeGreaterThan(0);

    const restored = readFile('add.py');
    expect(restored).toContain('def add');
    expect(restored).not.toContain('def subtract');
  });

  it('branch creates isolated code + context, switch restores the other', async () => {
    // Main: write add.py
    await engine.addMessage('user', 'Write add.py');
    await engine.addMessage('assistant', 'Done');
    writeFile('add.py', 'print(2 + 3)\n');

    const cpMain = await engine.createCheckpoint('main-v1', { workspacePath: tmpDir });
    const mainBranchId = engine.getActiveBranch().id;

    // Branch: try a different approach
    const branch = await engine.branch('class-based', cpMain.id);
    await engine.addMessage('user', 'Rewrite using a class');
    await engine.addMessage('assistant', 'Here is the class version');
    writeFile('add.py', 'class Calculator:\n    def add(self, a, b):\n        return a + b\n');

    const cpBranch = await engine.createCheckpoint('class-v1', { workspacePath: tmpDir });

    // Verify: on branch, code is class-based
    expect(readFile('add.py')).toContain('class Calculator');

    // Context on branch should include main messages + branch messages
    const branchContext = engine.getContext();
    expect(branchContext).toHaveLength(4);
    expect(branchContext[0].content).toBe('Write add.py');
    expect(branchContext[2].content).toBe('Rewrite using a class');

    // Switch back to main
    await engine.switchBranch(mainBranchId);
    const mainSummary = await engine.restoreCheckpoint(cpMain.id, tmpDir);

    // Code should be the simple version again
    expect(readFile('add.py')).toBe('print(2 + 3)\n');
    expect(readFile('add.py')).not.toContain('class Calculator');

    // Context on main should only have main messages
    const mainContext = engine.getContext();
    expect(mainContext).toHaveLength(2);
    expect(mainContext[0].content).toBe('Write add.py');

    // Switch back to branch — class code returns
    await engine.switchBranch(branch.id);
    await engine.restoreCheckpoint(cpBranch.id, tmpDir);
    expect(readFile('add.py')).toContain('class Calculator');
  });

  it('new files are captured and deleted files are restored correctly', async () => {
    await engine.addMessage('user', 'Create two files');
    await engine.addMessage('assistant', 'Done');
    writeFile('file_a.py', 'print("a")\n');
    writeFile('file_b.py', 'print("b")\n');

    const cp1 = await engine.createCheckpoint('two-files', { workspacePath: tmpDir });

    // Delete file_a, add file_c
    await fs.unlink(path.join(tmpDir, 'file_a.py'));
    writeFile('file_c.py', 'print("c")\n');

    await engine.addMessage('user', 'Deleted a, added c');
    const cp2 = await engine.createCheckpoint('one-deleted', { workspacePath: tmpDir });

    expect(fileExists('file_a.py')).toBe(false);
    expect(fileExists('file_c.py')).toBe(true);

    // Restore to cp1 — file_a should come back, file_c should go away
    const summary = await engine.restoreCheckpoint(cp1.id, tmpDir);
    expect(summary).not.toBeNull();
    expect(fileExists('file_a.py')).toBe(true);
    expect(fileExists('file_c.py')).toBe(false);
    expect(readFile('file_a.py')).toBe('print("a")\n');
  });
});

// ─── Unsaved guard ───────────────────────────────────────────────────────

describe('Unsaved messages guard', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('returns 0 when all messages are checkpointed', async () => {
    await engine.addMessage('user', 'Hello');
    await engine.addMessage('assistant', 'Hi');
    await engine.createCheckpoint('all-saved', { workspacePath: tmpDir });

    expect(countUnsavedMessages()).toBe(0);
  });

  it('returns count of messages after last checkpoint', async () => {
    await engine.addMessage('user', 'Hello');
    await engine.addMessage('assistant', 'Hi');
    await engine.createCheckpoint('first', { workspacePath: tmpDir });

    await engine.addMessage('user', 'More work');
    await engine.addMessage('assistant', 'Done');
    await engine.addMessage('user', 'Even more');

    expect(countUnsavedMessages()).toBe(3);
  });

  it('returns all messages when no checkpoints exist', async () => {
    await engine.addMessage('user', 'Hello');
    await engine.addMessage('assistant', 'Hi');

    expect(countUnsavedMessages()).toBe(2);
  });

  it('only counts checkpoints on the active branch', async () => {
    // Main: 2 messages + checkpoint
    await engine.addMessage('user', 'm1');
    await engine.addMessage('assistant', 'm2');
    const cpMain = await engine.createCheckpoint('main-cp', { workspacePath: tmpDir });
    writeFile('add.py', 'print(1)\n');

    // Branch: 2 new messages, NO checkpoint
    await engine.branch('feature', cpMain.id);
    await engine.addMessage('user', 'f1');
    await engine.addMessage('assistant', 'f2');

    // Active branch is "feature" with 0 checkpoints → all 2 messages are unsaved
    expect(countUnsavedMessages()).toBe(2);

    // Main's checkpoint should NOT make this 0
    const mainCheckpoints = engine.getCheckpointsForBranch(
      engine.getBranches().find(b => b.name === 'main')!.id
    );
    expect(mainCheckpoints).toHaveLength(1);
  });
});

// ─── AGENTS.md merge ─────────────────────────────────────────────────────

describe('AGENTS.md merge logic', () => {
  it('creates new file when none exists', () => {
    const result = mergeAgentsMd(null);
    expect(result).toContain('# AGENTS');
    expect(result).toContain('<!-- variantree:agents -->');
    expect(result).toContain('When to checkpoint');
    expect(result).toContain('Presenting results to the user');
  });

  it('appends to existing file without variantree section', () => {
    const existing = '# My Project\n\nSome existing rules.\n';
    const result = mergeAgentsMd(existing);
    expect(result).toContain('# My Project');
    expect(result).toContain('Some existing rules.');
    expect(result).toContain('<!-- variantree:agents -->');
  });

  it('replaces existing variantree section', () => {
    const existing = '# My Project\n\n<!-- variantree:agents -->\nOLD CONTENT\n<!-- variantree:agents -->\n\nOther stuff.\n';
    const result = mergeAgentsMd(existing);
    expect(result).not.toContain('OLD CONTENT');
    expect(result).toContain('When to checkpoint');
    expect(result).toContain('Other stuff.');
  });

  it('does not duplicate markers', () => {
    const result = mergeAgentsMd(null);
    const markerCount = (result.match(/<!-- variantree:agents -->/g) || []).length;
    expect(markerCount).toBe(2);
  });
});

// ─── Session-aware sync ───────────────────────────────────────────────────

describe('Session-aware sync', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('workspace starts with no openCodeSessionId', async () => {
    const ws = engine.getWorkspace();
    expect(ws.openCodeSessionId).toBeUndefined();
  });

  it('setOpenCodeSessionId persists the session ID to storage', async () => {
    await engine.setOpenCodeSessionId('session-abc-123');

    const ws = engine.getWorkspace();
    expect(ws.openCodeSessionId).toBe('session-abc-123');

    // Reload from storage to verify persistence
    const storage2 = new NodeStorage(tmpDir);
    const engine2 = new VariantTree({ storage: storage2 });
    await engine2.loadWorkspace(WORKSPACE_ID);
    expect(engine2.getWorkspace().openCodeSessionId).toBe('session-abc-123');
  });

  it('setOpenCodeSessionId can be updated (e.g. user started a new OpenCode session)', async () => {
    await engine.setOpenCodeSessionId('session-v1');
    expect(engine.getWorkspace().openCodeSessionId).toBe('session-v1');

    await engine.setOpenCodeSessionId('session-v2');
    expect(engine.getWorkspace().openCodeSessionId).toBe('session-v2');
  });

  it('workspace.createdAt is a stable floor for future timestamp comparisons', async () => {
    const ws = engine.getWorkspace();
    const floor = ws.createdAt;

    // createdAt is a valid millisecond timestamp
    expect(floor).toBeGreaterThan(0);
    expect(floor).toBeLessThanOrEqual(Date.now());
  });

  it('workspace.createdAt is earlier than messages added after workspace creation', async () => {
    const ws = engine.getWorkspace();
    const floorMs = ws.createdAt;

    // Small sleep to ensure addMessage timestamp > workspace.createdAt
    await new Promise(r => setTimeout(r, 5));

    await engine.addMessage('user', 'Post-creation message');
    const branch = engine.getActiveBranch();
    const msg = branch.messages[0];

    expect(msg.timestamp).toBeGreaterThanOrEqual(floorMs);
  });
});

// ─── Context resolution across branches ──────────────────────────────────

describe('Context resolution integrity', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('deep nesting: grandchild branch has full ancestry context', async () => {
    // main: m1, m2
    await engine.addMessage('user', 'Write add.py');
    await engine.addMessage('assistant', 'Done');
    const cp1 = await engine.createCheckpoint('cp1', { workspacePath: tmpDir });

    // branch-a: m3, m4
    await engine.branch('branch-a', cp1.id);
    await engine.addMessage('user', 'Add subtract');
    await engine.addMessage('assistant', 'Added');
    const cp2 = await engine.createCheckpoint('cp2', { workspacePath: tmpDir });

    // branch-b (from branch-a): m5, m6
    await engine.branch('branch-b', cp2.id);
    await engine.addMessage('user', 'Add multiply');
    await engine.addMessage('assistant', 'Added');

    const context = engine.getContext();
    expect(context).toHaveLength(6);
    expect(context.map(m => m.content)).toEqual([
      'Write add.py', 'Done',
      'Add subtract', 'Added',
      'Add multiply', 'Added',
    ]);

    // Ancestry chain: main → branch-a → branch-b
    const ancestry = engine.getAncestry();
    expect(ancestry).toHaveLength(3);
  });

  it('sibling branches have independent contexts', async () => {
    await engine.addMessage('user', 'Write add.py');
    await engine.addMessage('assistant', 'Done');
    writeFile('add.py', 'print(2+3)\n');
    const cp = await engine.createCheckpoint('base', { workspacePath: tmpDir });
    const mainId = engine.getActiveBranch().id;

    // Branch A
    const branchA = await engine.branch('approach-a', cp.id);
    await engine.addMessage('user', 'Use functions');
    await engine.addMessage('assistant', 'Here are functions');

    // Switch back to main, create branch B
    await engine.switchBranch(mainId);
    const branchB = await engine.branch('approach-b', cp.id);
    await engine.addMessage('user', 'Use classes');
    await engine.addMessage('assistant', 'Here are classes');

    // Branch A context: main(2) + branchA(2) = 4
    const ctxA = engine.getContext(branchA.id);
    expect(ctxA).toHaveLength(4);
    expect(ctxA[2].content).toBe('Use functions');

    // Branch B context: main(2) + branchB(2) = 4
    const ctxB = engine.getContext(branchB.id);
    expect(ctxB).toHaveLength(4);
    expect(ctxB[2].content).toBe('Use classes');

    // They share the first 2 messages but diverge after
    expect(ctxA[0].content).toBe(ctxB[0].content);
    expect(ctxA[2].content).not.toBe(ctxB[2].content);
  });
});
