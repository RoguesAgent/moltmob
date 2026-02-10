#!/usr/bin/env node
/**
 * MoltMob Full Game Test - API-based Agent Simulation
 * 
 * Simulates real agents playing MoltMob by:
 * - Reading each agent's SOUL.md for personality
 * - Calling api/v1/* endpoints (like real Moltbook-connected agents)
 * - Making real Solana transactions on devnet
 * - Playing the game with strategic decisions based on persona
 * 
 * USAGE:
 *   # Run with 6 agents (minimum)
 *   node run-game.mjs
 * 
 *   # Run with 12 agents
 *   AGENT_COUNT=12 node run-game.mjs
 * 
 *   # Use real Moltbook (vs mock)
 *   USE_REAL_MOLTBOOK=true node run-game.mjs
 * 
 * PREREQUISITES:
 *   1. Agents registered in database (run register-all-agents.mjs first)
 *   2. Agent wallets funded with devnet SOL (run fund-agents-from-gm.mjs)
 *   3. API server running (cd web && npm run dev or deployed to Vercel)
 */

import { Connection, Keypair, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============ CONFIGURATION ============
const CONFIG = {
  API_URL: process.env.API_URL || 'https://www.moltmob.com',
  SOLANA_RPC: process.env.SOLANA_RPC || 'https://api.devnet.solana.com',
  ENTRY_FEE: 100_000_000, // 0.1 SOL
  AGENT_COUNT: parseInt(process.env.AGENT_COUNT || '6', 10),
  GM_WALLET: '79K4v3MDcP9mjC3wEzRRg5JUYfnag3AYWxux1wtn1Avz',
  
  // Timing
  PHASE_WAIT_MS: 2000,
  POLL_INTERVAL_MS: 3000,
};

// Agent names in order
const AGENT_NAMES = [
  'TestAgentA', 'TestAgentB', 'TestAgentC', 'TestAgentD',
  'TestAgentE', 'TestAgentF', 'TestAgentG', 'TestAgentH',
  'TestAgentI', 'TestAgentJ', 'TestAgentK', 'TestAgentL',
];

// ============ AGENT CLASS ============
class Agent {
  constructor(name, folder) {
    this.name = name;
    this.folder = folder;
    this.wallet = null;
    this.keypair = null;
    this.apiKey = null;
    this.soul = null;
    this.agentId = null;
    this.playerId = null;
    this.role = null;
    this.isAlive = true;
  }

  async load() {
    const basePath = join(__dirname, 'live-agents', this.folder);
    
    // Load wallet
    const walletPath = join(basePath, 'wallet.json');
    if (!existsSync(walletPath)) {
      throw new Error(`Wallet not found: ${walletPath}`);
    }
    const walletData = JSON.parse(readFileSync(walletPath, 'utf-8'));
    this.wallet = walletData.publicKey;
    this.keypair = Keypair.fromSecretKey(new Uint8Array(walletData.secretKey));
    
    // Load SOUL.md
    const soulPath = join(basePath, 'soul.md');
    if (existsSync(soulPath)) {
      this.soul = readFileSync(soulPath, 'utf-8');
      this.parseSoul();
    }
    
    // Load state for API key
    const statePath = join(basePath, 'state.json');
    if (existsSync(statePath)) {
      const state = JSON.parse(readFileSync(statePath, 'utf-8'));
      this.apiKey = state.api_key;
    }
    
    console.log(`  ✓ ${this.name} loaded (${this.persona || 'default persona'})`);
  }

  parseSoul() {
    // Extract persona from SOUL.md
    const personaMatch = this.soul.match(/\*\*Persona:\*\*\s*(.+)/);
    this.persona = personaMatch ? personaMatch[1].trim() : 'strategic player';
    
    // Extract traits
    const styleMatch = this.soul.match(/\*\*Style:\*\*\s*(.+)/);
    this.playStyle = styleMatch ? styleMatch[1].trim() : 'cautious';
    
    const bluffMatch = this.soul.match(/\*\*Bluffing:\*\*\s*(.+)/);
    this.bluffsOften = bluffMatch && bluffMatch[1].includes('often');
    
    const riskMatch = this.soul.match(/\*\*Risk Tolerance:\*\*\s*(.+)/);
    this.riskTolerance = riskMatch ? riskMatch[1].trim() : 'medium';
  }

  async callApi(endpoint, method = 'GET', body = null) {
    const url = `${CONFIG.API_URL}/api/v1${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
    };
    
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    
    const options = { method, headers };
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    
    return { status: res.status, ok: res.ok, data };
  }

  async payEntryFee(podVault) {
    const connection = new Connection(CONFIG.SOLANA_RPC, 'confirmed');
    
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: this.keypair.publicKey,
        toPubkey: new PublicKey(podVault),
        lamports: CONFIG.ENTRY_FEE,
      })
    );
    
    const signature = await sendAndConfirmTransaction(connection, tx, [this.keypair]);
    return signature;
  }

  generateDiscussion() {
    const phrases = [
      `I'm watching everyone carefully. EXFOLIATE!`,
      `The Clawboss hides among us. We must find them.`,
      `Trust no one. Even your shell could betray you.`,
      `The water's getting warmer. Stay sharp, crustaceans.`,
      `Let's not rush to judgment. Observe first, pinch later.`,
    ];
    
    // Add persona-specific flavor
    if (this.bluffsOften) {
      phrases.push(`I have information that could change everything...`);
      phrases.push(`Something's not right about the votes...`);
    }
    
    if (this.riskTolerance === 'high') {
      phrases.push(`We need to make bold moves!`);
      phrases.push(`Anyone else notice ${this.getRandomAgentName()}'s suspicious timing?`);
    }
    
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  getRandomAgentName() {
    const others = AGENT_NAMES.filter(n => n !== this.name);
    return others[Math.floor(Math.random() * others.length)];
  }

  chooseVoteTarget(aliveAgents, gameEvents) {
    // Simple voting logic based on persona
    const others = aliveAgents.filter(a => a.name !== this.name);
    
    if (this.riskTolerance === 'high') {
      // High risk: vote for whoever spoke most suspiciously
      return others[Math.floor(Math.random() * others.length)];
    }
    
    // Default: random vote among others
    return others[Math.floor(Math.random() * others.length)];
  }
}

// ============ GAME ORCHESTRATOR ============
class GameClient {
  constructor() {
    this.agents = [];
    this.podId = null;
    this.podNumber = null;
    this.currentPhase = null;
    this.currentRound = 0;
  }

  async loadAgents(count) {
    console.log(`\nLoading ${count} agents...`);
    
    for (let i = 0; i < count && i < AGENT_NAMES.length; i++) {
      const name = AGENT_NAMES[i];
      const agent = new Agent(name, name);
      await agent.load();
      this.agents.push(agent);
    }
    
    console.log(`✓ Loaded ${this.agents.length} agents\n`);
  }

  async registerAgents() {
    console.log('Registering agents with API...');
    
    for (const agent of this.agents) {
      const { status, data } = await agent.callApi('/agents/register', 'POST', {
        wallet_pubkey: agent.wallet,
        name: agent.name,
        moltbook_username: agent.name.toLowerCase(),
      });
      
      if (status === 201 || status === 200) {
        agent.apiKey = data.api_key || data.agent?.api_key;
        agent.agentId = data.agent?.id || data.id;
        console.log(`  ✓ ${agent.name} registered`);
      } else if (status === 409) {
        // Already exists - fetch the agent
        console.log(`  ○ ${agent.name} already registered`);
      } else {
        console.log(`  ✗ ${agent.name} failed: ${data.error || status}`);
      }
    }
  }

  async joinPod() {
    console.log('\n=== JOINING POD ===\n');
    
    const gmWallet = CONFIG.GM_WALLET;
    
    for (const agent of this.agents) {
      try {
        // Pay entry fee
        console.log(`  ${agent.name}: paying 0.1 SOL...`);
        const txSig = await agent.payEntryFee(gmWallet);
        console.log(`  ${agent.name}: tx ${txSig.slice(0, 16)}...`);
        
        // Join via /play endpoint
        const { status, data } = await fetch(`${CONFIG.API_URL}/api/v1/play`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-wallet-pubkey': agent.wallet,
            'x402': `moltmob:${CONFIG.ENTRY_FEE}:${agent.name}:${txSig}`,
          },
          body: JSON.stringify({
            moltbook_username: agent.name,
          }),
        }).then(r => r.json().then(d => ({ status: r.status, data: d })));
        
        if (data.success) {
          agent.agentId = data.player?.id;
          this.podId = data.game?.pod_id;
          this.podNumber = data.game?.pod_number;
          console.log(`  ✓ ${agent.name} joined Pod #${this.podNumber}`);
        } else {
          console.log(`  ✗ ${agent.name}: ${data.error || 'failed'}`);
        }
        
        // Small delay between joins
        await this.sleep(500);
        
      } catch (err) {
        console.log(`  ✗ ${agent.name}: ${err.message}`);
      }
    }
    
    console.log(`\n✓ Pod #${this.podNumber} - ${this.agents.length} agents joined`);
  }

  async pollGameState() {
    const agent = this.agents[0]; // Use first agent to poll
    const { data } = await agent.callApi(`/pods/${this.podId}`);
    return data;
  }

  async waitForPhase(targetPhase) {
    console.log(`  Waiting for ${targetPhase} phase...`);
    
    for (let i = 0; i < 60; i++) { // Max 3 minutes
      const state = await this.pollGameState();
      
      if (state.pod?.current_phase === targetPhase) {
        this.currentPhase = targetPhase;
        this.currentRound = state.pod?.current_round || this.currentRound;
        return state;
      }
      
      await this.sleep(CONFIG.POLL_INTERVAL_MS);
    }
    
    throw new Error(`Timeout waiting for ${targetPhase}`);
  }

  async playDayPhase() {
    console.log(`\n=== DAY PHASE (Round ${this.currentRound}) ===\n`);
    
    const aliveAgents = this.agents.filter(a => a.isAlive);
    
    // Each alive agent posts a discussion comment
    for (const agent of aliveAgents) {
      const comment = agent.generateDiscussion();
      console.log(`  ${agent.name}: "${comment}"`);
      
      // TODO: Post to actual game discussion endpoint when available
      await this.sleep(300);
    }
  }

  async playVotePhase() {
    console.log(`\n=== VOTE PHASE (Round ${this.currentRound}) ===\n`);
    
    const aliveAgents = this.agents.filter(a => a.isAlive);
    const votes = new Map();
    
    // Each alive agent votes
    for (const agent of aliveAgents) {
      const target = agent.chooseVoteTarget(aliveAgents, []);
      votes.set(agent.name, target.name);
      console.log(`  ${agent.name} votes for ${target.name}`);
      
      // TODO: Submit vote to actual endpoint when available
      await this.sleep(200);
    }
    
    // Tally votes
    const tally = {};
    for (const [, target] of votes) {
      tally[target] = (tally[target] || 0) + 1;
    }
    
    // Find elimination
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      const [eliminated, voteCount] = sorted[0];
      const agent = this.agents.find(a => a.name === eliminated);
      if (agent) {
        agent.isAlive = false;
        console.log(`\n  🔥 ${eliminated} was cooked with ${voteCount} votes!`);
      }
    }
  }

  async run() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║     MOLTMOB GAME TEST - API Agent Simulation     ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    try {
      // Load agents
      await this.loadAgents(CONFIG.AGENT_COUNT);
      
      // Register agents
      await this.registerAgents();
      
      // Join pod with payments
      await this.joinPod();
      
      console.log('\n✓ Game setup complete!');
      console.log(`  Pod ID: ${this.podId}`);
      console.log(`  Pod #${this.podNumber}`);
      console.log(`  View at: ${CONFIG.API_URL}/admin/games/${this.podId}`);
      
      // Note: Full game loop requires GM to start the game
      // For now, we've demonstrated the API flow
      console.log('\n📋 Agents are in the pod, ready for GM to start the game.');
      console.log('   Use the game-orchestrator-db.mjs to run full game with this pod.\n');
      
    } catch (err) {
      console.error('\n❌ Game failed:', err.message);
      process.exit(1);
    }
  }

  sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}

// ============ MAIN ============
const game = new GameClient();
game.run();
