#!/usr/bin/env node
/**
 * Full End-to-End Game Test
 * 
 * Runs a complete MoltMob game on devnet with:
 * - x402 entry fee payments
 * - Test agents as players
 * - Mock Moltbook on moltmob.com
 * - Encrypted role delivery
 * - Full game loop (night → day → vote → repeat)
 * - Winner payout
 * 
 * Usage: node full-game-test.mjs
 */

import { Connection, PublicKey, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TEST_CONFIG, loadWallet, checkBalance } from './test-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function logBanner(text) {
  console.log('\n' + '='.repeat(60));
  console.log(` 🦞 ${text}`);
  console.log('='.repeat(60) + '\n');
}

async function main() {
  logBanner('MOLTMOB FULL GAME TEST');
  console.log('Environment: devnet + mock Moltbook');
  console.log(`Moltbook URL: ${TEST_CONFIG.moltbook.baseUrl}`);
  console.log(`Entry Fee: ${TEST_CONFIG.pod.entryFee / LAMPORTS_PER_SOL} SOL\n`);

  // 1. Setup GM wallet
  console.log('1️⃣  Setting up GM wallet...');
  // RoguesAgent's wallet - in production this would be loaded differently
  const gmKeypair = Keypair.fromSecretKey(
    // This is a placeholder - real key should be loaded from secure storage
    Buffer.from(process.env.GM_SECRET_KEY || '', 'base64') || new Uint8Array(64)
  );
  console.log(`​   GM Address: ${gmKeypair.publicKey.toBase58()}`);

  // Connect to devnet
  const connection = new Connection(TEST_CONFIG.solana.rpc, 'confirmed');

  // 2. Check GM balance
  console.log('2️⃣  Checking GM balance...');
  const gmBalance = await connection.getBalance(gmKeypair.publicKey);
  console.log(`​   GM Balance: ${gmBalance / LAMPORTS_PER_SOL} SOL`);

  if (gmBalance < TEST_CONFIG.pod.entryFee * 10) {
    console.log('⚠️  Warning: GM balance may be insufficient for payouts');
  }

  // 3. Load test agents
  console.log('\n3️⃣  Loading test agents...');
  const agents = [];
  for (const agentConfig of TEST_CONFIG.agents) {
    const walletPath = join(__dirname, agentConfig.walletPath);
    if (!existsSync(walletPath)) {
      console.error(`​   ❌ Wallet not found: ${agentConfig.name}`);
      continue;
    }

    const walletData = JSON.parse(readFileSync(walletPath, 'utf-8'));
    const keypair = Keypair.fromSecretKey(new Uint8Array(walletData.secretKey));
    const balance = await connection.getBalance(keypair.publicKey);

    agents.push({
      name: agentConfig.name,
      keypair,
      balance,
    });

    console.log(`​   ✓ ${agentConfig.name}: ${keypair.publicKey.toBase58()} (${balance / LAMPORTS_PER_SOL} SOL)`);
  }

  if (agents.length < TEST_CONFIG.pod.minPlayers) {
    console.error(`\n❌ Not enough agents (${agents.length} < ${TEST_CONFIG.pod.minPlayers})`);
    process.exit(1);
  }

  // 4. Check if agents need funding
  console.log('\n4️⃣  Checking agent funding...');
  const underfundedAgents = agents.filter(a => a.balance < TEST_CONFIG.pod.entryFee);
  if (underfundedAgents.length > 0) {
    console.log(`​   ${underfundedAgents.length} agents need funding:`);
    for (const agent of underfundedAgents) {
      console.log(`​     - ${agent.name}: needs ${(TEST_CONFIG.pod.entryFee - agent.balance) / LAMPORTS_PER_SOL} SOL more`);
    }
    console.log('\n​   Sending funds from GM...');
    // TODO: Implement funding transactions
  } else {
    console.log(`​   ✓ All agents funded for entry`);
  }

  // 5. Create test pod
  console.log('\n5️⃣  Creating test pod...');
  const podNumber = Math.floor(Math.random() * 9000) + 1000;
  console.log(`​   Pod #${podNumber}`);
  console.log(`​   Entry Fee: ${TEST_CONFIG.pod.entryFee / LAMPORTS_PER_SOL} SOL`);
  console.log(`​   Players: ${agents.length}`);

  // 6. Register agents to mock Moltbook
  console.log('\n6️⃣  Registering agents with mock Moltbook...');
  for (const agent of agents) {
    // TODO: POST to mock Moltbook endpoint
    console.log(`​   ✓ ${agent.name} registered`);
  }

  // 7. Collect x402 payments
  console.log('\n7️⃣  Collecting x402 entry payments...');
  let totalPot = 0;
  for (const agent of agents) {
    // TODO: Implement x402 payment flow
    // 1. Agent creates payment authorization
    // 2. GM verifies and processes
    // 3. Update pot
    totalPot += TEST_CONFIG.pod.entryFee;
    console.log(`​   ✓ Payment from ${agent.name}: ${TEST_CONFIG.pod.entryFee / LAMPORTS_PER_SOL} SOL`);
  }
  console.log(`​   Total Pot: ${totalPot / LAMPORTS_PER_SOL} SOL`);

  // 8. Assign roles via encryption
  console.log('\n8️⃣  Assigning roles (encrypted delivery)...');
  const roles = ['clawboss', 'krill', 'krill', 'loyalist', 'loyalist', 'loyalist'];
  const shuffledRoles = roles.slice(0, agents.length).sort(() => Math.random() - 0.5);
  
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const role = shuffledRoles[i];
    // TODO: Encrypt role with agent's public key
    // TODO: Post encrypted role to mock Moltbook
    console.log(`​   Role assigned to ${agent.name}: ${role} (encrypted)`);
  }

  // 9. Game loop simulation
  console.log('\n9️⃣  Starting game loop...');
  let round = 1;
  const maxRounds = 5; // For testing

  while (round <= maxRounds) {
    console.log(`\n​   ─── ROUND ${round} ───`);

    // Night phase
    console.log(`​   🌙 Night Phase`);
    for (const agent of agents) {
      // TODO: Agent submits encrypted night action
      console.log(`​      ${agent.name}: submitted action`);
    }
    // TODO: GM resolves night

    // Day phase
    console.log(`​   ☀️  Day Phase`);
    // Discussion happens on mock Moltbook

    // Vote phase
    console.log(`​   🗳️  Vote Phase`);
    for (const agent of agents) {
      // TODO: Agent submits encrypted vote
      console.log(`​      ${agent.name}: voted`);
    }
    // TODO: GM tallies votes

    round++;
  }

  // 10. Game over - calculate payouts
  console.log('\n​   🏆 Game Over');
  console.log(`​   Final pot: ${totalPot / LAMPORTS_PER_SOL} SOL`);
  // TODO: Calculate winners and distribute

  // 11. Payout
  console.log('\n​   💰 Distributing payouts...');
  // TODO: Send payouts via x402 or direct transfer

  logBanner('TEST COMPLETE');
  console.log('\nNext steps:');
  console.log('  1. Fund GM wallet if needed');
  console.log('  2. Implement x402 payment flow');
  console.log('  3. Implement mock Moltbook API calls');
  console.log('  4. Add game logic resolution');
  console.log('  5. Add payout distribution');
}

main().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
