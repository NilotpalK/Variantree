import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MessageDiffer } from '../differ.js';
import { OpenCodeAdapter } from '../tools/opencode/adapter.js';
import { ClaudeCodeAdapter } from '../tools/claudecode/adapter.js';
import { ensureProjectInstructions } from '../tools/index.js';
import { VARIANTREE_MARKER } from '../tools/instructions.js';
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
    differ.diff(msgs1);

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
    differ.diff([]);
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
    expect(result).toHaveLength(1);
  });
});

// ─── OpenCodeAdapter ─────────────────────────────────────────────────────

describe('OpenCodeAdapter', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vt-opencode-'));
    dbPath = path.join(tmpDir, 'opencode.db');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

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

    const insertMsg = db.prepare(`INSERT INTO message VALUES (?, 'ses_test1', ?, ?, ?)`);
    const insertPart = db.prepare(`INSERT INTO part VALUES (?, ?, 'ses_test1', ?, ?, ?)`);

    messages.forEach((msg, i) => {
      const msgId = `msg_${i}`;
      insertMsg.run(msgId, msg.time, msg.time, JSON.stringify({ role: msg.role }));
      insertPart.run(`prt_${i}`, msgId, msg.time, msg.time, JSON.stringify({ type: 'text', text: msg.content }));
    });

    db.close();
  }

  function makeAdapter() {
    const adapter = new OpenCodeAdapter();
    (adapter as any).getDbPath = () => dbPath;
    return adapter;
  }

  it('has correct adapter name', () => {
    expect(new OpenCodeAdapter().name).toBe('opencode');
  });

  it('reads messages from SQLite', async () => {
    createTestDb('/test/ws', [
      { role: 'user', content: 'Add JWT auth', time: 1000 },
      { role: 'assistant', content: 'Here is the middleware...', time: 2000 },
    ]);
    const result = await makeAdapter().readMessagesAsync('/test/ws');
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('user');
    expect(result[0].content).toBe('Add JWT auth');
    expect(result[1].role).toBe('assistant');
  });

  it('preserves message order by time_created', async () => {
    createTestDb('/test/ws', [
      { role: 'user', content: 'first', time: 100 },
      { role: 'assistant', content: 'second', time: 200 },
      { role: 'user', content: 'third', time: 300 },
    ]);
    const result = await makeAdapter().readMessagesAsync('/test/ws');
    expect(result.map(m => m.content)).toEqual(['first', 'second', 'third']);
  });

  it('returns empty for wrong workspace directory', async () => {
    createTestDb('/some/other/path', [{ role: 'user', content: 'hello', time: 100 }]);
    const result = await makeAdapter().readMessagesAsync('/non/existent/path');
    expect(result).toHaveLength(0);
  });

  it('returns empty when DB does not exist', async () => {
    const adapter = new OpenCodeAdapter();
    (adapter as any).getDbPath = () => '/tmp/nonexistent-vt.db';
    const result = await adapter.readMessagesAsync('/any/path');
    expect(result).toHaveLength(0);
  });

  it('returns empty for session with no messages', async () => {
    createTestDb('/test/ws', []);
    const result = await makeAdapter().readMessagesAsync('/test/ws');
    expect(result).toHaveLength(0);
  });

  it('uses message IDs from the database', async () => {
    createTestDb('/test/ws', [{ role: 'user', content: 'hello', time: 100 }]);
    const result = await makeAdapter().readMessagesAsync('/test/ws');
    expect(result[0].id).toBe('msg_0');
  });

  it('getCurrentSessionId returns session ID for known directory', async () => {
    createTestDb('/test/ws', [{ role: 'user', content: 'hi', time: 100 }]);
    const id = await makeAdapter().getCurrentSessionId('/test/ws');
    expect(id).toBe('ses_test1');
  });

  it('getCurrentSessionId returns null for unknown directory', async () => {
    createTestDb('/test/ws', []);
    const id = await makeAdapter().getCurrentSessionId('/some/other/dir');
    expect(id).toBeNull();
  });

  it('reads messages by specific sessionId', async () => {
    createTestDb('/test/ws', [
      { role: 'user', content: 'pinned session msg', time: 1000 },
    ]);
    const result = await makeAdapter().readMessagesAsync('/test/ws', 'ses_test1');
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('pinned session msg');
  });

  it('returns empty when given a non-existent sessionId', async () => {
    createTestDb('/test/ws', [{ role: 'user', content: 'hi', time: 100 }]);
    const result = await makeAdapter().readMessagesAsync('/test/ws', 'ses_nonexistent');
    expect(result).toHaveLength(0);
  });
});

// ─── ClaudeCodeAdapter ────────────────────────────────────────────────────

describe('ClaudeCodeAdapter', () => {
  let tmpDir: string;
  let sessionFile: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vt-claude-'));
    sessionFile = path.join(tmpDir, 'session.jsonl');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function makeAdapter(sessionDir: string) {
    const adapter = new ClaudeCodeAdapter();
    // Point the adapter at our temp directory
    (adapter as any).getSessionDir = () => sessionDir;
    return adapter;
  }

  function writeJsonl(lines: object[]) {
    fsSync.writeFileSync(sessionFile, lines.map(l => JSON.stringify(l)).join('\n') + '\n', 'utf8');
  }

  it('has correct adapter name', () => {
    expect(new ClaudeCodeAdapter().name).toBe('claudecode');
  });

  it('reads user and assistant messages from JSONL', async () => {
    writeJsonl([
      { message: { role: 'user', content: [{ type: 'text', text: 'Write tests' }] }, timestamp: '2024-01-01T00:00:00Z' },
      { message: { role: 'assistant', content: [{ type: 'text', text: 'Here are tests' }] }, timestamp: '2024-01-01T00:00:01Z' },
    ]);

    const adapter = makeAdapter(tmpDir);
    const result = await adapter.readMessagesAsync('/any/path', sessionFile);
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('user');
    expect(result[0].content).toBe('Write tests');
    expect(result[1].role).toBe('assistant');
    expect(result[1].content).toBe('Here are tests');
  });

  it('handles string content (not array)', async () => {
    writeJsonl([
      { message: { role: 'user', content: 'plain string message' }, timestamp: '2024-01-01T00:00:00Z' },
    ]);
    const adapter = makeAdapter(tmpDir);
    const result = await adapter.readMessagesAsync('/any/path', sessionFile);
    expect(result[0].content).toBe('plain string message');
  });

  it('maps "human" role to "user"', async () => {
    writeJsonl([
      { message: { role: 'human', content: [{ type: 'text', text: 'hello' }] }, timestamp: '2024-01-01T00:00:00Z' },
    ]);
    const adapter = makeAdapter(tmpDir);
    const result = await adapter.readMessagesAsync('/any/path', sessionFile);
    expect(result[0].role).toBe('user');
  });

  it('skips lines without text content', async () => {
    writeJsonl([
      { message: { role: 'assistant', content: [{ type: 'tool_use', id: 'x' }] }, timestamp: '2024-01-01T00:00:00Z' },
      { message: { role: 'user', content: [{ type: 'text', text: 'real message' }] }, timestamp: '2024-01-01T00:00:01Z' },
    ]);
    const adapter = makeAdapter(tmpDir);
    const result = await adapter.readMessagesAsync('/any/path', sessionFile);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('real message');
  });

  it('skips malformed JSON lines gracefully', async () => {
    fsSync.writeFileSync(sessionFile,
      '{"message":{"role":"user","content":[{"type":"text","text":"ok"}]},"timestamp":"2024-01-01T00:00:00Z"}\n' +
      'NOT VALID JSON\n' +
      '{"message":{"role":"assistant","content":[{"type":"text","text":"also ok"}]},"timestamp":"2024-01-01T00:00:01Z"}\n',
      'utf8'
    );
    const adapter = makeAdapter(tmpDir);
    const result = await adapter.readMessagesAsync('/any/path', sessionFile);
    expect(result).toHaveLength(2);
  });

  it('returns empty for non-existent file', async () => {
    const adapter = makeAdapter(tmpDir);
    const result = await adapter.readMessagesAsync('/any/path', '/tmp/no-such-file.jsonl');
    expect(result).toHaveLength(0);
  });
});

// ─── ensureProjectInstructions ────────────────────────────────────────────

describe('ensureProjectInstructions', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vt-instr-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes AGENTS.md for OpenCode', async () => {
    ensureProjectInstructions(tmpDir);
    const content = await fs.readFile(path.join(tmpDir, 'AGENTS.md'), 'utf8');
    expect(content).toContain(VARIANTREE_MARKER);
    expect(content).toContain('When to checkpoint');
  });

  it('writes CLAUDE.md for Claude Code', async () => {
    ensureProjectInstructions(tmpDir);
    const content = await fs.readFile(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
    expect(content).toContain(VARIANTREE_MARKER);
    expect(content).toContain('When to checkpoint');
  });

  it('both files contain the same instruction body', async () => {
    ensureProjectInstructions(tmpDir);
    const agents = await fs.readFile(path.join(tmpDir, 'AGENTS.md'), 'utf8');
    const claude = await fs.readFile(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
    // Strip the heading line (# AGENTS vs # CLAUDE) — the rest should match
    const stripHeading = (s: string) => s.replace(/^# \w+\n\n/, '');
    expect(stripHeading(agents)).toBe(stripHeading(claude));
  });

  it('is idempotent — does not duplicate instructions on repeated calls', async () => {
    ensureProjectInstructions(tmpDir);
    ensureProjectInstructions(tmpDir);
    const agents = await fs.readFile(path.join(tmpDir, 'AGENTS.md'), 'utf8');
    const markerCount = (agents.match(new RegExp(VARIANTREE_MARKER, 'g')) ?? []).length;
    expect(markerCount).toBe(2); // one opening, one closing
  });

  it('appends to existing files that have no Variantree section', async () => {
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), '# My Project\n\nCustom rules here.\n', 'utf8');
    ensureProjectInstructions(tmpDir);
    const content = await fs.readFile(path.join(tmpDir, 'AGENTS.md'), 'utf8');
    expect(content).toContain('Custom rules here.');
    expect(content).toContain(VARIANTREE_MARKER);
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

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should save and load a workspace', async () => {
    const workspace = {
      id: 'ws-1', title: 'Test', branches: {}, checkpoints: {},
      activeBranchId: 'b1', createdAt: Date.now(), updatedAt: Date.now(),
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
