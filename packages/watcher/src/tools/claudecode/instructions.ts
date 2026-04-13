/**
 * Claude Code standing instructions — writes/merges into CLAUDE.md.
 *
 * Claude Code reads CLAUDE.md from the project root (and parent directories).
 */

import fs from 'node:fs';
import path from 'node:path';
import { mergeInstructions, VARIANTREE_MARKER } from '../instructions.js';

const FILENAME = 'CLAUDE.md';

export function writeProjectInstructions(projectDir: string): void {
  const filePath = path.join(projectDir, FILENAME);
  let existing: string | null = null;
  try { existing = fs.readFileSync(filePath, 'utf8'); } catch {}
  if (existing?.includes(VARIANTREE_MARKER)) return;
  fs.writeFileSync(filePath, mergeInstructions(existing, 'CLAUDE'), 'utf8');
}
