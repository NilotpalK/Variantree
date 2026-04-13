<p align="center">
  <img src="assets/logo.svg" width="80" alt="Variantree logo" />
</p>

<h1 align="center">Variantree</h1>

<p align="center">
  <strong>AI-native version control — checkpoints, branches, and conversation context, all managed by your AI.</strong>
</p>

<p align="center">
  <a href="#installation">Install</a> · <a href="#example-session">Demo</a> · <a href="#why-variantree">Why?</a> · <a href="#packages">Packages</a>
</p>

---

Variantree gives AI coding assistants (OpenCode, Claude Code, etc.) the ability to snapshot your code, branch into parallel explorations, and restore prior states — while keeping the full conversation context intact across every switch. It works via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io), so your AI uses it automatically without you having to manage it manually.

---

## Why Variantree

### Save tokens, not money

Every time you ask an AI to "go back" or "try the other approach," it has to re-read your entire codebase and re-establish context from scratch. That's thousands of wasted tokens per switch. Variantree stores the full conversation history per branch — when you switch, the AI picks up exactly where it left off with zero redundant context. Over a session with multiple explorations, this adds up to **significant token savings**.

### Automatic agent checkpointing

You don't have to remember to save. Variantree's standing instructions tell the AI to checkpoint after completing tasks, before risky changes, and before branching. The AI does it proactively — your code and conversation are always recoverable without you lifting a finger.

### Fearless exploration

Want to try a class-based rewrite? A different algorithm? A complete architectural pivot? Branch off, explore freely, and switch back in one sentence. Every branch preserves its own code state and conversation, so you never lose work and the AI never loses context.

### Full conversation continuity

Other tools restore files. Variantree restores *understanding*. When you switch branches, the AI gets the complete conversation ancestry for that branch — every decision, every rationale, every prior instruction. It doesn't just see the code; it knows *why* the code looks the way it does.

### Zero friction

Install once, and it works. No manual init, no config files to write, no commands to memorize. The MCP server registers itself globally, project instructions are written on the first tool call, and the AI handles checkpointing and branching through natural conversation.

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

That's it — one package for all supported tools. The installer automatically registers the Variantree MCP server in the global config for **both OpenCode and Claude Code**. Open any project and start chatting — Variantree activates on the first tool call.

| Tool | What gets configured |
|---|---|
| [OpenCode](https://opencode.ai) | `~/.config/opencode/opencode.json` → `mcp.variantree` |
| [Claude Code](https://claude.ai/code) | `~/.claude.json` → `mcpServers.variantree` |

> **Requirements:** Node.js 18+

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

| Package | Install? | Description |
|---|---|---|
| [`@variantree/core`](packages/core) | No | Core engine — workspace, branch, checkpoint, and context logic |
| [`@variantree/watcher`](packages/watcher) | **`npm i -g`** | CLI + adapters for OpenCode \& Claude Code. Auto-registers MCP on install. |
| [`@variantree/mcp`](packages/mcp) | No | MCP server binary — invoked automatically by AI tools, not by users directly |

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

## References

Variantree is inspired by research on context branching for LLM conversations:

> **Context Branching for LLM Conversations: A Version Control Approach to Exploratory Programming**
> Chickmagalur Nanjundappa & Maaheshwari, 2025
> [arXiv:2512.13914](https://arxiv.org/abs/2512.13914)
>
> *"Branched conversations achieved higher response quality compared to linear conversations, with large improvements in focus and context awareness. Branching reduced context size by 58.1%, eliminating irrelevant exploratory content."*

---

## License

[PolyForm Noncommercial 1.0.0](LICENSE) — free for personal and open-source use.
