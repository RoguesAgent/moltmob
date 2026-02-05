#!/usr/bin/env node

/**
 * Test Agent Generator for MoltMob
 * Creates a new test agent with Solana wallet
 *
 * Usage: node create-agent.mjs <agent-name> "<persona>" "<voice-style>"
 * Example: node create-agent.mjs TestAgentA "sarcastic crab" "aggressive but smart"
 */

import { Keypair } from '@solana/web3.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const LOGO = `
╔════════════════════════════════════════════╗
║     🦀 MoltMob Test Agent Generator 🦀     ║
╚════════════════════════════════════════════╝
`;

function generateSoul(name, persona, voice) {
  const traits = [
    "Cunning strategist",
    "Quick with comebacks",
    "Loyal when it suits them",
    "Always suspicious",
    "Charismatic manipulator"
  ];
  
  const styles = ["aggressive", "cautious", "social", "analytical"];
  const bluffs = ["often", "rarely", "when pressured", "never"];
  const risks = ["high", "medium", "low", "calculated"];
  
  const trait1 = traits[Math.floor(Math.random() * traits.length)];
  const trait2 = traits[Math.floor(Math.random() * traits.length)];
  const trait3 = traits[Math.floor(Math.random() * traits.length)];
  
  return `# Soul - ${name}

## Identity
- **Name:** ${name}
- **Persona:** ${persona || 'A cunning agent testing the waters'}
- **Voice:** ${voice || 'Direct, occasionally sarcastic'}

## Traits
- ${trait1}
- ${trait2}
- ${trait3}

## Game Strategy
- **Style:** ${styles[Math.floor(Math.random() * styles.length)]}
- **Bluffing:** ${bluffs[Math.floor(Math.random() * bluffs.length)]}
- **Risk Tolerance:** ${risks[Math.floor(Math.random() * risks.length)]}

## Moltbook Presence
- Submolts: /m/moltmob, /m/solana
- Posting Style: Enthusiastic about web3, occasional game updates

## Wallet
- Address: {WALLET_ADDRESS}
- Network: devnet

---
_This agent was generated on ${new Date().toISOString()}_
`;
}

function generateState(name, walletAddress) {
  return {
    agent_name: name,
    persona: "Generated test agent",
    created_at: new Date().toISOString(),
    wallet_address: walletAddress,
    game_state: {
      current_pod_id: null,
      current_role: null,
      status: "idle",
      last_pod_end: null,
      total_games_played: 0,
      total_games_won: 0
    },
    vote_history: [],
    social_state: {
      last_post_time: null,
      last_reply_time: null,
      posts_made: 0,
      comments_made: 0,
      reputation_score: 0
    },
    encryption_keys: {
      // Populated when agent joins a game
      game_pubkey: null,
      shared_secrets: {}
    },
    notes: []
  };
}

async function main() {
  console.log(LOGO);
  
  const name = process.argv[2];
  const persona = process.argv[3] || "A curious test agent";
  const voice = process.argv[4] || "Friendly but calculating";
  
  if (!name) {
    console.error("❌ Usage: node create-agent.mjs <agent-name> [persona] [voice]");
    console.error("   Example: node create-agent.mjs TestAgentA 'sarcastic crab'");
    process.exit(1);
  }
  
  const liveDir = join(process.cwd(), 'live-agents');
  const agentDir = join(liveDir, name);
  
  if (existsSync(agentDir)) {
    console.error(`❌ Agent "${name}" already exists at ${agentDir}`);
    process.exit(1);
  }
  
  console.log(`🦀 Creating test agent: ${name}\n`);
  
  // Create directory
  mkdirSync(agentDir, { recursive: true });
  console.log(`📁 Created: ${agentDir}`);
  
  // Generate Solana wallet
  console.log("🔐 Generating Solana wallet...");
  const keypair = Keypair.generate();
  const walletAddress = keypair.publicKey.toBase58();
  const secretKey = Array.from(keypair.secretKey);
  
  // Save wallet
  writeFileSync(
    join(agentDir, 'wallet.json'),
    JSON.stringify({
      publicKey: walletAddress,
      secretKey: secretKey,
      network: 'devnet'
    }, null, 2)
  );
  console.log(`💰 Wallet: ${walletAddress}`);
  
  // Save soul
  const soulContent = generateSoul(name, persona, voice)
    .replace('{WALLET_ADDRESS}', walletAddress);
  writeFileSync(join(agentDir, 'soul.md'), soulContent);
  console.log(`📝 Soul file created`);
  
  // Save state
  const state = generateState(name, walletAddress);
  writeFileSync(join(agentDir, 'state.json'), JSON.stringify(state, null, 2));
  console.log(`📊 State file created`);

  console.log(`\n✅ Agent "${name}" created successfully!`);
  console.log(`\nNext steps:`);
  console.log(`  1. Fund the wallet: ${walletAddress}`);
  console.log(`     → https://faucet.solana.com or use: solana airdrop 2 ${walletAddress}`);
  console.log(`  2. Edit soul.md to customize the persona`);
  console.log(`  3. Register agent in MoltMob database`);
  console.log(`  4. Use "node register-agent.mjs ${name}" to onboard`);
  
  console.log(`\n⚠️  IMPORTANT: wallet.json contains private keys - never commit to git!`);
  console.log(`   The live-agents/ folder is in .gitignore`);
}

main().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
