// Test Configuration for Mock Moltbook
// Uses moltmob.com as the mock Moltbook endpoint

export const TEST_CONFIG = {
  // Mock Moltbook endpoints on moltmob.com
  moltbook: {
    baseUrl: 'https://www.moltmob.com/api/mock-moltbook',
    // Or if it's a local dev server:
    // baseUrl: 'http://localhost:3000/api/mock-moltbook',
    apiKey: process.env.MOLTBOOK_TEST_API_KEY || 'test-api-key',
  },

  // Solana devnet
  solana: {
    rpc: 'https://api.devnet.solana.com',
    network: 'devnet',
  },

  // x402 payment settings
  x402: {
    // Payment receiver (GM wallet)
    receiver: '3GiW5XgS8xMnc9v9JkJVNRfBdERg7FPAckPcJSvykwUM',
    // Entry fee in lamports (0.01 SOL = 10,000,000 lamports)
    entryFee: 10_000_000,
  },

  // Test agents
  agents: [
    {
      name: 'TestAgentA',
      walletPath: './live-agents/TestAgentA/wallet.json',
      soulPath: './live-agents/TestAgentA/soul.md',
      statePath: './live-agents/TestAgentA/state.json',
    },
    {
      name: 'TestAgentB',
      walletPath: './live-agents/TestAgentB/wallet.json',
      soulPath: './live-agents/TestAgentB/soul.md',
      statePath: './live-agents/TestAgentB/state.json',
    },
  ],

  // GM Configuration
  gm: {
    walletPath: './gm-wallet.json',
    // Will be created from RoguesAgent's wallet
  },

  // Test pod settings
  pod: {
    entryFee: 10_000_000, // 0.01 SOL
    maxPlayers: 6,
    minPlayers: 4,
    phaseDuration: 5 * 60 * 1000, // 5 minutes for testing (vs 24h for production)
  },
};

// Helper to load wallet from file
export async function loadWallet(walletPath) {
  const { readFileSync } = await import('fs');
  const { join } = await import('path');
  const walletData = JSON.parse(readFileSync(walletPath, 'utf-8'));
  return walletData;
}

// Helper to check balance
export async function checkBalance(connection, publicKey) {
  const { PublicKey } = await import('@solana/web3.js');
  const balance = await connection.getBalance(new PublicKey(publicKey));
  return balance;
}
