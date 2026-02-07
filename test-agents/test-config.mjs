// Test Configuration for Mock Moltbook
// Uses moltmob.com as the mock Moltbook endpoint
export const TEST_CONFIG = {
  // Mock Moltbook endpoints on moltmob.com
  moltbook: {
    baseUrl: 'https://www.moltmob.com/api/mock-moltbook',
    apiKey: process.env.MOLTBOOK_TEST_API_KEY || 'test-api-key',
  },

  // Solana devnet
  solana: {
    rpc: 'https://api.devnet.solana.com',
    network: 'devnet',
  },

  // x402 payment settings
  x402: {
    // Payment receiver (GM wallet - RoguesAgent)
    receiver: '3GiW5XgS8xMnc9v9JkJVNRfBdERg7FPAckPcJSvykwUM',
    // Entry fee in lamports (0.1 SOL = 100,000,000 lamports)
    entryFee: 100_000_000,
  },

  // All 6 test agents
  agents: [
    { name: 'TestAgentA', walletPath: './live-agents/TestAgentA/wallet.json', publicKey: 'ByhwM1fGPpRe5JmqjW9rygzKchWkTt7GWcMvZhVgxAmH' },
    { name: 'TestAgentB', walletPath: './live-agents/TestAgentB/wallet.json', publicKey: '9rCYqtFXiq7ZUQHvBHfuZovTM5PeKUQsGbQ2NVkKSxPh' },
    { name: 'TestAgentC', walletPath: './live-agents/TestAgentC/wallet.json', publicKey: 'HJa6tmRtGBMFW2cHNa5LDomyrsWkBU1aaNEEh5ejokrg' },
    { name: 'TestAgentD', walletPath: './live-agents/TestAgentD/wallet.json', publicKey: '5FLs81g3XkvLwke7xadWKyaDBWMcVMVqH23hDKxPX3qz' },
    { name: 'TestAgentE', walletPath: './live-agents/TestAgentE/wallet.json', publicKey: '2TxeLRpYGUrF9eR4buzboWgDrbLsH3zZ4FNVq7saYptA' },
    { name: 'TestAgentF', walletPath: './live-agents/TestAgentF/wallet.json', publicKey: '6DKhb43NaooV5LvMBQTTvbRB4acHTm3e8ZYyeioHJSTJ' },
  ],

  // GM Configuration (RoguesAgent)
  gm: {
    publicKey: '3GiW5XgS8xMnc9v9JkJVNRfBdERg7FPAckPcJSvykwUM',
  },

  // New Supabase (migrated Feb 6)
  supabase: {
    url: 'https://tecywteuhsicdeuygznl.supabase.co',
    // Service role key from env
  },

  // Test pod settings
  pod: {
    entryFee: 100_000_000, // 0.1 SOL
    maxPlayers: 6,
    minPlayers: 4,
    phaseDuration: 5 * 60 * 1000, // 5 minutes for testing
  },
};

// Calculate total pot for 6 players
export const TOTAL_POT = TEST_CONFIG.agents.length * TEST_CONFIG.pod.entryFee; // 0.6 SOL

// Helper to load wallet from file
export async function loadWallet(walletPath) {
  const { readFileSync } = await import('fs');
  const { join } = await import('path');
  const walletData = JSON.parse(readFileSync(walletPath, 'utf-8'));
  return walletData;
}

// Check if all agents are funded
export async function checkAgentFunding(connection) {
  const results = [];
  for (const agent of TEST_CONFIG.agents) {
    const { PublicKey } = await import('@solana/web3.js');
    const balance = await connection.getBalance(new PublicKey(agent.publicKey));
    results.push({
      name: agent.name,
      publicKey: agent.publicKey,
      balance,
      funded: balance >= TEST_CONFIG.pod.entryFee,
    });
  }
  return results;
}
