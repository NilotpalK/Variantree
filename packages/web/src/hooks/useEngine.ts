import { useState, useCallback, useRef, useEffect } from 'react';
import {
  VariantTree,
  MemoryStorage,
  Workspace,
  Branch,
  Checkpoint,
  Message,
} from '@variantree/core';

export interface EngineState {
  workspace: Workspace | null;
  context: Message[];
  branches: Array<Branch & { isActive: boolean; messageCount: number }>;
  checkpoints: Checkpoint[];
  activeBranch: Branch | null;
  ancestry: string[];
}

export interface EngineActions {
  createWorkspace: (title: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  createCheckpoint: (label: string) => Promise<void>;
  branch: (name: string, checkpointId?: string) => Promise<void>;
  switchBranch: (branchId: string) => Promise<void>;
  deleteBranch: (branchId: string) => Promise<void>;
}

/**
 * React hook wrapping the VariantTree engine.
 * Provides reactive state + actions for the UI.
 */
export function useEngine(): EngineState & EngineActions {
  const engineRef = useRef<VariantTree>(
    new VariantTree({ storage: new MemoryStorage() })
  );

  const [state, setState] = useState<EngineState>({
    workspace: null,
    context: [],
    branches: [],
    checkpoints: [],
    activeBranch: null,
    ancestry: [],
  });

  // Sync React state with engine state
  const syncState = useCallback(() => {
    const engine = engineRef.current;
    try {
      const workspace = engine.getWorkspace();
      setState({
        workspace,
        context: engine.getContext(),
        branches: engine.getBranches(),
        checkpoints: engine.getCheckpoints(),
        activeBranch: engine.getActiveBranch(),
        ancestry: engine.getAncestry(),
      });
    } catch {
      // No workspace loaded yet
    }
  }, []);

  // Auto-create workspace on mount
  useEffect(() => {
    engineRef.current.createWorkspace('New Conversation').then(syncState);
  }, [syncState]);

  const createWorkspace = useCallback(async (title: string) => {
    await engineRef.current.createWorkspace(title);
    syncState();
  }, [syncState]);

  const sendMessage = useCallback(async (content: string) => {
    await engineRef.current.addMessage('user', content);
    // Simulate AI response
    await engineRef.current.addMessage(
      'assistant',
      generateMockResponse(content)
    );
    syncState();
  }, [syncState]);

  const createCheckpoint = useCallback(async (label: string) => {
    await engineRef.current.createCheckpoint(label);
    syncState();
  }, [syncState]);

  const branchAction = useCallback(async (name: string, checkpointId?: string) => {
    await engineRef.current.branch(name, checkpointId);
    syncState();
  }, [syncState]);

  const switchBranch = useCallback(async (branchId: string) => {
    await engineRef.current.switchBranch(branchId);
    syncState();
  }, [syncState]);

  const deleteBranch = useCallback(async (branchId: string) => {
    await engineRef.current.deleteBranch(branchId);
    syncState();
  }, [syncState]);

  return {
    ...state,
    createWorkspace,
    sendMessage,
    createCheckpoint,
    branch: branchAction,
    switchBranch,
    deleteBranch,
  };
}

// Simple mock AI responses for the prototype
function generateMockResponse(userMessage: string): string {
  const lower = userMessage.toLowerCase();

  if (lower.includes('hello') || lower.includes('hi')) {
    return "Hello! I'm your AI assistant in Variantree. Try creating checkpoints and branches to explore different conversation paths!";
  }
  if (lower.includes('branch') || lower.includes('checkpoint')) {
    return "Great idea! Use the 📌 button to create a checkpoint at this point, then use 🌿 to branch off and explore a different direction. You can always switch back!";
  }
  if (lower.includes('help')) {
    return "Here's how Variantree works:\n\n1. **Send messages** as normal\n2. **Create checkpoints** 📌 at decision points\n3. **Branch** 🌿 to explore alternatives\n4. **Switch** between branches in the sidebar\n\nYour conversation tree builds as you explore!";
  }

  const responses = [
    `That's an interesting point about "${userMessage.slice(0, 30)}..." — let me think through the implications.`,
    `I see what you're getting at. There are a few ways to approach this. Would you like to explore them on separate branches?`,
    `Good question. Here's my analysis:\n\n• First, consider the tradeoffs involved\n• Second, think about the long-term impact\n• Third, you might want to branch here to compare approaches`,
    `Building on that thought — this seems like a good decision point. You might want to checkpoint 📌 here before we go deeper.`,
  ];

  return responses[Math.floor(Math.random() * responses.length)];
}
