# Variantree

Variantree is an AI-first version control system designed to manage code and conversation context collaboratively with an AI coding assistant (like OpenCode or Claude Code). 

By integrating Variantree via the Model Context Protocol (MCP), your AI can seamlessly snapshot your codebase, manage parallel branches of thought, and restore prior states without losing the context of the conversation.

## Available MCP Tools

Current tools exposed to the AI via MCP:

### 1. `checkpoint`
* **What it does:** Saves your current progress.
* **How it works:** Grabs all recent chat messages and takes a snapshot of all files in your project directory (ignoring noisy folders like `node_modules` and `.git`).
* **When to use it:** When you reach a stable state, like "finished login page" or "tests are passing."

### 2. `branch`
* **What it does:** Starts a new, alternate timeline of work.
* **How it works:** 
  1. Creates a new branch name (e.g., `experiment-auth`).
  2. If a checkpoint is specified, it restores your workspace back to that old checkpoint. Otherwise, it automatically creates a fresh checkpoint of your current code.
  3. Generates a `.variantree/branch-context.md` file containing the chat history from *that* branch so the AI remembers what happened before.
* **When to use it:** When trying a risky refactor or building a new feature without breaking your current code.

### 3. `restore`
* **What it does:** Acts like an "Undo" button for your code.
* **How it works:** Overwrites your current working directory files with the files from a specific checkpoint in time. *It does not change your branch.*
* **When to use it:** When you made a mess of your current code and want to go back to the last time it was working.

### 4. `status`
* **What it does:** Gives a quick summary of where you are.
* **How it works:** Reads the Variantree database and tells you which branch is currently active, how many messages are in the current context, and lists your recent checkpoints.
* **When to use it:** To instantly know "What branch am I on?" or "What checkpoints do I have?"

### 5. `tree`
* **What it does:** Creates a visual map of your work.
* **How it works:** Draws a text-based (ASCII) diagram showing all your branches and checkpoints.
* **When to use it:** When you want a bird's-eye view of the project's history.

### 6. `switch`
* **What it does:** Jumps between existing branches without branching off.
* **How it works:** 
  1. Changes Variantree's active branch in `.variantree/workspace.json`.
  2. Overwrites your current working directory files with the latest checkpoint from that branch.
  3. Generates a fresh `.variantree/branch-context.md` file so the AI loads the chat history from your destination branch.
* **When to use it:** When you want to flip back to the `main` branch or resume work on a different existing branch.
