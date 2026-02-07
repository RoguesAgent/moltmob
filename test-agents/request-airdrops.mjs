#!/usr/bin/env node
/**
 * Request devnet airdrops for all test agents
 * 
 * Usage: node request-airdrops.mjs
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { TEST_CONFIG } from './test-config.mjs';

async function main() {
  console.log('🦀 Requesting devnet airdrops for test agents\n');

  const connection = new Connection(TEST_CONFIG.solana.rpc, 'confirmed');
  const amount = 0.2 * 1000000000; // 0.2 SOL in lamports

  for (const agent of TEST_CONFIG.agents) {
    try {
      const publicKey = new PublicKey(agent.publicKey);
      
      // Check current balance
      const currentBalance = await connection.getBalance(publicKey);
      console.log(`${agent.name}: ${currentBalance / 1000000000} SOL current`);

      if (currentBalance >= amount) {
        console.log(`  ✓ ${agent.name} already funded\n`);
        continue;
      }

      // Request airdrop
      const signature = await connection.requestAirdrop(publicKey, amount);
      console.log(`  ✓ Airdrop requested: ${amount / 1000000000} SOL`);
      console.log(`  ⏳ Confirming: ${signature}`);

      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed');
      
      const newBalance = await connection.getBalance(publicKey);
      console.log(`  ✓ Confirmed! New balance: ${newBalance / 1000000000} SOL\n`);

      // Rate limit - devnet faucet has limits
      await new Promise(r => setTimeout(r, 1000));

    } catch (err) {
      console.error(`  ✗ ${agent.name} failed:`, err.message, '\n');
    }
  }

  console.log('\n✅ Airdrop requests complete');
  console.log('\nTo use your GM wallet (37.4 SOL) instead:');
  console.log('1. Set GM_SECRET_KEY env variable');
  console.log('2. Run: node fund-agents-from-gm.mjs');
}

main().catch(console.error);
