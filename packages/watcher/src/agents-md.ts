/**
 * @variantree/watcher — AGENTS.md content
 *
 * Standing instructions written to the project root so OpenCode (and
 * compatible tools) know when and how to use Variantree proactively.
 *
 * Shared between `variantree init` (CLI) and the MCP server bootstrap.
 */

const MARKER = '<!-- variantree:agents -->';

export const AGENTS_MD_SECTION = `${MARKER}
## Variantree — AI Version Control

You have access to Variantree MCP tools for managing conversation context and
code snapshots. Use them **proactively** — don't wait for the user to ask.

### On session start
- If \`.variantree/branch-context.md\` exists, read it immediately for context
  on prior work done on this branch.

### When to checkpoint
- After completing a distinct task or sub-task (e.g. "auth is working",
  "tests pass", "refactor done").
- When the user says "done", "looks good", "ship it", or "let's move on".
- Before any branch, switch, or restore — the tools will warn you if you
  forget, but it's better to checkpoint proactively.

### When to branch
- When the user wants to explore an alternative approach ("let's try X
  instead", "what if we used Y").
- When the user asks to experiment without losing current progress.

### When to switch / restore
- When the user wants to go back to a previous line of work or a known-good
  state ("go back to main", "restore the working version").

### Handling unsaved-message warnings
If a tool returns an unsaved-message warning (e.g. "4 messages will be lost"):
1. **STOP** — do NOT silently pass \`force: true\`.
2. Tell the user exactly how many messages will be lost.
3. Ask: *"Should I checkpoint first to save them, or discard them and
   proceed?"*
4. Only use \`force: true\` after the user explicitly says to discard /
   proceed without saving.

### Presenting results to the user
**IMPORTANT:** Always relay the COMPLETE tool output to the user. Do not
summarise or omit details. Specifically:

- **checkpoint:** Show messages synced count, snapshot diff (files added,
  modified, deleted), and total file count.
- **branch / switch / restore:** Show files written and deleted, then show
  the full conversation context summary that was returned.
- **status:** Show ALL fields: active branch, message count, every branch
  name, and every checkpoint label with snapshot indicator.
- **tree:** Show the FULL tree output exactly as returned — branches AND
  checkpoints. Do not collapse or summarise it.
- **log:** Show the full conversation history returned by the tool.

### Tool reference
| Tool        | Purpose                                      |
|-------------|----------------------------------------------|
| checkpoint  | Sync conversation + snapshot code             |
| branch      | Create a new branch from a checkpoint         |
| switch      | Switch to an existing branch                  |
| restore     | Restore code to a specific checkpoint         |
| status      | Show active branch, checkpoints               |
| tree        | ASCII tree of branches and checkpoints        |
| log         | Show conversation history for a branch        |
${MARKER}`;

/**
 * Write or merge the Variantree section into an AGENTS.md file.
 *
 * - If the file doesn't exist, creates it.
 * - If it exists but has no Variantree section, appends.
 * - If it already has the section, replaces it (safe update).
 */
export function mergeAgentsMd(existingContent: string | null): string {
  if (!existingContent) {
    return `# AGENTS\n\n${AGENTS_MD_SECTION}\n`;
  }

  const markerStart = existingContent.indexOf(MARKER);
  if (markerStart === -1) {
    return existingContent.trimEnd() + '\n\n' + AGENTS_MD_SECTION + '\n';
  }

  const markerEnd = existingContent.indexOf(MARKER, markerStart + MARKER.length);
  if (markerEnd === -1) {
    return existingContent.trimEnd() + '\n\n' + AGENTS_MD_SECTION + '\n';
  }

  const before = existingContent.slice(0, markerStart);
  const after = existingContent.slice(markerEnd + MARKER.length);
  return before + AGENTS_MD_SECTION + after;
}
