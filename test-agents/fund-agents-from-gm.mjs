#!/usr/bin/env node
/**
 * Fund test agent wallets from GM wallet (RoguesAgent)
 * 
 * Usage: GM_SECRET_KEY=base64_key node fund-agents-from-gm.mjs
 */

import { Connection, Keypair, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const TEST_AGENTS = [
  { name: 'TestAgentA', publicKey: 'ByhwM1fGPpRe5JmqjW9rygzKchWkTt7GWcMvZhVgxAmH' },
  { name: 'TestAgentB', publicKey: '9rCYqtFXiq7ZUQHvBHfuZovTM5PeKUQsGbQ2NVkKSxPh' },
  { name: 'TestAgentC', publicKey: 'HJa6tmRtGBMFW2cHNa5LDomyrsWkBU1aaNEEh5ejokrg' },
  { name: 'TestAgentD', publicKey: '5FLs81g3XkvLwke7xadWKyaDBWMcVMVqH23hDKxPX3qz' },
  { name: 'TestAgentE', publicKey: '2TxeLRpYGUrF9eR4buzboWgDrbLsH3zZ4FNVq7saYptA' },
  { name: 'TestAgentF', publicKey: '6DKhb43NaooV5LvMBQTTvbRB4acHTm3e8ZYyeioHJSTJ' },
];

// Amount to fund each agent (0.2 SOL - enough for 2 games)
const FUND_AMOUNT = 0.2 * LAMPORTS_PER_SOL;

async function main() {
  console.log('🦀 Funding Test Agents from GM Wallet\n');

  // GM wallet secret key from environment or wallet file
  let gmKeypair;
  const secretKeyBase64 = process.env.GM_SECRET_KEY;
  
  if (secretKeyBase64) {
    const secretKey = Buffer.from(secretKeyBase64, 'base64');
    gmKeypair = Keypair.fromSecretKey(new Uint8Array(secretKey));
  } else {
    // Try reading from wallet.json
    try {
      const walletPath = join(__dirname, 'live-agents', 'GM', 'wallet.json');
      const walletData = JSON.parse(readFileSync(walletPath, 'utf-8'));
      gmKeypair = Keypair.fromSecretKey(new Uint8Array(walletData.secretKey));
      console.log('✓ Loaded GM wallet from wallet.json');
    } catch (err) {
      console.error('❌ Set GM_SECRET_KEY environment variable or ensure live-agents/GM/wallet.json exists');
      console.error('   Example: GM_SECRET_KEY="base64_encoded_key" node fund-agents-from-gm.mjs');
      process.exit(1);
    }
  }
  
  console.log('GM Wallet:', gmKeypair.publicKey.toBase58());

  // Connect to devnet
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Check GM balance
  const gmBalance = await connection.getBalance(gmKeypair.publicKey);
  console.log(`GM Balance: ${gmBalance / LAMPORTS_PER_SOL} SOL\n`);

  const totalNeeded = FUND_AMOUNT * TEST_AGENTS.length;
  console.log(`Total to fund: ${totalNeeded / LAMPORTS_PER_SOL} SOL`);
  console.log(`(${TEST_AGENTS.length} agents × ${FUND_AMOUNT / LAMPORTS_PER_SOL} SOL each)\n`);

  if (gmBalance < totalNeeded) {
    console.error(`❌ GM balance insufficient: ${gmBalance / LAMPORTS_PER_SOL} < ${totalNeeded / LAMPORTS_PER_SOL}`);
    process.exit(1);
  }

  // Fund each agent
  for (const agent of TEST_AGENTS) {
    try {
      const toPublicKey = new PublicKey(agent.publicKey);
      
      // Check current balance
      const currentBalance = await connection.getBalance(toPublicKey);
      console.log(`${agent.name}: ${currentBalance / LAMPORTS_PER_SOL} SOL current`);

      if (currentBalance >= FUND_AMOUNT) {
        console.log(`  ✓ ${agent.name} already funded (skipping)\n`);
        continue;
      }

      const needed = FUND_AMOUNT - currentBalance;
      
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

      console.log(`  ✓ Funded with ${needed / LAMPORTS_PER_SOL} SOL`);
      console.log(`    Tx: ${signature}`);
      
      const newBalance = await connection.getBalance(toPublicKey);
      console.log(`    New balance: ${newBalance / LAMPORTS_PER_SOL} SOL\n`);

    } catch (err) {
      console.error(`  ✗ Failed to fund ${agent.name}:`, err.message, '\n');
    }
  }

  console.log('✅ All agents funded!');
}

main().catch(console.error);
