import { describe, it, expect, beforeEach } from 'vitest';
import { VariantTree } from '../engine';
import { MemoryStorage } from '../storage';
import { Workspace } from '../types';

describe('VariantTree Engine', () => {
  let engine: VariantTree;

  beforeEach(() => {
    engine = new VariantTree({ storage: new MemoryStorage() });
  });

  // ─── Workspace Management ──────────────────────────────────────────────

  describe('Workspace Management', () => {
    it('should create a new workspace with a main branch', async () => {
      const ws = await engine.createWorkspace('Test Workspace');

      expect(ws.title).toBe('Test Workspace');
      expect(ws.id).toBeDefined();
      expect(Object.keys(ws.branches)).toHaveLength(1);

      const mainBranch = Object.values(ws.branches)[0];
      expect(mainBranch.name).toBe('main');
      expect(mainBranch.parentCheckpointId).toBeNull();
      expect(mainBranch.messages).toEqual([]);
      expect(ws.activeBranchId).toBe(mainBranch.id);
    });

    it('should load a workspace from storage', async () => {
      const created = await engine.createWorkspace('Persistent');
      const engine2 = new VariantTree({ storage: new MemoryStorage() });

      // Different engine, same storage won't work (different MemoryStorage instance)
      // But same engine should reload
      const loaded = await engine.loadWorkspace(created.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.title).toBe('Persistent');
    });

    it('should throw when no workspace is loaded', () => {
      expect(() => engine.getContext()).toThrow('No workspace loaded');
    });
  });

  // ─── Messages ──────────────────────────────────────────────────────────

  describe('Messages', () => {
    it('should add messages to the active branch', async () => {
      await engine.createWorkspace('Chat');

      const msg1 = await engine.addMessage('user', 'Hello');
      const msg2 = await engine.addMessage('assistant', 'Hi there!');

      expect(msg1.role).toBe('user');
      expect(msg1.content).toBe('Hello');
      expect(msg1.id).toBeDefined();
      expect(msg1.timestamp).toBeGreaterThan(0);

      const branch = engine.getActiveBranch();
      expect(branch.messages).toHaveLength(2);
      expect(branch.messages[0].content).toBe('Hello');
      expect(branch.messages[1].content).toBe('Hi there!');
    });

    it('should support message metadata', async () => {
      await engine.createWorkspace('Chat');

      const msg = await engine.addMessage('user', 'Test', { model: 'gpt-4' });
      expect(msg.metadata).toEqual({ model: 'gpt-4' });
    });
  });

  // ─── Checkpoints ───────────────────────────────────────────────────────

  describe('Checkpoints', () => {
    it('should create a checkpoint at current position', async () => {
      await engine.createWorkspace('Chat');
      await engine.addMessage('user', 'Hello');
      await engine.addMessage('assistant', 'Hi');

      const cp = await engine.createCheckpoint('After greeting');

      expect(cp.label).toBe('After greeting');
      expect(cp.messageIndex).toBe(1); // After second message (index 1)
      expect(cp.id).toBeDefined();

      const checkpoints = engine.getCheckpoints();
      expect(checkpoints).toHaveLength(1);
      expect(checkpoints[0].label).toBe('After greeting');
    });

    it('should create checkpoint at -1 when no messages exist', async () => {
      await engine.createWorkspace('Empty');
      const cp = await engine.createCheckpoint('Start');
      expect(cp.messageIndex).toBe(-1);
    });

    it('should list checkpoints for a specific branch', async () => {
      await engine.createWorkspace('Chat');
      await engine.addMessage('user', 'msg1');
      const cp1 = await engine.createCheckpoint('First');
      await engine.addMessage('user', 'msg2');
      const cp2 = await engine.createCheckpoint('Second');

      const mainBranch = engine.getActiveBranch();
      const branchCheckpoints = engine.getCheckpointsForBranch(mainBranch.id);
      expect(branchCheckpoints).toHaveLength(2);
    });
  });

  // ─── Branching ──────────────────────────────────────────────────────────

  describe('Branching', () => {
    it('should create a branch from a checkpoint', async () => {
      await engine.createWorkspace('Chat');
      await engine.addMessage('user', 'Help with auth');
      await engine.addMessage('assistant', 'Here are options...');

      const cp = await engine.createCheckpoint('Auth decision');
      const branch = await engine.branch('explore-jwt', cp.id);

      expect(branch.name).toBe('explore-jwt');
      expect(branch.parentCheckpointId).toBe(cp.id);
      expect(branch.messages).toEqual([]);

      // Should auto-switch to new branch
      const active = engine.getActiveBranch();
      expect(active.id).toBe(branch.id);
    });

    it('should auto-create checkpoint when branching without one', async () => {
      await engine.createWorkspace('Chat');
      await engine.addMessage('user', 'Hello');
      await engine.addMessage('assistant', 'Hi');

      const branch = await engine.branch('side-quest');

      // Should have auto-created a checkpoint
      const checkpoints = engine.getCheckpoints();
      expect(checkpoints).toHaveLength(1);
      expect(checkpoints[0].label).toContain('Auto');
      expect(branch.parentCheckpointId).toBe(checkpoints[0].id);
    });

    it('should prevent duplicate branch names', async () => {
      await engine.createWorkspace('Chat');
      await engine.addMessage('user', 'Hello');
      await engine.branch('feature-a');

      await expect(engine.branch('feature-a')).rejects.toThrow(
        'Branch "feature-a" already exists'
      );
    });

    it('should list all branches', async () => {
      await engine.createWorkspace('Chat');
      await engine.addMessage('user', 'Hello');
      await engine.branch('branch-a');

      const branches = engine.getBranches();
      expect(branches).toHaveLength(2);

      const mainBranch = branches.find((b) => b.name === 'main');
      const branchA = branches.find((b) => b.name === 'branch-a');
      expect(mainBranch).toBeDefined();
      expect(branchA).toBeDefined();
      expect(branchA!.isActive).toBe(true);
      expect(mainBranch!.isActive).toBe(false);
    });
  });

  // ─── Branch Switching ──────────────────────────────────────────────────

  describe('Branch Switching', () => {
    it('should switch between branches', async () => {
      const ws = await engine.createWorkspace('Chat');
      const mainId = ws.activeBranchId;

      await engine.addMessage('user', 'On main');
      await engine.branch('side');
      await engine.addMessage('user', 'On side');

      // Should be on side branch
      expect(engine.getActiveBranch().name).toBe('side');

      // Switch back to main
      await engine.switchBranch(mainId);
      expect(engine.getActiveBranch().name).toBe('main');
      expect(engine.getActiveBranch().messages).toHaveLength(1);
      expect(engine.getActiveBranch().messages[0].content).toBe('On main');
    });

    it('should throw when switching to non-existent branch', async () => {
      await engine.createWorkspace('Chat');
      await expect(engine.switchBranch('nonexistent')).rejects.toThrow(
        'Branch "nonexistent" not found'
      );
    });
  });

  // ─── Context Resolution ────────────────────────────────────────────────

  describe('Context Resolution', () => {
    it('should return all messages for the main branch', async () => {
      await engine.createWorkspace('Chat');
      await engine.addMessage('user', 'msg1');
      await engine.addMessage('assistant', 'msg2');
      await engine.addMessage('user', 'msg3');

      const context = engine.getContext();
      expect(context).toHaveLength(3);
      expect(context.map((m) => m.content)).toEqual(['msg1', 'msg2', 'msg3']);
    });

    it('should resolve context across one branch', async () => {
      const ws = await engine.createWorkspace('Chat');

      // Add messages to main
      await engine.addMessage('user', 'm1');
      await engine.addMessage('assistant', 'm2');
      await engine.addMessage('user', 'm3');

      // Checkpoint after m3, then branch
      const cp = await engine.createCheckpoint('Decision point');
      await engine.branch('explore', cp.id);

      // Add messages on the branch
      await engine.addMessage('user', 'm4-branch');
      await engine.addMessage('assistant', 'm5-branch');

      // Context should be m1, m2, m3 (from main) + m4-branch, m5-branch (from branch)
      const context = engine.getContext();
      expect(context).toHaveLength(5);
      expect(context.map((m) => m.content)).toEqual([
        'm1', 'm2', 'm3', 'm4-branch', 'm5-branch',
      ]);
    });

    it('should resolve context across deep nested branches (3 levels)', async () => {
      await engine.createWorkspace('Chat');

      // Main: m1, m2
      await engine.addMessage('user', 'm1');
      await engine.addMessage('assistant', 'm2');
      const cp1 = await engine.createCheckpoint('CP1');

      // Branch A: m3, m4
      await engine.branch('branch-a', cp1.id);
      await engine.addMessage('user', 'm3');
      await engine.addMessage('assistant', 'm4');
      const cp2 = await engine.createCheckpoint('CP2');

      // Branch B (from Branch A): m5, m6
      await engine.branch('branch-b', cp2.id);
      await engine.addMessage('user', 'm5');
      await engine.addMessage('assistant', 'm6');

      // Context for branch-b: m1, m2 (main) + m3, m4 (branch-a) + m5, m6 (branch-b)
      const context = engine.getContext();
      expect(context).toHaveLength(6);
      expect(context.map((m) => m.content)).toEqual([
        'm1', 'm2', 'm3', 'm4', 'm5', 'm6',
      ]);
    });

    it('should resolve context with mid-branch checkpoints', async () => {
      await engine.createWorkspace('Chat');

      // Main: m1, m2, m3, m4, m5
      await engine.addMessage('user', 'm1');
      await engine.addMessage('assistant', 'm2');

      // Checkpoint after m2 (not at the end)
      const cp = await engine.createCheckpoint('After m2');

      await engine.addMessage('user', 'm3');
      await engine.addMessage('assistant', 'm4');
      await engine.addMessage('user', 'm5');

      // Branch from checkpoint (after m2)
      await engine.branch('side', cp.id);
      await engine.addMessage('user', 'side-1');
      await engine.addMessage('assistant', 'side-2');

      // Context for side branch: m1, m2 (main up to checkpoint) + side-1, side-2
      const context = engine.getContext();
      expect(context).toHaveLength(4);
      expect(context.map((m) => m.content)).toEqual([
        'm1', 'm2', 'side-1', 'side-2',
      ]);

      // Main should still have all 5 messages
      const mainBranches = engine.getBranches().find((b) => b.name === 'main');
      expect(mainBranches!.messageCount).toBe(5);
    });

    it('should not duplicate messages in storage', async () => {
      await engine.createWorkspace('Chat');

      // Add 10 messages to main
      for (let i = 0; i < 10; i++) {
        await engine.addMessage('user', `msg-${i}`);
      }

      const cp = await engine.createCheckpoint('Mid');

      // Create 3 branches from the same checkpoint
      for (let i = 0; i < 3; i++) {
        await engine.branch(`branch-${i}`, cp.id);
        await engine.addMessage('user', `branch-${i}-msg`);

        // Switch back to main for next branch
        const mainId = engine.getBranches().find((b) => b.name === 'main')!.id;
        await engine.switchBranch(mainId);
      }

      // Total stored messages: 10 (main) + 1 each in 3 branches = 13
      // NOT 10*3 + 3 = 33 (what duplication would give)
      const ws = engine.getWorkspace();
      const totalMessages = Object.values(ws.branches).reduce(
        (sum, b) => sum + b.messages.length,
        0
      );
      expect(totalMessages).toBe(13);
    });
  });

  // ─── Branch Deletion ───────────────────────────────────────────────────

  describe('Branch Deletion', () => {
    it('should delete a branch', async () => {
      await engine.createWorkspace('Chat');
      const mainId = engine.getActiveBranch().id;

      await engine.addMessage('user', 'Hello');
      const newBranch = await engine.branch('temp');

      await engine.switchBranch(mainId);
      await engine.deleteBranch(newBranch.id);

      expect(engine.getBranches()).toHaveLength(1);
      expect(engine.getBranches()[0].name).toBe('main');
    });

    it('should not allow deleting the main branch', async () => {
      await engine.createWorkspace('Chat');
      const mainId = engine.getActiveBranch().id;

      await expect(engine.deleteBranch(mainId)).rejects.toThrow(
        'Cannot delete the main branch'
      );
    });

    it('should not allow deleting the active branch', async () => {
      await engine.createWorkspace('Chat');
      await engine.addMessage('user', 'Hello');
      const branch = await engine.branch('active-one');

      await expect(engine.deleteBranch(branch.id)).rejects.toThrow(
        'Cannot delete the currently active branch'
      );
    });

    it('should not allow deleting a branch with children', async () => {
      await engine.createWorkspace('Chat');
      await engine.addMessage('user', 'Hello');

      // main → branch-a → branch-b
      const branchA = await engine.branch('branch-a');
      await engine.addMessage('user', 'On A');
      const cp = await engine.createCheckpoint('On A CP');
      await engine.branch('branch-b', cp.id);

      // Try to delete branch-a (has child branch-b)
      const mainId = engine.getBranches().find((b) => b.name === 'main')!.id;
      await engine.switchBranch(mainId);

      await expect(engine.deleteBranch(branchA.id)).rejects.toThrow(
        'has child branches'
      );
    });
  });

  // ─── Ancestry ──────────────────────────────────────────────────────────

  describe('Branch Ancestry', () => {
    it('should return ancestry for root branch', async () => {
      const ws = await engine.createWorkspace('Chat');
      const ancestry = engine.getAncestry();
      expect(ancestry).toHaveLength(1);
      expect(ancestry[0]).toBe(ws.activeBranchId);
    });

    it('should return full ancestry chain for nested branches', async () => {
      await engine.createWorkspace('Chat');
      await engine.addMessage('user', 'm1');
      const cp1 = await engine.createCheckpoint('CP1');

      const branchA = await engine.branch('a', cp1.id);
      await engine.addMessage('user', 'm2');
      const cp2 = await engine.createCheckpoint('CP2');

      const branchB = await engine.branch('b', cp2.id);

      const ancestry = engine.getAncestry();
      expect(ancestry).toHaveLength(3);
      // root → branch-a → branch-b
      const mainId = engine.getBranches().find((b) => b.name === 'main')!.id;
      expect(ancestry[0]).toBe(mainId);
      expect(ancestry[1]).toBe(branchA.id);
      expect(ancestry[2]).toBe(branchB.id);
    });
  });
});
