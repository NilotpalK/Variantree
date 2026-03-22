import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorage } from '../storage';
import { Workspace } from '../types';

function createTestWorkspace(id: string = 'test-ws'): Workspace {
  return {
    id,
    title: 'Test Workspace',
    branches: {
      'branch-1': {
        id: 'branch-1',
        name: 'main',
        parentCheckpointId: null,
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Hello',
            timestamp: Date.now(),
          },
        ],
        createdAt: Date.now(),
      },
    },
    checkpoints: {},
    activeBranchId: 'branch-1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe('MemoryStorage', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('should save and load a workspace', async () => {
    const ws = createTestWorkspace();
    await storage.save(ws.id, ws);

    const loaded = await storage.load(ws.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(ws.id);
    expect(loaded!.title).toBe('Test Workspace');
    expect(Object.keys(loaded!.branches)).toHaveLength(1);
  });

  it('should return null for non-existent workspace', async () => {
    const loaded = await storage.load('nonexistent');
    expect(loaded).toBeNull();
  });

  it('should deep clone on save (mutation safety)', async () => {
    const ws = createTestWorkspace();
    await storage.save(ws.id, ws);

    // Mutate original
    ws.title = 'MUTATED';
    ws.branches['branch-1'].messages.push({
      id: 'msg-2',
      role: 'assistant',
      content: 'Mutated!',
      timestamp: Date.now(),
    });

    // Loaded should not reflect mutation
    const loaded = await storage.load(ws.id);
    expect(loaded!.title).toBe('Test Workspace');
    expect(loaded!.branches['branch-1'].messages).toHaveLength(1);
  });

  it('should deep clone on load (mutation safety)', async () => {
    const ws = createTestWorkspace();
    await storage.save(ws.id, ws);

    const loaded1 = await storage.load(ws.id);
    loaded1!.title = 'MUTATED';

    const loaded2 = await storage.load(ws.id);
    expect(loaded2!.title).toBe('Test Workspace');
  });

  it('should list all workspace IDs', async () => {
    await storage.save('ws-1', createTestWorkspace('ws-1'));
    await storage.save('ws-2', createTestWorkspace('ws-2'));
    await storage.save('ws-3', createTestWorkspace('ws-3'));

    const ids = await storage.list();
    expect(ids).toHaveLength(3);
    expect(ids).toContain('ws-1');
    expect(ids).toContain('ws-2');
    expect(ids).toContain('ws-3');
  });

  it('should delete a workspace', async () => {
    await storage.save('ws-1', createTestWorkspace('ws-1'));
    expect(await storage.load('ws-1')).not.toBeNull();

    await storage.delete('ws-1');
    expect(await storage.load('ws-1')).toBeNull();
  });

  it('should handle deleting non-existent workspace gracefully', async () => {
    await expect(storage.delete('nonexistent')).resolves.not.toThrow();
  });
});
