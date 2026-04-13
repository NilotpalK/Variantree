/**
 * OpenCode standing instructions — writes/merges into AGENTS.md.
 *
 * OpenCode reads AGENTS.md (and AGENTS, .agents.md variants) from the project
 * root. OpenAI Codex also follows the same convention.
 */

import fs from 'node:fs';
import path from 'node:path';
import { mergeInstructions, VARIANTREE_MARKER } from '../instructions.js';

const FILENAME = 'AGENTS.md';

export function writeProjectInstructions(projectDir: string): void {
  const filePath = path.join(projectDir, FILENAME);
  let existing: string | null = null;
  try { existing = fs.readFileSync(filePath, 'utf8'); } catch {}
  if (existing?.includes(VARIANTREE_MARKER)) return;
  fs.writeFileSync(filePath, mergeInstructions(existing, 'AGENTS'), 'utf8');
}

/** @deprecated Use writeProjectInstructions. Kept for backwards compatibility. */
export function mergeAgentsMd(existingContent: string | null): string {
  return mergeInstructions(existingContent, 'AGENTS');
}
