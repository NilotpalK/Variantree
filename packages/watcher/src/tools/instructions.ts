/**
 * Canonical standing-instructions text for Variantree.
 *
 * This is the single source of truth. Each tool module uses the marker +
 * body to write into its own file format (AGENTS.md, CLAUDE.md, etc.).
 */

export const VARIANTREE_MARKER = '<!-- variantree:instructions -->';

export const VARIANTREE_INSTRUCTIONS_BODY = `\
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
| tree_web    | Open interactive visual tree in the browser   |
| log         | Show conversation history for a branch        |

When the user asks to "show the tree visually", "open the web UI", or
"visualize the tree", use \`tree_web\` (not \`tree\`).`;

/** The full fenced section, ready to embed in any markdown file. */
export const VARIANTREE_INSTRUCTIONS_SECTION =
  `${VARIANTREE_MARKER}\n${VARIANTREE_INSTRUCTIONS_BODY}\n${VARIANTREE_MARKER}`;

/**
 * Merge the Variantree instructions section into an existing file's content.
 *
 * - No existing content → wraps in a minimal markdown document.
 * - Content without the marker → appends the section.
 * - Content with the marker → replaces the section in-place.
 */
export function mergeInstructions(existingContent: string | null, heading: string): string {
  const section = VARIANTREE_INSTRUCTIONS_SECTION;

  if (!existingContent) {
    return `# ${heading}\n\n${section}\n`;
  }

  const start = existingContent.indexOf(VARIANTREE_MARKER);
  if (start === -1) {
    return existingContent.trimEnd() + '\n\n' + section + '\n';
  }

  const end = existingContent.indexOf(VARIANTREE_MARKER, start + VARIANTREE_MARKER.length);
  if (end === -1) {
    return existingContent.trimEnd() + '\n\n' + section + '\n';
  }

  const before = existingContent.slice(0, start);
  const after = existingContent.slice(end + VARIANTREE_MARKER.length);
  return before + section + after;
}
