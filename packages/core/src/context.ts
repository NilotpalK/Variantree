/**
 * @variantree/core — Context Resolution
 *
 * The core algorithm: walk up the branch tree to reconstruct
 * the full conversation context for any branch. Zero message duplication.
 *
 * How it works:
 *   1. Start at the target branch
 *   2. Collect its messages
 *   3. Find its parent checkpoint → get the parent branch + message index
 *   4. Collect parent branch messages up to that index
 *   5. Repeat until you reach the root branch (parentCheckpointId === null)
 *   6. Reverse and concatenate: root messages + ... + target messages
 */

import { Workspace, Message, Branch, Checkpoint } from './types';

/**
 * Resolve the full conversation context for a branch by walking up the tree.
 *
 * This is the key efficiency mechanism: each branch only stores its own messages,
 * and we reconstruct the full history by traversing parent checkpoints.
 *
 * @param workspace - The workspace containing all branches and checkpoints
 * @param branchId - The branch to resolve context for
 * @returns The complete ordered list of messages from root to this branch
 * @throws Error if branch or checkpoint references are broken
 *
 * @example
 * ```
 * // main: [m1, m2, m3] → checkpoint at index 2 → explore-oauth: [m4, m5]
 * resolveContext(workspace, "explore-oauth")
 * // Returns: [m1, m2, m3, m4, m5]
 * ```
 */
export function resolveContext(workspace: Workspace, branchId: string): Message[] {
  const branch: Branch | undefined = workspace.branches[branchId];
  if (!branch) {
    throw new Error(`Branch "${branchId}" not found in workspace`);
  }

  // For root branch, just return all messages
  if (branch.parentCheckpointId === null) {
    return [...branch.messages];
  }

  // For non-root branches, use resolveContextUpTo with all messages
  return resolveContextUpTo(workspace, branchId, branch.messages.length - 1);
}

/**
 * Resolve context for a branch up to a specific message index.
 * Used internally when walking up through intermediate branches.
 *
 * @param workspace - The workspace
 * @param branchId - The branch to resolve
 * @param upToIndex - Include messages up to this index (inclusive)
 * @returns Messages from root through this branch, up to the specified index
 */
function resolveContextUpTo(
  workspace: Workspace,
  branchId: string,
  upToIndex: number
): Message[] {
  const branch: Branch | undefined = workspace.branches[branchId];
  if (!branch) {
    throw new Error(`Branch "${branchId}" not found in workspace`);
  }

  // Get this branch's messages up to the index
  const branchMessages: Message[] = branch.messages.slice(0, upToIndex + 1);

  if (branch.parentCheckpointId === null) {
    // Root branch — just return the sliced messages
    return branchMessages;
  }

  // Walk up to parent
  const checkpoint: Checkpoint | undefined = workspace.checkpoints[branch.parentCheckpointId];
  if (!checkpoint) {
    throw new Error(
      `Checkpoint "${branch.parentCheckpointId}" not found for branch "${branch.name}"`
    );
  }

  // Recursively resolve parent's context up to the checkpoint
  const parentContext: Message[] = resolveContextUpTo(
    workspace,
    checkpoint.branchId,
    checkpoint.messageIndex
  );

  return [...parentContext, ...branchMessages];
}

/**
 * Get the branch ancestry chain from a branch to root.
 * Useful for visualization — shows the path through the tree.
 *
 * @param workspace - The workspace
 * @param branchId - The branch to trace from
 * @returns Array of branch IDs from root to the specified branch
 */
export function getBranchAncestry(workspace: Workspace, branchId: string): string[] {
  const ancestry: string[] = [];
  let currentBranchId: string | null = branchId;

  while (currentBranchId !== null) {
    ancestry.push(currentBranchId);
    const branch: Branch | undefined = workspace.branches[currentBranchId];
    if (!branch || branch.parentCheckpointId === null) {
      break;
    }

    const checkpoint: Checkpoint | undefined = workspace.checkpoints[branch.parentCheckpointId];
    if (!checkpoint) break;

    currentBranchId = checkpoint.branchId;
  }

  return ancestry.reverse(); // root → target
}
