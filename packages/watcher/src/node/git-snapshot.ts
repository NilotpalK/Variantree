/**
 * @variantree/watcher — Git-backed Snapshot Provider
 *
 * Uses git as a hidden storage engine for workspace snapshots.
 * Zero pollution of the user's git history:
 *
 *   - For git repos: stores snapshots as orphan commits under refs/variantree/,
 *     invisible to git log, git branch, git push, and git stash list.
 *   - For non-git repos: initializes a private repo inside .variantree/git/,
 *     completely transparent to the user.
 *
 * Key trick: GIT_INDEX_FILE env var creates a temporary staging area so we
 * never touch the user's actual index (staged changes are preserved).
 */

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { SnapshotProvider, RestoreSummary, SnapshotDiff } from '@variantree/core';

const execAsync = promisify(execFile);

/** Fallback excludes used only when a non-git project has no .gitignore. */
const FALLBACK_EXCLUDES = [
  'node_modules',
  'dist',
  '.venv',
  'venv',
  '.DS_Store',
  '.idea',
  '.vscode',
  '__pycache__',
].join('\n') + '\n';

/** Always excluded from snapshots regardless of .gitignore. */
const MANDATORY_EXCLUDES = '.variantree\n.git\n';

/**
 * Build the content for the internal repo's info/exclude file.
 * If the workspace has a .gitignore, its patterns are used directly.
 * Otherwise, fall back to a sensible default list.
 */
async function buildExcludeContent(workspacePath: string): Promise<string> {
  try {
    const gitignore = await fs.readFile(
      path.join(workspacePath, '.gitignore'),
      'utf8',
    );
    return MANDATORY_EXCLUDES + '# from project .gitignore\n' + gitignore;
  } catch {
    return MANDATORY_EXCLUDES + FALLBACK_EXCLUDES;
  }
}

export class GitSnapshotProvider implements SnapshotProvider {
  private gitDir: string | null = null;
  private useInternalRepo = false;
  private initPromise: Promise<void> | null = null;
  private cachedWorkspacePath: string | null = null;

  constructor(workspacePath?: string) {
    if (workspacePath) {
      this.cachedWorkspacePath = workspacePath;
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  async capture(workspacePath: string, label: string): Promise<string> {
    await this.ensureInit(workspacePath);

    const tmpIndex = path.join(this.gitDir!, 'variantree-tmp-index');
    const indexEnv = { GIT_INDEX_FILE: tmpIndex };

    try {
      await this.git(workspacePath, ['add', '-A'], indexEnv);

      const tree = (await this.git(workspacePath, ['write-tree'], indexEnv)).trim();

      const commit = (await this.git(workspacePath, [
        'commit-tree', tree, '-m', `variantree: ${label}`,
      ])).trim();

      await this.git(workspacePath, [
        'update-ref', `refs/variantree/${commit}`, commit,
      ]);

      return commit;
    } finally {
      try { await fs.unlink(tmpIndex); } catch {}
    }
  }

  async restore(workspacePath: string, ref: string): Promise<RestoreSummary> {
    await this.ensureInit(workspacePath);

    const currentRef = await this.capture(workspacePath, '__restore_tmp__');
    const summary: RestoreSummary = { written: [], deleted: [], skipped: [] };

    try {
      const changes = await this.diffTreeParsed(workspacePath, currentRef, ref);

      for (const { status, filePath } of changes) {
        const fullPath = path.join(workspacePath, filePath);

        if (status === 'A' || status === 'M') {
          const content = await this.gitBinary(workspacePath, ['show', `${ref}:${filePath}`]);
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, content);
          summary.written.push(filePath);
        } else if (status === 'D') {
          try { await fs.unlink(fullPath); } catch {}
          summary.deleted.push(filePath);
        }
      }

      const snapshotFiles = await this.listTreeFiles(workspacePath, ref);
      const changedSet = new Set([...summary.written, ...summary.deleted]);
      summary.skipped = snapshotFiles.filter(f => !changedSet.has(f));
    } finally {
      await this.drop(currentRef);
    }

    return summary;
  }

  async diff(workspacePath: string, ref: string): Promise<SnapshotDiff> {
    await this.ensureInit(workspacePath);

    const currentRef = await this.capture(workspacePath, '__diff_tmp__');

    try {
      return await this.diffRefs(ref, currentRef);
    } finally {
      await this.drop(currentRef);
    }
  }

  async diffRefs(refA: string, refB: string): Promise<SnapshotDiff> {
    const cwd = this.requireWorkspacePath();
    await this.ensureInit(cwd);

    const result: SnapshotDiff = { added: [], modified: [], deleted: [], unchanged: [] };

    const changes = await this.diffTreeParsed(cwd, refA, refB);

    for (const { status, filePath } of changes) {
      if (status === 'A') result.added.push(filePath);
      else if (status === 'M') result.modified.push(filePath);
      else if (status === 'D') result.deleted.push(filePath);
    }

    const filesB = await this.listTreeFiles(cwd, refB);
    const changedSet = new Set([...result.added, ...result.modified, ...result.deleted]);
    result.unchanged = filesB.filter(f => !changedSet.has(f));

    return result;
  }

  async drop(ref: string): Promise<void> {
    const cwd = this.requireWorkspacePath();

    try {
      await this.git(cwd, ['update-ref', '-d', `refs/variantree/${ref}`]);
    } catch {
      // Ref may not exist — safe to ignore
    }
  }

  /**
   * Get the number of files in a snapshot. Not part of the SnapshotProvider
   * interface — convenience method for status display.
   */
  async getSnapshotFileCount(ref: string): Promise<number> {
    const cwd = this.requireWorkspacePath();
    await this.ensureInit(cwd);

    const files = await this.listTreeFiles(cwd, ref);
    return files.length;
  }

  // ─── Initialization ─────────────────────────────────────────────────────

  private async ensureInit(workspacePath: string): Promise<void> {
    if (this.gitDir !== null) return;
    if (this.initPromise) return this.initPromise;

    this.cachedWorkspacePath = workspacePath;
    this.initPromise = this._init(workspacePath);
    return this.initPromise;
  }

  private async _init(workspacePath: string): Promise<void> {
    try {
      const { stdout } = await execAsync('git', ['rev-parse', '--git-dir'], {
        cwd: workspacePath,
      });
      this.gitDir = path.resolve(workspacePath, stdout.trim());
      this.useInternalRepo = false;

      // Ensure .variantree is excluded even if user hasn't added it to .gitignore
      await this.ensureExclude(this.gitDir, '.variantree');
    } catch {
      // Not inside a git repo — create a private one
      const repoDir = path.join(workspacePath, '.variantree', 'git');
      const dotGitDir = path.join(repoDir, '.git');

      let needsInit = true;
      try {
        await fs.access(path.join(dotGitDir, 'HEAD'));
        needsInit = false;
      } catch {}

      if (needsInit) {
        await fs.mkdir(repoDir, { recursive: true });
        await execAsync('git', ['init', repoDir]);

        const excludeDir = path.join(dotGitDir, 'info');
        await fs.mkdir(excludeDir, { recursive: true });
        await fs.writeFile(
          path.join(excludeDir, 'exclude'),
          await buildExcludeContent(workspacePath),
        );
      }

      this.gitDir = dotGitDir;
      this.useInternalRepo = true;
    }
  }

  /** Add a pattern to .git/info/exclude if not already present. */
  private async ensureExclude(gitDir: string, pattern: string): Promise<void> {
    const excludePath = path.join(gitDir, 'info', 'exclude');
    try {
      const content = await fs.readFile(excludePath, 'utf8');
      if (content.includes(pattern)) return;
      await fs.appendFile(excludePath, `\n${pattern}\n`);
    } catch {
      await fs.mkdir(path.join(gitDir, 'info'), { recursive: true });
      await fs.writeFile(excludePath, `${pattern}\n`);
    }
  }

  // ─── Git Helpers ────────────────────────────────────────────────────────

  private buildEnv(workspacePath: string, extraEnv?: Record<string, string>): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };

    if (this.useInternalRepo) {
      env.GIT_DIR = this.gitDir!;
      env.GIT_WORK_TREE = workspacePath;
    }

    if (extraEnv) Object.assign(env, extraEnv);
    return env;
  }

  private async git(
    workspacePath: string,
    args: string[],
    extraEnv?: Record<string, string>,
  ): Promise<string> {
    const { stdout } = await execAsync('git', args, {
      cwd: workspacePath,
      env: this.buildEnv(workspacePath, extraEnv),
      maxBuffer: 100 * 1024 * 1024,
    });
    return stdout;
  }

  /** Read binary content from git (e.g., file blobs via `git show`). */
  private gitBinary(
    workspacePath: string,
    args: string[],
    extraEnv?: Record<string, string>,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const proc = spawn('git', args, {
        cwd: workspacePath,
        env: this.buildEnv(workspacePath, extraEnv),
      });
      proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
      proc.stderr.on('data', () => {});
      proc.on('close', (code) => {
        if (code === 0) resolve(Buffer.concat(chunks));
        else reject(new Error(`git ${args[0]} exited with code ${code}`));
      });
      proc.on('error', reject);
    });
  }

  /** Parse the output of `git diff-tree -r --name-status`. */
  private async diffTreeParsed(
    workspacePath: string,
    refA: string,
    refB: string,
  ): Promise<Array<{ status: string; filePath: string }>> {
    const output = await this.git(workspacePath, [
      'diff-tree', '-r', '--name-status', refA, refB,
    ]);

    return output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const tab = line.indexOf('\t');
        return {
          status: line.charAt(0),
          filePath: line.slice(tab + 1),
        };
      });
  }

  /** List all file paths in a snapshot tree. */
  private async listTreeFiles(workspacePath: string, ref: string): Promise<string[]> {
    const output = (await this.git(workspacePath, [
      'ls-tree', '-r', '--name-only', ref,
    ])).trim();
    return output ? output.split('\n') : [];
  }

  private requireWorkspacePath(): string {
    if (!this.cachedWorkspacePath) {
      throw new Error('GitSnapshotProvider: no workspace path configured. Call capture() first or pass workspacePath to the constructor.');
    }
    return this.cachedWorkspacePath;
  }
}
