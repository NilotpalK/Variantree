# Variantree

**AI-native version control — checkpoints, branches, and conversation context, all managed by your AI.**

Variantree gives AI coding assistants (OpenCode, Claude Code, etc.) the ability to snapshot your code, branch into parallel explorations, and restore prior states — while keeping the full conversation context intact across every switch. It works via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io), so your AI uses it automatically without you having to manage it manually.

---

## How it works

Traditional version control is built for humans running commands. Variantree is built for AI:

- The AI **checkpoints** after completing a task — saving both the code and the conversation
- The AI **branches** when you want to try a different approach — without losing where you were
- The AI **restores** or **switches** when you want to go back — and gets the full prior conversation context automatically
- You just talk. The AI handles the rest.

---

## Installation

```bash
npm install -g @variantree/watcher
```

That's it. The installer automatically registers the Variantree MCP server in your OpenCode global config. Open any project in OpenCode and start chatting — Variantree activates on the first tool call.

> **Requirements:** Node.js 18+, [OpenCode](https://opencode.ai)

---

## Example session

```
You:  Build a todo app with add, remove, and list functions

AI:   [writes index.ts]
      Created index.ts with add(), remove(), list() functions.

You:  Save a checkpoint

AI:   ✓ Checkpoint "todo-basic" created.
        Messages synced: 4 new  (4 total in context)
        Snapshot: 1 file

You:  Branch off and rewrite it using a class, call it class-based

AI:   ✓ Branch "class-based" created from "todo-basic" and switched to it.
        Restored: 1 file written.
      [rewrites index.ts as a TodoApp class]

You:  Switch back to main

AI:   ✓ Switched to branch "main".
        Restored to checkpoint "todo-basic": 1 file written.
        [original function-based code is back]

You:  Show me the tree

AI:   main (4 msgs)
        └── todo-basic 📸
              └── class-based (2 msgs) ●
                    └── class-v1 📸
```

---

## What the AI can do

| Tool | What it does |
|---|---|
| `checkpoint` | Saves the current conversation + a full code snapshot |
| `branch` | Creates a new branch from a checkpoint, restores that code state |
| `switch` | Switches to an existing branch and restores its latest code state |
| `restore` | Rewinds code files to a specific checkpoint (stays on current branch) |
| `status` | Shows active branch, message count, and all checkpoints |
| `tree` | ASCII diagram of all branches and checkpoints |
| `log` | Full conversation history for a branch |

The AI is instructed to use these proactively — after completing tasks, before risky changes, and whenever you ask to explore alternatives.

---

## How context works

When you branch or switch, Variantree doesn't just restore files — it reconstructs the full conversation ancestry for that branch and writes it to `.variantree/branch-context.md`. The AI reads this at the start of each session, so it always knows the history of the branch it's on, even after a restart.

Branches are linked: if `class-based` was created from `todo-basic` on `main`, the AI on `class-based` has access to all of `main`'s conversation up to `todo-basic`, plus everything that happened on `class-based` after.

---

## Packages

This is a monorepo with three packages:

| Package | Description |
|---|---|
| [`@variantree/core`](packages/core) | Core engine — workspace, branch, checkpoint, and context logic |
| [`@variantree/watcher`](packages/watcher) | OpenCode adapter, CLI (`variantree`), file watcher, Git snapshot provider |
| [`@variantree/mcp`](packages/mcp) | MCP server that exposes Variantree tools to AI assistants |

### CLI

Installing `@variantree/watcher` globally also gives you the `variantree` CLI:

```bash
variantree status          # show current branch and checkpoints
variantree checkpoint      # save a checkpoint interactively
variantree branch <name>   # create a new branch
variantree switch <name>   # switch to an existing branch
variantree restore <label> # restore code to a checkpoint
variantree tree            # show the branch/checkpoint tree
variantree log             # show conversation history
variantree init            # manually set up a project (usually not needed)
```

---

## Under the hood

- **Checkpoints** are stored as Git commits in a hidden ref namespace (`refs/variantree/`), leaving your own Git history completely untouched.
- **Conversation messages** are read from OpenCode's SQLite database and synced into Variantree's workspace on every tool call.
- **Session tracking** pins each Variantree workspace to a specific OpenCode session ID, so messages from old sessions at the same path are never re-imported.
- **Branches** store only their delta messages; the full context is reconstructed by walking the parent checkpoint chain.

---

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free for personal and open-source use.
