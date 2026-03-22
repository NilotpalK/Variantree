/**
 * Variantree Core Engine — Interactive Demo
 *
 * Run: npx tsx packages/core/demo.ts
 */

import { VariantTree, MemoryStorage } from './src/index';

async function demo() {
  const engine = new VariantTree({ storage: new MemoryStorage() });

  // ─── 1. Create a workspace ──────────────────────────────────────────────
  console.log('━━━ 1. Creating workspace ━━━');
  const ws = await engine.createWorkspace('Auth System Design');
  console.log(`Workspace: "${ws.title}" (${ws.id.slice(0, 8)}...)`);
  console.log(`Active branch: ${engine.getActiveBranch().name}\n`);

  // ─── 2. Have a conversation on main ─────────────────────────────────────
  console.log('━━━ 2. Adding messages to main ━━━');
  await engine.addMessage('user', 'Help me design an authentication system');
  await engine.addMessage('assistant', 'Sure! Here are the main options:\n1. JWT tokens\n2. OAuth 2.0\n3. Session-based auth');
  await engine.addMessage('user', 'Tell me more about each approach');
  await engine.addMessage('assistant', 'JWT: Stateless, good for APIs...\nOAuth: Delegated auth, good for third-party...\nSession: Traditional, server-side state...');

  const context = engine.getContext();
  console.log(`Main branch now has ${context.length} messages`);
  context.forEach((m, i) => console.log(`  [${i}] ${m.role}: ${m.content.slice(0, 50)}...`));
  console.log();

  // ─── 3. Create a checkpoint at the decision point ───────────────────────
  console.log('━━━ 3. Creating checkpoint ━━━');
  const cp = await engine.createCheckpoint('Auth options reviewed');
  console.log(`📌 Checkpoint: "${cp.label}" (after message index ${cp.messageIndex})\n`);

  // ─── 4. Branch to explore JWT ───────────────────────────────────────────
  console.log('━━━ 4. Branching to explore JWT ━━━');
  const jwtBranch = await engine.branch('explore-jwt', cp.id);
  console.log(`🌿 Created branch: "${jwtBranch.name}"`);
  console.log(`Active branch is now: ${engine.getActiveBranch().name}`);

  await engine.addMessage('user', 'Let\'s go with JWT. Show me the implementation');
  await engine.addMessage('assistant', 'Here\'s a JWT auth implementation:\n- Access token (15min expiry)\n- Refresh token (7 day expiry)\n- Token rotation on refresh');

  const jwtContext = engine.getContext();
  console.log(`JWT branch context: ${jwtContext.length} messages (4 inherited + 2 new)`);
  console.log();

  // ─── 5. Switch back to main, branch for OAuth ──────────────────────────
  console.log('━━━ 5. Switching back to main, branching for OAuth ━━━');
  const mainId = engine.getBranches().find(b => b.name === 'main')!.id;
  await engine.switchBranch(mainId);
  console.log(`Switched back to: ${engine.getActiveBranch().name}`);
  console.log(`Main still has ${engine.getContext().length} messages (untouched!)`);

  const oauthBranch = await engine.branch('explore-oauth', cp.id);
  console.log(`🌿 Created branch: "${oauthBranch.name}"`);

  await engine.addMessage('user', 'Actually, let\'s try OAuth 2.0 with Google');
  await engine.addMessage('assistant', 'Here\'s OAuth 2.0 with Google:\n- Register app in Google Cloud Console\n- Implement authorization code flow\n- Handle token exchange');
  await engine.addMessage('user', 'What about refresh handling?');
  await engine.addMessage('assistant', 'For OAuth refresh:\n- Store refresh token securely\n- Auto-refresh before expiry\n- Handle revocation gracefully');

  const oauthContext = engine.getContext();
  console.log(`OAuth branch context: ${oauthContext.length} messages (4 inherited + 4 new)`);
  console.log();

  // ─── 6. Deep branching — branch from the OAuth branch ──────────────────
  console.log('━━━ 6. Deep branching (OAuth → Passkeys) ━━━');
  const cp2 = await engine.createCheckpoint('OAuth explored');
  const passkeysBranch = await engine.branch('try-passkeys', cp2.id);
  console.log(`🌿 Created branch: "${passkeysBranch.name}" (branched from OAuth)`);

  await engine.addMessage('user', 'What about passkeys instead?');
  await engine.addMessage('assistant', 'Passkeys use WebAuthn:\n- No passwords needed\n- Biometric/device-based\n- Phishing-resistant');

  const passkeysContext = engine.getContext();
  console.log(`Passkeys context: ${passkeysContext.length} messages (4 main + 4 oauth + 2 passkeys)`);
  console.log();

  // ─── 7. Show storage efficiency ─────────────────────────────────────────
  console.log('━━━ 7. Storage efficiency ━━━');
  const workspace = engine.getWorkspace();
  const branches = Object.values(workspace.branches);
  let totalStored = 0;
  branches.forEach(b => {
    console.log(`  ${b.name}: ${b.messages.length} messages stored`);
    totalStored += b.messages.length;
  });
  console.log(`  Total messages stored: ${totalStored}`);
  console.log(`  Without path-resolution, would store: ${4 + (4+2) + (4+4) + (4+4+2)} = 28 messages`);
  console.log(`  Savings: ${28 - totalStored} messages not duplicated! 🎉`);
  console.log();

  // ─── 8. Branch ancestry ────────────────────────────────────────────────
  console.log('━━━ 8. Branch ancestry (breadcrumbs) ━━━');
  const ancestry = engine.getAncestry();
  const ancestryNames = ancestry.map(id => workspace.branches[id].name);
  console.log(`Passkeys path: ${ancestryNames.join(' → ')}`);
  console.log();

  // ─── 9. Show all branches ──────────────────────────────────────────────
  console.log('━━━ 9. All branches ━━━');
  engine.getBranches().forEach(b => {
    const active = b.isActive ? ' ← ACTIVE' : '';
    console.log(`  ${b.isActive ? '●' : '○'} ${b.name} (${b.messageCount} msgs)${active}`);
  });
  console.log();

  console.log('✅ Demo complete! The core engine is working.');
}

demo().catch(console.error);
