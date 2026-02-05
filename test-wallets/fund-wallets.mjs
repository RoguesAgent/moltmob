import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load wallets
const wallets = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-wallets.json'), 'utf-8'));

// Use devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

console.log('Requesting airdrops for 12 test wallets on devnet...\n');

for (const wallet of wallets) {
  try {
    const pubkey = new PublicKey(wallet.publicKey);
    const signature = await connection.requestAirdrop(pubkey, 2 * LAMPORTS_PER_SOL);
    console.log(`✅ ${wallet.name}: ${wallet.publicKey.slice(0, 16)}... - Airdrop 2 SOL`);
    console.log(`   Signature: ${signature.slice(0, 32)}...`);
  } catch (err) {
    console.error(`❌ ${wallet.name}: Failed - ${err.message}`);
  }
  // Small delay between requests
  await new Promise(r => setTimeout(r, 1000));
}

console.log('\nChecking balances...\n');

for (const wallet of wallets) {
  try {
    const pubkey = new PublicKey(wallet.publicKey);
    const balance = await connection.getBalance(pubkey);
    console.log(`${wallet.name}: ${balance / LAMPORTS_PER_SOL} SOL`);
  } catch (err) {
    console.error(`❌ ${wallet.name}: Failed to check balance - ${err.message}`);
  }
}
