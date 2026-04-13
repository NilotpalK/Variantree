/**
 * @variantree/core — VariantTree Engine
 *
 * The main public API for Variantree. Manages workspaces, branches,
 * checkpoints, and context resolution.
 *
 * @example
 * ```typescript
 * import { VariantTree, MemoryStorage } from '@variantree/core';
 *
 * const engine = new VariantTree({ storage: new MemoryStorage() });
 * const workspace = await engine.createWorkspace('Auth system design');
 *
 * // Add messages to the main branch
 * await engine.addMessage('user', 'Help me design an auth system');
 * await engine.addMessage('assistant', 'Here are some options...');
 *
 * // Create a checkpoint at this decision point
 * const cpId = await engine.createCheckpoint('Auth options reviewed');
 *
 * // Branch to explore JWT
 * await engine.branch('explore-jwt', cpId);
 * await engine.addMessage('user', 'Let\'s go with JWT');
 *
 * // Switch back to main and try OAuth
 * const mainId = workspace.activeBranchId; // saved earlier
 * await engine.switchBranch(mainBranchId);
 * ```
 */

import {
  Workspace,
  Branch,
  Checkpoint,
  Message,
  StorageBackend,
  SnapshotProvider,
  VariantTreeOptions,
} from './types';
import { resolveContext, getBranchAncestry } from './context';
import { generateId, hashContent, now } from './utils';

export class VariantTree {
  private storage: StorageBackend;
  private snapshotProvider: SnapshotProvider | null;
  private workspace: Workspace | null = null;

  constructor(options: VariantTreeOptions) {
    this.storage = options.storage;
    this.snapshotProvider = options.snapshotProvider ?? null;
  }

  // ─── Workspace Management ────────────────────────────────────────────────

  /**
   * Create a new workspace with an initial "main" branch.
   *
   * @param title - Human-readable title for the workspace
   * @returns The created workspace
   */
  async createWorkspace(title: string): Promise<Workspace> {
    const mainBranch: Branch = {
      id: generateId(),
      name: 'main',
      parentCheckpointId: null,
      messages: [],
      createdAt: now(),
    };

    const workspace: Workspace = {
      id: generateId(),
      title,
      branches: { [mainBranch.id]: mainBranch },
      checkpoints: {},
      activeBranchId: mainBranch.id,
      createdAt: now(),
      updatedAt: now(),
    };

    this.workspace = workspace;
    await this.save();
    return workspace;
  }

  /**
   * Load an existing workspace from storage.
   *
   * @param id - Workspace ID to load
   * @returns The loaded workspace, or null if not found
   */
  async loadWorkspace(id: string): Promise<Workspace | null> {
    const workspace = await this.storage.load(id);
    if (workspace) {
      this.workspace = workspace;
    }
    return workspace;
  }

  /**
   * List all workspace IDs in storage.
   */
  async listWorkspaces(): Promise<string[]> {
    return this.storage.list();
  }

  /**
   * Delete a workspace from storage.
   */
  async deleteWorkspace(id: string): Promise<void> {
    await this.storage.delete(id);
    if (this.workspace?.id === id) {
      this.workspace = null;
    }
  }

  // ─── Messages ────────────────────────────────────────────────────────────

  /**
   * Add a message to the active branch.
   * Auto-saves to storage after adding.
   *
   * @param role - Who sent the message ('user', 'assistant', 'system')
   * @param content - The message text
   * @param metadata - Optional metadata
   * @returns The created message
   */
  async addMessage(
    role: Message['role'],
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<Message> {
    const ws = this.requireWorkspace();

    const message: Message = {
      id: generateId(),
      role,
      content,
      timestamp: now(),
      ...(metadata && { metadata }),
    };

    const branch = ws.branches[ws.activeBranchId];
    if (!branch) {
      throw new Error(`Active branch "${ws.activeBranchId}" not found`);
    }

    branch.messages.push(message);
    ws.updatedAt = now();
    await this.save();

    return message;
  }

  // ─── Checkpoints ─────────────────────────────────────────────────────────

  /**
   * Create a checkpoint at the current position in the active branch.
   *
   * A checkpoint marks a decision point where you might want to branch later.
   * The checkpoint is placed after the last message in the active branch.
   *
   * If a `workspacePath` is provided and snapshot adapters are configured,
   * a code snapshot is automatically taken and attached to the checkpoint.
   *
   * @param label - Human-readable label for the checkpoint
   * @param options - Optional: metadata and workspacePath for code snapshot
   * @returns The created checkpoint
   */
  async createCheckpoint(
    label: string,
    options?: {
      metadata?: Record<string, unknown>;
      workspacePath?: string;
    }
  ): Promise<Checkpoint> {
    const ws = this.requireWorkspace();
    const branch = ws.branches[ws.activeBranchId];

    if (!branch) {
      throw new Error(`Active branch "${ws.activeBranchId}" not found`);
    }

    const messageIndex = branch.messages.length - 1;

    // Generate content-addressed ID from the context at this point
    const contextSnapshot = JSON.stringify({
      branchId: branch.id,
      messageIndex,
      label,
      timestamp: now(),
    });

    const checkpoint: Checkpoint = {
      id: hashContent(contextSnapshot),
      label,
      branchId: branch.id,
      messageIndex,
      createdAt: now(),
      ...(options?.metadata && { metadata: options.metadata }),
    };

    if (options?.workspacePath && this.snapshotProvider) {
      checkpoint.snapshotRef = await this.snapshotProvider.capture(
        options.workspacePath,
        label,
      );
    }

    ws.checkpoints[checkpoint.id] = checkpoint;
    ws.updatedAt = now();
    await this.save();

    return checkpoint;
  }

  /**
   * List all checkpoints in the workspace.
   */
  getCheckpoints(): Checkpoint[] {
    const ws = this.requireWorkspace();
    return Object.values(ws.checkpoints);
  }

  /**
   * Get checkpoints for a specific branch.
   */
  getCheckpointsForBranch(branchId: string): Checkpoint[] {
    const ws = this.requireWorkspace();
    return Object.values(ws.checkpoints).filter(
      (cp) => cp.branchId === branchId
    );
  }

  /**
   * Restore the workspace to the state at a given checkpoint.
   *
   * If the checkpoint has a code snapshot and adapters are configured,
   * the workspace files are restored to match the snapshot.
   * Also switches the conversation to the checkpoint's branch.
   *
   * @param checkpointId - The checkpoint to restore
   * @param workspacePath - Path to the workspace root (required for code restore)
   * @returns Restore summary or null if no snapshot was attached
   */
  async restoreCheckpoint(
    checkpointId: string,
    workspacePath?: string,
  ) {
    const ws = this.requireWorkspace();
    const checkpoint = ws.checkpoints[checkpointId];

    if (!checkpoint) {
      throw new Error(`Checkpoint "${checkpointId}" not found`);
    }

    // Switch to the checkpoint's branch
    await this.switchBranch(checkpoint.branchId);

    if (checkpoint.snapshotRef && workspacePath && this.snapshotProvider) {
      return this.snapshotProvider.restore(workspacePath, checkpoint.snapshotRef);
    }

    return null;
  }

  // ─── Branching ───────────────────────────────────────────────────────────

  /**
   * Create a new branch.
   *
   * If checkpointId is provided, branches from that checkpoint.
   * If not provided, auto-creates a checkpoint at the current position
   * in the active branch, then branches from it.
   *
   * @param name - Human-readable name for the new branch
   * @param checkpointId - Optional checkpoint to branch from
   * @returns The created branch
   */
  async branch(name: string, checkpointId?: string): Promise<Branch> {
    const ws = this.requireWorkspace();

    // Validate name uniqueness
    const existingBranch = Object.values(ws.branches).find(
      (b) => b.name === name
    );
    if (existingBranch) {
      throw new Error(`Branch "${name}" already exists`);
    }

    // If no checkpoint specified, auto-create one
    let cpId = checkpointId;
    if (!cpId) {
      const autoCheckpoint = await this.createCheckpoint(`Auto: before "${name}"`);
      cpId = autoCheckpoint.id;
    } else {
      // Validate checkpoint exists
      if (!ws.checkpoints[cpId]) {
        throw new Error(`Checkpoint "${cpId}" not found`);
      }
    }

    const newBranch: Branch = {
      id: generateId(),
      name,
      parentCheckpointId: cpId,
      messages: [],
      createdAt: now(),
    };

    ws.branches[newBranch.id] = newBranch;
    ws.activeBranchId = newBranch.id; // Auto-switch to new branch
    ws.updatedAt = now();
    await this.save();

    return newBranch;
  }

  /**
   * Switch to a different branch.
   *
   * @param branchId - The branch ID to switch to
   */
  async switchBranch(branchId: string): Promise<void> {
    const ws = this.requireWorkspace();

    if (!ws.branches[branchId]) {
      throw new Error(`Branch "${branchId}" not found`);
    }

    ws.activeBranchId = branchId;
    ws.updatedAt = now();
    await this.save();
  }

  /**
   * Delete a branch and its associated checkpoints.
   * Cannot delete the main branch or the currently active branch.
   *
   * @param branchId - The branch to delete
   */
  async deleteBranch(branchId: string): Promise<void> {
    const ws = this.requireWorkspace();
    const branch = ws.branches[branchId];

    if (!branch) {
      throw new Error(`Branch "${branchId}" not found`);
    }
    if (branch.name === 'main') {
      throw new Error('Cannot delete the main branch');
    }
    if (ws.activeBranchId === branchId) {
      throw new Error('Cannot delete the currently active branch. Switch first.');
    }

    // Check for child branches (branches whose parent checkpoint is on this branch)
    const childBranches = Object.values(ws.branches).filter((b) => {
      if (!b.parentCheckpointId) return false;
      const cp = ws.checkpoints[b.parentCheckpointId];
      return cp && cp.branchId === branchId;
    });

    if (childBranches.length > 0) {
      const childNames = childBranches.map((b) => b.name).join(', ');
      throw new Error(
        `Cannot delete branch "${branch.name}" — it has child branches: ${childNames}. Delete them first.`
      );
    }

    // Remove checkpoints that belong to this branch
    for (const [cpId, cp] of Object.entries(ws.checkpoints)) {
      if (cp.branchId === branchId) {
        delete ws.checkpoints[cpId];
      }
    }

    // Remove the branch
    delete ws.branches[branchId];
    ws.updatedAt = now();
    await this.save();
  }

  /**
   * List all branches in the workspace with metadata.
   */
  getBranches(): Array<Branch & { isActive: boolean; messageCount: number }> {
    const ws = this.requireWorkspace();
    return Object.values(ws.branches).map((branch) => ({
      ...branch,
      isActive: branch.id === ws.activeBranchId,
      messageCount: branch.messages.length,
    }));
  }

  // ─── Context Resolution ──────────────────────────────────────────────────

  /**
   * Get the full conversation context for a branch.
   * Walks up the tree from the specified branch to root.
   *
   * @param branchId - Branch to get context for (defaults to active branch)
   * @returns Ordered messages from root to the branch
   */
  getContext(branchId?: string): Message[] {
    const ws = this.requireWorkspace();
    const targetBranchId = branchId ?? ws.activeBranchId;
    return resolveContext(ws, targetBranchId);
  }

  /**
   * Get the branch ancestry chain (root → target).
   * Useful for breadcrumb navigation.
   *
   * @param branchId - Branch to trace (defaults to active branch)
   * @returns Branch IDs from root to target
   */
  getAncestry(branchId?: string): string[] {
    const ws = this.requireWorkspace();
    const targetBranchId = branchId ?? ws.activeBranchId;
    return getBranchAncestry(ws, targetBranchId);
  }

  // ─── State Access ────────────────────────────────────────────────────────

  /**
   * Get the full workspace state (for visualization or export).
   */
  getWorkspace(): Workspace {
    return this.requireWorkspace();
  }

  /**
   * Get the pinned session ID for a given adapter.
   * Falls back to the legacy openCodeSessionId field for backward compatibility.
   */
  getSessionId(adapterName: string): string | undefined {
    const ws = this.requireWorkspace();
    return ws.sessionIds?.[adapterName]
      ?? (adapterName === 'opencode' ? ws.openCodeSessionId : undefined);
  }

  /**
   * Persist the session ID for a given adapter.
   * Also keeps the legacy openCodeSessionId field in sync for 'opencode'.
   */
  async setSessionId(adapterName: string, sessionId: string): Promise<void> {
    const ws = this.requireWorkspace();
    if (!ws.sessionIds) ws.sessionIds = {};
    ws.sessionIds[adapterName] = sessionId;
    if (adapterName === 'opencode') ws.openCodeSessionId = sessionId;
    ws.updatedAt = now();
    await this.save();
  }

  /**
   * @deprecated Use setSessionId('opencode', sessionId) instead.
   */
  async setOpenCodeSessionId(sessionId: string): Promise<void> {
    return this.setSessionId('opencode', sessionId);
  }

  /**
   * Get the currently active branch.
   */
  getActiveBranch(): Branch {
    const ws = this.requireWorkspace();
    const branch = ws.branches[ws.activeBranchId];
    if (!branch) {
      throw new Error(`Active branch "${ws.activeBranchId}" not found`);
    }
    return branch;
  }

  // ─── Internal Helpers ────────────────────────────────────────────────────

  /**
   * Ensure a workspace is loaded. Throws if not.
   */
  private requireWorkspace(): Workspace {
    if (!this.workspace) {
      throw new Error(
        'No workspace loaded. Call createWorkspace() or loadWorkspace() first.'
      );
    }
    return this.workspace;
  }

  /**
   * Persist the current workspace to storage.
   */
  private async save(): Promise<void> {
    if (this.workspace) {
      await this.storage.save(this.workspace.id, this.workspace);
    }
  }
}
