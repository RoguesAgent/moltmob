import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

// Generate 12 test agent wallets
const wallets: { name: string; publicKey: string; secretKey: string }[] = [];

const names = [
  'test-crab-01', 'test-crab-02', 'test-crab-03',
  'test-crab-04', 'test-crab-05', 'test-crab-06',
  'test-crab-07', 'test-crab-08', 'test-crab-09',
  'test-crab-10', 'test-crab-11', 'test-crab-12'
];

for (let i = 0; i < 12; i++) {
  const keypair = Keypair.generate();
  wallets.push({
    name: names[i],
    publicKey: keypair.publicKey.toBase58(),
    secretKey: Buffer.from(keypair.secretKey).toString('base64')
  });
}

// Save to JSON file
const outputPath = path.join(__dirname, 'test-wallets.json');
fs.writeFileSync(outputPath, JSON.stringify(wallets, null, 2));

console.log('Generated 12 test wallets:');
wallets.forEach(w => {
  console.log(`  ${w.name}: ${w.publicKey}`);
});
console.log(`\nSaved to: ${outputPath}`);
