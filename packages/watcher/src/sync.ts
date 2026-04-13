/**
 * @variantree/watcher — Shared conversation sync
 *
 * Adapter-agnostic syncConversation used by both the MCP server and the CLI.
 *
 * Strategy:
 *   1. If the workspace already has a pinned session ID for any adapter, use
 *      that adapter exclusively (prevents cross-adapter message confusion).
 *   2. If no adapter is pinned yet, try each adapter in ALL_TOOLS order and
 *      use the first one that discovers an active session for the workspace.
 *   3. Within the chosen adapter, apply the stale-session fallback: if the
 *      pinned session returns no messages, re-discover the current session.
 */

import type { VariantTree } from '@variantree/core';
import { ALL_TOOLS } from './tools/index.js';
import type { SessionAdapter } from './tools/base.js';
import { MessageDiffer } from './differ.js';

/** All adapters registered across ALL_TOOLS, in priority order. */
function getAdapters(): SessionAdapter[] {
  return ALL_TOOLS.flatMap(t => (t.adapter ? [t.adapter] : []));
}

export async function syncConversation(
  engine: VariantTree,
  cwd: string,
): Promise<number> {
  const adapters = getAdapters();

  // If a session ID is already pinned for any adapter, only use that adapter.
  // This prevents mixing messages from OpenCode and Claude Code in the same branch.
  const pinnedAdapter = adapters.find(a => engine.getSessionId(a.name) != null);
  const candidates = pinnedAdapter ? [pinnedAdapter] : adapters;

  for (const adapter of candidates) {
    let sessionId = engine.getSessionId(adapter.name);

    if (!sessionId) {
      const discovered = await adapter.getCurrentSessionId(cwd);
      if (!discovered) continue;
      await engine.setSessionId(adapter.name, discovered);
      sessionId = discovered;
    }

    let messages = await adapter.readMessagesAsync(cwd, sessionId);

    // Stale-session fallback: user may have started a new session since last sync.
    if (messages.length === 0) {
      const freshId = await adapter.getCurrentSessionId(cwd);
      if (!freshId || freshId === sessionId) continue;
      await engine.setSessionId(adapter.name, freshId);
      sessionId = freshId;
      messages = await adapter.readMessagesAsync(cwd, sessionId);
    }

    if (messages.length === 0) continue;

    const existing = engine.getContext();
    const differ = new MessageDiffer();
    differ.diff(existing);
    const newMessages = differ.diff(messages);

    for (const msg of newMessages) {
      await engine.addMessage(msg.role, msg.content, { source: adapter.name });
    }

    return newMessages.length;
  }

  return 0;
}
