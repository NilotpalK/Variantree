import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitSnapshotProvider } from '../node/git-snapshot.js';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

// ─── Helpers ─────────────────────────────────────────────────────────────────

let tmpDir: string;

async function createTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'vt-git-snap-'));
}

async function writeFile(relativePath: string, content: string) {
  const fullPath = path.join(tmpDir, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf8');
}

async function readFile(relativePath: string): Promise<string> {
  return fs.readFile(path.join(tmpDir, relativePath), 'utf8');
}

async function fileExists(relativePath: string): Promise<boolean> {
  try {
    await fs.access(path.join(tmpDir, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function deleteFile(relativePath: string) {
  try {
    await fs.unlink(path.join(tmpDir, relativePath));
  } catch {}
}

async function listUserFiles(): Promise<string[]> {
  const results: string[] = [];
  const walk = async (dir: string) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === '.variantree' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else results.push(path.relative(tmpDir, full));
    }
  };
  await walk(tmpDir);
  return results.sort();
}

// ─── Tests: Existing Git Repo ────────────────────────────────────────────────

describe('GitSnapshotProvider (existing git repo)', () => {
  let provider: GitSnapshotProvider;

  beforeEach(async () => {
    tmpDir = await createTmpDir();
    await exec('git', ['init', tmpDir]);
    await exec('git', ['-C', tmpDir, 'config', 'user.email', 'test@test.com']);
    await exec('git', ['-C', tmpDir, 'config', 'user.name', 'Test']);
    // Need at least one commit for some git operations
    await writeFile('.gitignore', '.variantree\nnode_modules\n');
    await exec('git', ['-C', tmpDir, 'add', '-A']);
    await exec('git', ['-C', tmpDir, 'commit', '-m', 'init', '--allow-empty']);
    provider = new GitSnapshotProvider(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── capture ──────────────────────────────────────────────────

  describe('capture', () => {
    it('should return a valid git commit SHA', async () => {
      await writeFile('auth.ts', 'export function auth() {}');
      const ref = await provider.capture(tmpDir, 'test-checkpoint');

      expect(ref).toMatch(/^[0-9a-f]{40}$/);
    });

    it('should capture all workspace files', async () => {
      await writeFile('auth.ts', 'export function auth() {}');
      await writeFile('server.ts', 'const app = express()');
      await writeFile('src/config.ts', 'export default {}');

      const ref = await provider.capture(tmpDir, 'three-files');
      const count = await provider.getSnapshotFileCount(ref);

      // .gitignore + 3 source files
      expect(count).toBe(4);
    });

    it('should handle empty workspace (only .gitignore)', async () => {
      const ref = await provider.capture(tmpDir, 'empty');
      const count = await provider.getSnapshotFileCount(ref);
      expect(count).toBe(1); // just .gitignore
    });

    it('should exclude .variantree directory', async () => {
      await writeFile('app.ts', 'console.log("hi")');
      await writeFile('.variantree/workspace.json', '{}');

      const ref = await provider.capture(tmpDir, 'exclude-test');
      const { stdout } = await exec('git', ['-C', tmpDir, 'ls-tree', '-r', '--name-only', ref]);

      expect(stdout).toContain('app.ts');
      expect(stdout).not.toContain('.variantree');
    });

    it('should not pollute git log', async () => {
      await writeFile('app.ts', 'hello');
      await provider.capture(tmpDir, 'hidden-checkpoint');

      const { stdout } = await exec('git', ['-C', tmpDir, 'log', '--oneline']);
      expect(stdout).not.toContain('variantree');
    });

    it('should not pollute git branch list', async () => {
      await writeFile('app.ts', 'hello');
      await provider.capture(tmpDir, 'hidden-checkpoint');

      const { stdout } = await exec('git', ['-C', tmpDir, 'branch', '-a']);
      expect(stdout).not.toContain('variantree');
    });

    it('should not modify the user staging area (index)', async () => {
      await writeFile('staged.ts', 'staged content');
      await exec('git', ['-C', tmpDir, 'add', 'staged.ts']);

      // Unstaged file exists too
      await writeFile('unstaged.ts', 'not staged');

      // Capture should not change what's staged
      await provider.capture(tmpDir, 'index-safe');

      const { stdout } = await exec('git', ['-C', tmpDir, 'diff', '--cached', '--name-only']);
      expect(stdout.trim()).toBe('staged.ts');
    });

    it('should create distinct refs for different snapshots', async () => {
      await writeFile('file.ts', 'v1');
      const ref1 = await provider.capture(tmpDir, 'first');

      await writeFile('file.ts', 'v2');
      const ref2 = await provider.capture(tmpDir, 'second');

      expect(ref1).not.toBe(ref2);
    });

    it('should store snapshot under refs/variantree/', async () => {
      await writeFile('app.ts', 'hello');
      const ref = await provider.capture(tmpDir, 'ref-test');

      const { stdout } = await exec('git', ['-C', tmpDir, 'show-ref']);
      expect(stdout).toContain(`refs/variantree/${ref}`);
    });
  });

  // ── restore ──────────────────────────────────────────────────

  describe('restore', () => {
    it('should restore workspace to snapshot state', async () => {
      await writeFile('auth.ts', 'v1');
      await writeFile('server.ts', 'original');
      const ref = await provider.capture(tmpDir, 'before-change');

      // Modify workspace
      await writeFile('auth.ts', 'v2-changed');
      await writeFile('newfile.ts', 'should be deleted');

      const summary = await provider.restore(tmpDir, ref);

      expect(await readFile('auth.ts')).toBe('v1');
      expect(await readFile('server.ts')).toBe('original');
      expect(await fileExists('newfile.ts')).toBe(false);

      expect(summary.written).toContain('auth.ts');
      expect(summary.deleted).toContain('newfile.ts');
      expect(summary.skipped).toContain('server.ts');
    });

    it('should restore deleted files', async () => {
      await writeFile('important.ts', 'do not lose me');
      const ref = await provider.capture(tmpDir, 'has-important');

      await deleteFile('important.ts');
      expect(await fileExists('important.ts')).toBe(false);

      await provider.restore(tmpDir, ref);

      expect(await fileExists('important.ts')).toBe(true);
      expect(await readFile('important.ts')).toBe('do not lose me');
    });

    it('should delete files that did not exist at checkpoint', async () => {
      await writeFile('original.ts', 'was here');
      const ref = await provider.capture(tmpDir, 'original-only');

      await writeFile('added-later.ts', 'new file');
      await writeFile('also-new.ts', 'another');

      const summary = await provider.restore(tmpDir, ref);

      expect(await fileExists('added-later.ts')).toBe(false);
      expect(await fileExists('also-new.ts')).toBe(false);
      expect(summary.deleted).toContain('added-later.ts');
      expect(summary.deleted).toContain('also-new.ts');
    });

    it('should skip unchanged files', async () => {
      await writeFile('stable.ts', 'never changes');
      await writeFile('changes.ts', 'v1');
      const ref = await provider.capture(tmpDir, 'mixed');

      await writeFile('changes.ts', 'v2');

      const summary = await provider.restore(tmpDir, ref);

      expect(summary.skipped).toContain('stable.ts');
      expect(summary.written).toContain('changes.ts');
      expect(await readFile('changes.ts')).toBe('v1');
    });

    it('should restore files in subdirectories', async () => {
      await writeFile('src/auth/login.ts', 'login code');
      await writeFile('src/auth/register.ts', 'register code');
      await writeFile('src/index.ts', 'entry point');
      const ref = await provider.capture(tmpDir, 'nested');

      await writeFile('src/auth/login.ts', 'MODIFIED');
      await deleteFile('src/auth/register.ts');

      await provider.restore(tmpDir, ref);

      expect(await readFile('src/auth/login.ts')).toBe('login code');
      expect(await readFile('src/auth/register.ts')).toBe('register code');
    });

    it('should handle restoring to same state (no-op)', async () => {
      await writeFile('app.ts', 'unchanged');
      const ref = await provider.capture(tmpDir, 'same');

      const summary = await provider.restore(tmpDir, ref);

      expect(summary.written).toHaveLength(0);
      expect(summary.deleted).toHaveLength(0);
      expect(summary.skipped.length).toBeGreaterThan(0);
    });
  });

  // ── diff ─────────────────────────────────────────────────────

  describe('diff', () => {
    it('should detect added, modified, deleted, and unchanged files', async () => {
      await writeFile('unchanged.ts', 'same');
      await writeFile('will-modify.ts', 'v1');
      await writeFile('will-delete.ts', 'going away');
      const ref = await provider.capture(tmpDir, 'base');

      await writeFile('will-modify.ts', 'v2');
      await deleteFile('will-delete.ts');
      await writeFile('brand-new.ts', 'just created');

      const diff = await provider.diff(tmpDir, ref);

      expect(diff.unchanged).toContain('unchanged.ts');
      expect(diff.modified).toContain('will-modify.ts');
      expect(diff.deleted).toContain('will-delete.ts');
      expect(diff.added).toContain('brand-new.ts');
    });

    it('should report all unchanged when nothing changed', async () => {
      await writeFile('a.ts', 'content-a');
      await writeFile('b.ts', 'content-b');
      const ref = await provider.capture(tmpDir, 'frozen');

      const diff = await provider.diff(tmpDir, ref);

      expect(diff.unchanged.length).toBeGreaterThanOrEqual(2);
      expect(diff.added).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
      expect(diff.deleted).toHaveLength(0);
    });
  });

  // ── diffRefs ─────────────────────────────────────────────────

  describe('diffRefs', () => {
    it('should diff two snapshots without touching disk', async () => {
      await writeFile('file.ts', 'version-1');
      const refA = await provider.capture(tmpDir, 'v1');

      await writeFile('file.ts', 'version-2');
      await writeFile('new.ts', 'added');
      const refB = await provider.capture(tmpDir, 'v2');

      const diff = await provider.diffRefs(refA, refB);

      expect(diff.modified).toContain('file.ts');
      expect(diff.added).toContain('new.ts');
    });

    it('should detect deletion between refs', async () => {
      await writeFile('doomed.ts', 'will be removed');
      await writeFile('keeper.ts', 'stays');
      const refA = await provider.capture(tmpDir, 'before-delete');

      await deleteFile('doomed.ts');
      const refB = await provider.capture(tmpDir, 'after-delete');

      const diff = await provider.diffRefs(refA, refB);

      expect(diff.deleted).toContain('doomed.ts');
      expect(diff.unchanged).toContain('keeper.ts');
    });

    it('should return empty diff for identical refs', async () => {
      await writeFile('app.ts', 'content');
      const ref = await provider.capture(tmpDir, 'same');

      const diff = await provider.diffRefs(ref, ref);

      expect(diff.added).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
      expect(diff.deleted).toHaveLength(0);
    });
  });

  // ── drop ─────────────────────────────────────────────────────

  describe('drop', () => {
    it('should remove the ref from git', async () => {
      await writeFile('app.ts', 'hello');
      const ref = await provider.capture(tmpDir, 'to-drop');

      const { stdout: before } = await exec('git', ['-C', tmpDir, 'show-ref']);
      expect(before).toContain(`refs/variantree/${ref}`);

      await provider.drop(ref);

      const { stdout: after } = await exec('git', ['-C', tmpDir, 'show-ref']);
      expect(after).not.toContain(`refs/variantree/${ref}`);
    });

    it('should not throw when dropping non-existent ref', async () => {
      await expect(provider.drop('0000000000000000000000000000000000000000')).resolves.not.toThrow();
    });
  });

  // ── getSnapshotFileCount ─────────────────────────────────────

  describe('getSnapshotFileCount', () => {
    it('should return correct file count', async () => {
      await writeFile('a.ts', 'a');
      await writeFile('b.ts', 'b');
      await writeFile('src/c.ts', 'c');
      const ref = await provider.capture(tmpDir, 'count');

      // .gitignore + 3 source files
      const count = await provider.getSnapshotFileCount(ref);
      expect(count).toBe(4);
    });
  });
});

// ─── Tests: No Git Repo (internal repo) ──────────────────────────────────────

describe('GitSnapshotProvider (no existing git repo — internal repo)', () => {
  let provider: GitSnapshotProvider;

  beforeEach(async () => {
    tmpDir = await createTmpDir();
    // NO git init — the provider should create its own repo
    provider = new GitSnapshotProvider(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should auto-initialize an internal git repo', async () => {
    await writeFile('app.ts', 'hello');
    await provider.capture(tmpDir, 'auto-init');

    const internalGit = path.join(tmpDir, '.variantree', 'git', '.git');
    expect(fsSync.existsSync(path.join(internalGit, 'HEAD'))).toBe(true);
  });

  it('should capture and restore without user having git', async () => {
    await writeFile('auth.ts', 'v1');
    await writeFile('server.ts', 'original');
    const ref = await provider.capture(tmpDir, 'no-git-test');

    await writeFile('auth.ts', 'v2');
    await writeFile('extra.ts', 'delete me');

    const summary = await provider.restore(tmpDir, ref);

    expect(await readFile('auth.ts')).toBe('v1');
    expect(await readFile('server.ts')).toBe('original');
    expect(await fileExists('extra.ts')).toBe(false);
    expect(summary.written).toContain('auth.ts');
    expect(summary.deleted).toContain('extra.ts');
  });

  it('should exclude .variantree from snapshots', async () => {
    await writeFile('app.ts', 'code');
    const ref = await provider.capture(tmpDir, 'exclude');

    const internalGitDir = path.join(tmpDir, '.variantree', 'git', '.git');
    const env = {
      ...process.env,
      GIT_DIR: internalGitDir,
      GIT_WORK_TREE: tmpDir,
    };
    const { stdout } = await exec('git', ['ls-tree', '-r', '--name-only', ref], { env });

    expect(stdout).toContain('app.ts');
    expect(stdout).not.toContain('.variantree');
  });

  it('should not create a .git in the workspace root', async () => {
    await writeFile('app.ts', 'hello');
    await provider.capture(tmpDir, 'no-root-git');

    expect(fsSync.existsSync(path.join(tmpDir, '.git'))).toBe(false);
  });

  it('should diff between snapshots', async () => {
    await writeFile('file.ts', 'v1');
    const refA = await provider.capture(tmpDir, 'v1');

    await writeFile('file.ts', 'v2');
    await writeFile('new.ts', 'added');
    const refB = await provider.capture(tmpDir, 'v2');

    const diff = await provider.diffRefs(refA, refB);

    expect(diff.modified).toContain('file.ts');
    expect(diff.added).toContain('new.ts');
  });

  it('should reuse existing internal repo on subsequent instantiations', async () => {
    await writeFile('app.ts', 'v1');
    const ref1 = await provider.capture(tmpDir, 'first');

    // Create a new provider instance pointing to the same dir
    const provider2 = new GitSnapshotProvider(tmpDir);
    await writeFile('app.ts', 'v2');
    const ref2 = await provider2.capture(tmpDir, 'second');

    expect(ref1).not.toBe(ref2);

    // Restore using the new provider should work with old ref
    await provider2.restore(tmpDir, ref1);
    expect(await readFile('app.ts')).toBe('v1');
  });
});

// ─── Tests: Integration with VariantTree engine ──────────────────────────────

describe('GitSnapshotProvider + VariantTree engine', () => {
  let provider: GitSnapshotProvider;

  beforeEach(async () => {
    tmpDir = await createTmpDir();
    await exec('git', ['init', tmpDir]);
    await exec('git', ['-C', tmpDir, 'config', 'user.email', 'test@test.com']);
    await exec('git', ['-C', tmpDir, 'config', 'user.name', 'Test']);
    await writeFile('.gitignore', '.variantree\n');
    await exec('git', ['-C', tmpDir, 'add', '-A']);
    await exec('git', ['-C', tmpDir, 'commit', '-m', 'init']);
    provider = new GitSnapshotProvider(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should work end-to-end: capture → modify → branch → restore', async () => {
    // Simulate: user builds auth, checkpoints, then branches to try a different approach

    // Step 1: Initial code
    await writeFile('src/auth.ts', 'export function auth() { return "jwt"; }');
    await writeFile('src/server.ts', 'import { auth } from "./auth";');
    const cpMain = await provider.capture(tmpDir, 'auth-working');

    // Step 2: User modifies to try OAuth instead
    await writeFile('src/auth.ts', 'export function auth() { return "oauth"; }');
    await writeFile('src/oauth-client.ts', 'export class OAuthClient {}');
    const cpOauth = await provider.capture(tmpDir, 'trying-oauth');

    // Step 3: OAuth didn't work, restore to JWT checkpoint
    const summary = await provider.restore(tmpDir, cpMain);

    expect(await readFile('src/auth.ts')).toBe('export function auth() { return "jwt"; }');
    expect(await readFile('src/server.ts')).toBe('import { auth } from "./auth";');
    expect(await fileExists('src/oauth-client.ts')).toBe(false);
    expect(summary.written).toContain('src/auth.ts');
    expect(summary.deleted).toContain('src/oauth-client.ts');

    // Step 4: Can still go back to OAuth if needed
    await provider.restore(tmpDir, cpOauth);
    expect(await readFile('src/auth.ts')).toBe('export function auth() { return "oauth"; }');
    expect(await fileExists('src/oauth-client.ts')).toBe(true);
  });

  it('should handle multiple branches with independent snapshots', async () => {
    // Main branch state
    await writeFile('src/app.ts', 'base code');
    const cpBase = await provider.capture(tmpDir, 'base');

    // Branch A: add feature A
    await writeFile('src/feature-a.ts', 'feature A code');
    await writeFile('src/app.ts', 'base code + feature A');
    const cpA = await provider.capture(tmpDir, 'feature-a');

    // Go back to base, start branch B
    await provider.restore(tmpDir, cpBase);
    await writeFile('src/feature-b.ts', 'feature B code');
    await writeFile('src/app.ts', 'base code + feature B');
    const cpB = await provider.capture(tmpDir, 'feature-b');

    // Verify branch B state
    expect(await readFile('src/app.ts')).toBe('base code + feature B');
    expect(await fileExists('src/feature-b.ts')).toBe(true);
    expect(await fileExists('src/feature-a.ts')).toBe(false);

    // Switch to branch A
    await provider.restore(tmpDir, cpA);
    expect(await readFile('src/app.ts')).toBe('base code + feature A');
    expect(await fileExists('src/feature-a.ts')).toBe(true);
    expect(await fileExists('src/feature-b.ts')).toBe(false);

    // Diff between branches
    const diff = await provider.diffRefs(cpA, cpB);
    expect(diff.modified).toContain('src/app.ts');
    expect(diff.added).toContain('src/feature-b.ts');
    expect(diff.deleted).toContain('src/feature-a.ts');
  });

  it('should handle binary-ish content (non-UTF8)', async () => {
    const binaryContent = Buffer.from([0x00, 0x01, 0xFF, 0xFE, 0x89, 0x50]);
    await fs.writeFile(path.join(tmpDir, 'binary.bin'), binaryContent);

    const ref = await provider.capture(tmpDir, 'with-binary');

    await fs.writeFile(path.join(tmpDir, 'binary.bin'), Buffer.from([0xAA]));

    await provider.restore(tmpDir, ref);

    const restored = await fs.readFile(path.join(tmpDir, 'binary.bin'));
    expect(Buffer.compare(restored, binaryContent)).toBe(0);
  });
});
