import { describe, it, expect, beforeEach } from 'vitest';
import { MessageDiffer } from '../differ.js';
import { OpenCodeAdapter } from '../adapters/opencode.js';
import { NodeStorage } from '../node/storage.js';
import Database from 'better-sqlite3';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ─── MessageDiffer ────────────────────────────────────────────────────────

describe('MessageDiffer', () => {
  let differ: MessageDiffer;

  beforeEach(() => {
    differ = new MessageDiffer();
  });

  it('should return all messages on first call', () => {
    const msgs = [
      { id: '1', role: 'user' as const, content: 'hello', timestamp: 1 },
      { id: '2', role: 'assistant' as const, content: 'hi', timestamp: 2 },
    ];
    const result = differ.diff(msgs);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('hello');
    expect(result[1].content).toBe('hi');
  });

  it('should return only new messages on subsequent calls', () => {
    const msgs1 = [
      { id: '1', role: 'user' as const, content: 'hello', timestamp: 1 },
    ];
    differ.diff(msgs1); // first sync

    const msgs2 = [
      { id: '1', role: 'user' as const, content: 'hello', timestamp: 1 },
      { id: '2', role: 'assistant' as const, content: 'hi', timestamp: 2 },
    ];
    const result = differ.diff(msgs2);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('hi');
  });

  it('should return empty when nothing changed', () => {
    const msgs = [
      { id: '1', role: 'user' as const, content: 'hello', timestamp: 1 },
    ];
    differ.diff(msgs);
    const result = differ.diff(msgs);
    expect(result).toHaveLength(0);
  });

  it('should handle multiple new messages', () => {
    differ.diff([]); // start empty

    const msgs = [
      { id: '1', role: 'user' as const, content: 'a', timestamp: 1 },
      { id: '2', role: 'assistant' as const, content: 'b', timestamp: 2 },
      { id: '3', role: 'user' as const, content: 'c', timestamp: 3 },
    ];
    const result = differ.diff(msgs);
    expect(result).toHaveLength(3);
  });

  it('should reset properly', () => {
    const msgs = [
      { id: '1', role: 'user' as const, content: 'hello', timestamp: 1 },
    ];
    differ.diff(msgs);
    differ.reset();
    const result = differ.diff(msgs);
    expect(result).toHaveLength(1); // sees all messages again
  });
});

// ─── OpenCode Adapter (SQLite Integration) ────────────────────────────────

describe('OpenCodeAdapter (SQLite)', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vt-opencode-'));
    dbPath = path.join(tmpDir, 'opencode.db');
  });

  /** Create a test SQLite database with OpenCode's schema and sample data. */
  function createTestDb(workspaceDir: string, messages: Array<{
    role: string;
    content: string;
    time: number;
  }>) {
    const db = new Database(dbPath);

    db.exec(`CREATE TABLE project (id TEXT PRIMARY KEY)`);
    db.exec(`INSERT INTO project VALUES ('proj1')`);

    db.exec(`CREATE TABLE session (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      parent_id TEXT,
      slug TEXT NOT NULL,
      directory TEXT NOT NULL,
      title TEXT NOT NULL,
      version TEXT NOT NULL,
      share_url TEXT,
      summary_additions INTEGER,
      summary_deletions INTEGER,
      summary_files INTEGER,
      summary_diffs TEXT,
      revert TEXT,
      permission TEXT,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      time_compacting INTEGER,
      time_archived INTEGER,
      workspace_id TEXT
    )`);

    db.exec(`CREATE TABLE message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      data TEXT NOT NULL
    )`);

    db.exec(`CREATE TABLE part (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      data TEXT NOT NULL
    )`);

    const lastTime = messages.length > 0 ? messages[messages.length - 1].time : 1000;
    db.prepare(`INSERT INTO session VALUES (
      'ses_test1', 'proj1', NULL, 'test', ?,
      'Test Session', '1.0', NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      1000, ?, NULL, NULL, NULL
    )`).run(workspaceDir, lastTime);

    const insertMsg = db.prepare(
      `INSERT INTO message VALUES (?, 'ses_test1', ?, ?, ?)`
    );
    const insertPart = db.prepare(
      `INSERT INTO part VALUES (?, ?, 'ses_test1', ?, ?, ?)`
    );

    messages.forEach((msg, i) => {
      const msgId = `msg_${i}`;
      const msgData = JSON.stringify({ role: msg.role, time: { created: msg.time } });
      insertMsg.run(msgId, msg.time, msg.time, msgData);

      const partData = JSON.stringify({ type: 'text', text: msg.content });
      insertPart.run(`prt_${i}`, msgId, msg.time, msg.time, partData);
    });

    db.close();
  }

  it('should read messages from a SQLite database', async () => {
    const workspaceDir = '/test/workspace';
    createTestDb(workspaceDir, [
      { role: 'user', content: 'Add JWT auth', time: 1000 },
      { role: 'assistant', content: 'Here is the middleware...', time: 2000 },
    ]);

    // Create adapter pointing to our test DB
    const adapter = new OpenCodeAdapter();
    // Override the DB path for testing
    (adapter as any).getDbPath = () => dbPath;

    const result = await adapter.readMessagesAsync(workspaceDir);
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('user');
    expect(result[0].content).toBe('Add JWT auth');
    expect(result[1].role).toBe('assistant');
    expect(result[1].content).toBe('Here is the middleware...');
  });

  it('should preserve message order by time_created', async () => {
    const workspaceDir = '/test/workspace';
    createTestDb(workspaceDir, [
      { role: 'user', content: 'first', time: 100 },
      { role: 'assistant', content: 'second', time: 200 },
      { role: 'user', content: 'third', time: 300 },
    ]);

    const adapter = new OpenCodeAdapter();
    (adapter as any).getDbPath = () => dbPath;

    const result = await adapter.readMessagesAsync(workspaceDir);
    expect(result).toHaveLength(3);
    expect(result[0].content).toBe('first');
    expect(result[1].content).toBe('second');
    expect(result[2].content).toBe('third');
  });

  it('should map user role correctly', async () => {
    const workspaceDir = '/test/workspace';
    createTestDb(workspaceDir, [
      { role: 'user', content: 'hello', time: 100 },
      { role: 'assistant', content: 'hi', time: 200 },
    ]);

    const adapter = new OpenCodeAdapter();
    (adapter as any).getDbPath = () => dbPath;

    const result = await adapter.readMessagesAsync(workspaceDir);
    expect(result[0].role).toBe('user');
    expect(result[1].role).toBe('assistant');
  });

  it('should return empty for non-existent workspace directory', async () => {
    createTestDb('/some/other/path', [
      { role: 'user', content: 'hello', time: 100 },
    ]);

    const adapter = new OpenCodeAdapter();
    (adapter as any).getDbPath = () => dbPath;

    const result = await adapter.readMessagesAsync('/non/existent/path');
    expect(result).toHaveLength(0);
  });

  it('should return empty when DB does not exist', async () => {
    const adapter = new OpenCodeAdapter();
    (adapter as any).getDbPath = () => '/tmp/nonexistent.db';

    const result = await adapter.readMessagesAsync('/any/path');
    expect(result).toHaveLength(0);
  });

  it('should handle empty session (no messages)', async () => {
    const workspaceDir = '/test/workspace';
    createTestDb(workspaceDir, []);

    const adapter = new OpenCodeAdapter();
    (adapter as any).getDbPath = () => dbPath;

    const result = await adapter.readMessagesAsync(workspaceDir);
    expect(result).toHaveLength(0);
  });

  it('should use message IDs from the database', async () => {
    const workspaceDir = '/test/workspace';
    createTestDb(workspaceDir, [
      { role: 'user', content: 'hello', time: 100 },
    ]);

    const adapter = new OpenCodeAdapter();
    (adapter as any).getDbPath = () => dbPath;

    const result = await adapter.readMessagesAsync(workspaceDir);
    expect(result[0].id).toBe('msg_0');
  });

  it('should have correct adapter name', () => {
    const adapter = new OpenCodeAdapter();
    expect(adapter.name).toBe('opencode');
  });
});

// ─── NodeStorage ──────────────────────────────────────────────────────────

describe('NodeStorage', () => {
  let tmpDir: string;
  let storage: NodeStorage;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vt-test-'));
    storage = new NodeStorage(tmpDir);
  });

  it('should save and load a workspace', async () => {
    const workspace = {
      id: 'ws-1',
      title: 'Test',
      branches: {},
      checkpoints: {},
      activeBranchId: 'b1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await storage.save('ws-1', workspace as any);
    const loaded = await storage.load('ws-1');
    expect(loaded).toBeTruthy();
    expect(loaded!.title).toBe('Test');
  });

  it('should return null for missing workspace', async () => {
    const result = await storage.load('nonexistent');
    expect(result).toBeNull();
  });

  it('should list workspace IDs', async () => {
    await storage.save('a', { id: 'a' } as any);
    await storage.save('b', { id: 'b' } as any);
    const ids = await storage.list();
    expect(ids).toContain('a');
    expect(ids).toContain('b');
  });

  it('should delete a workspace', async () => {
    await storage.save('x', { id: 'x' } as any);
    await storage.delete('x');
    const result = await storage.load('x');
    expect(result).toBeNull();
  });

  it('should persist to .variantree/workspace.json', async () => {
    await storage.save('ws', { id: 'ws' } as any);
    const filePath = path.join(tmpDir, '.variantree', 'workspace.json');
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    expect(data.ws).toBeTruthy();
  });
});
