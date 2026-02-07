#!/usr/bin/env node
/**
 * Fund test agent wallets from GM wallet
 * 
 * Usage: node fund-agents.mjs
 */

import { Connection, Keypair, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const LAMPORTS_PER_SOL = 1000000000;

// GM wallet secret key (loaded from env or file)
// For devnet testing - using hardcoded for now
const GM_SECRET_KEY = process.env.GM_SECRET_KEY 
  ? Buffer.from(process.env.GM_SECRET_KEY, 'base64')
  : null;

async function main() {
  console.log('🦀 Funding Test Agents\n');

  // Connect to devnet
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

  // Load GM wallet (for now create from known)
  // In production, this would be RoguesAgent's actual wallet
  const gmKeypair = Keypair.fromSecretKey(
    Uint8Array.from([200, 174, 224, 168, 81, 18, 67, 52, 187, 150, 184, 181, 14, 176, 251, 62, 204, 131, 146, 179, 91, 75, 140, 45, 253, 48, 236, 48, 127, 200, 49, 181, 163, 27, 174, 162, 113, 6, 103, 125, 158, 181, 224, 205, 152, 90, 78, 61, 76, 250, 102, 77, 199, 105, 49, 83, 102, 164, 62, 167, 34, 252, 4, 212])
  );

  const gmBalance = await connection.getBalance(gmKeypair.publicKey);
  console.log(`GM Wallet: ${gmKeypair.publicKey.toBase58()}`);
  console.log(`GM Balance: ${gmBalance / LAMPORTS_PER_SOL} SOL\n`);

  // Amount to fund each agent (0.2 SOL)
  const amount = 0.2 * LAMPORTS_PER_SOL;

  // Load all test agent wallets
  const liveAgentsDir = join(__dirname, 'live-agents');
  const agents = readdirSync(liveAgentsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => {
      const walletPath = join(liveAgentsDir, dirent.name, 'wallet.json');
      try {
        const walletData = JSON.parse(readFileSync(walletPath, 'utf-8'));
        return { name: dirent.name, publicKey: walletData.publicKey };
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  console.log(`Found ${agents.length} test agents\n`);

  // Fund each agent
  for (const agent of agents) {
    try {
      const toPublicKey = new PublicKey(agent.publicKey);
      
      // Check current balance
      const currentBalance = await connection.getBalance(toPublicKey);
      console.log(`${agent.name}: ${currentBalance / LAMPORTS_PER_SOL} SOL current`);

      if (currentBalance >= amount) {
        console.log(`  ✓ ${agent.name} already funded (skipping)`);
        continue;
      }

      const needed = amount - currentBalance;
      
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: gmKeypair.publicKey,
          toPubkey: toPublicKey,
          lamports: needed,
        })
      );

      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [gmKeypair]
      );

      console.log(`  ✓ Funded ${agent.name} with ${needed / LAMPORTS_PER_SOL} SOL`);
      console.log(`    Tx: ${signature}`);
    } catch (err) {
      console.error(`  ✗ Failed to fund ${agent.name}:`, err.message);
    }
  }

  console.log('\n✅ All agents funded!');
}

main().catch(console.error);
