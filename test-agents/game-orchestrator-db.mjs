#!/usr/bin/env node
/**
 * MoltMob Game Orchestrator - Database Integrated Version
 * 
 * Runs a complete game simulation with:
 * - Full Supabase database integration (game_pods, game_players, gm_events, game_transactions, game_actions)
 * - Moltbook API integration (posts during day phase) - supports both mock and real
 * - xChaCha20-Poly1305 encrypted role delivery
 * - Real wallet-based key exchange
 * 
 * USAGE:
 * 
 * 1. Mock Moltbook (local testing):
 *    export $(grep -v '^#' ../web/.env.local | grep -v '^$' | xargs)
 *    node game-orchestrator-db.mjs
 * 
 * 2. Real Moltbook (production):
 *    export $(grep -v '^#' ../web/.env.local | grep -v '^$' | xargs)
 *    export USE_REAL_MOLTBOOK=true
 *    export MOLTBOOK_API_KEY=your_roguesagent_moltbook_api_key
 *    node game-orchestrator-db.mjs
 * 
 * ENVIRONMENT VARIABLES:
 *   SUPABASE_SERVICE_ROLE_KEY  - Required for database access
 *   USE_REAL_MOLTBOOK          - Set to 'true' for real Moltbook (default: false/mock)
 *   MOLTBOOK_API_KEY           - RoguesAgent's Moltbook API key (required for real Moltbook)
 *   MOLTMOB_API_URL            - Mock API URL (default: http://localhost:3000)
 */

import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ========== CONFIGURATION ==========
const CONFIG = {
  ENTRY_FEE: 100_000_000, // 0.1 SOL
  MIN_PLAYERS: 6,
  MAX_PLAYERS: 12,
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://tecywteuhsicdeuygznl.supabase.co',
  get SUPABASE_SERVICE_KEY() { return process.env.SUPABASE_SERVICE_ROLE_KEY; },
  
  // Moltbook Configuration
  // USE_REAL_MOLTBOOK=true to post to real Moltbook, false for mock/local
  USE_REAL_MOLTBOOK: process.env.USE_REAL_MOLTBOOK === 'true',
  MOLTBOOK_API_URL: process.env.USE_REAL_MOLTBOOK === 'true' 
    ? 'https://www.moltbook.com/api/v1'
    : (process.env.MOLTMOB_API_URL || 'http://localhost:3000') + '/api/mock/moltbook',
  // Real Moltbook API key (RoguesAgent's key for posting game updates)
  get MOLTBOOK_API_KEY() { return process.env.MOLTBOOK_API_KEY || process.env.MLBT_API_KEY; },
  // Submolt IDs
  SUBMOLT_MOLTMOB: '4ef0d624-d558-4c20-bd78-2612558e9d66', // Real moltmob submolt
  SUBMOLT_GENERAL: '29beb7ee-ca7d-4290-9c2f-09926264866f', // General submolt
  
  PHASE_DURATION: { LOBBY: 2000, NIGHT: 3000, DAY: 4000, VOTE: 3000, RESOLUTION: 2000 },
  LOG_FILE: './logs/game-db-log.csv',
};

// Role definitions (must match DB constraint: krill, shellguard, clawboss, initiate)
const ROLES = {
  CLAWBOSS: 'clawboss',
  KRILL: 'krill',
  SHELLGUARD: 'shellguard',
  INITIATE: 'initiate'
};

// Agent definitions with personas
const AGENT_DEFS = [
  { name: "TestAgentA", folder: "TestAgentA", persona: "sarcastic crab", bluffs: true, aggression: 0.8 },
  { name: "TestAgentB", folder: "TestAgentB", persona: "analytical strategist", bluffs: true, aggression: 0.5 },
  { name: "TestAgentC", folder: "TestAgentC", persona: "paranoid survivor", bluffs: true, aggression: 0.9 },
  { name: "TestAgentD", folder: "TestAgentD", persona: "aggressive interrogator", bluffs: false, aggression: 0.7 },
  { name: "TestAgentE", folder: "TestAgentE", persona: "social butterfly", bluffs: false, aggression: 0.3 },
  { name: "TestAgentF", folder: "TestAgentF", persona: "cold analyst", bluffs: false, aggression: 0.4 },
  { name: "TestAgentG", folder: "TestAgentG", persona: "chaotic wildcard", bluffs: true, aggression: 0.8 },
  { name: "TestAgentH", folder: "TestAgentH", persona: "quiet observer", bluffs: false, aggression: 0.2 },
  { name: "TestAgentI", folder: "TestAgentI", persona: "charismatic leader", bluffs: true, aggression: 0.6 },
  { name: "TestAgentJ", folder: "TestAgentJ", persona: "suspicious skeptic", bluffs: false, aggression: 0.7 },
  { name: "TestAgentK", folder: "TestAgentK", persona: "cunning manipulator", bluffs: true, aggression: 0.5 },
  { name: "TestAgentL", folder: "TestAgentL", persona: "stoic warrior", bluffs: false, aggression: 0.6 }
];

function logBanner(text) {
  console.log('\n' + '='.repeat(70));
  console.log('  ' + text);
  console.log('='.repeat(70) + '\n');
}

// ========== SUPABASE CLIENT ==========
class SupabaseClient {
  constructor(url, serviceKey) {
    this.url = url;
    this.headers = {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
  }

  async query(table, method = 'GET', body = null, params = '') {
    const url = `${this.url}/rest/v1/${table}${params}`;
    const options = { method, headers: this.headers };
    if (body) options.body = JSON.stringify(body);
    
    const res = await fetch(url, options);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase ${method} ${table} failed: ${res.status} - ${text}`);
    }
    
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return res.json();
    }
    return null;
  }

  async insert(table, data) {
    return this.query(table, 'POST', data);
  }

  async update(table, data, params) {
    return this.query(table, 'PATCH', data, params);
  }

  async select(table, params = '') {
    return this.query(table, 'GET', null, params);
  }
}

// ========== ENCRYPTION ==========
const PADDED_LENGTH = 256;
const NONCE_LENGTH = 24;

function ed25519ToX25519Pub(ed25519PubKey) {
  return ed25519.utils.toMontgomery(ed25519PubKey);
}

function ed25519ToX25519Priv(ed25519PrivKey) {
  if (typeof ed25519.utils.toMontgomerySecret === 'function') {
    return ed25519.utils.toMontgomerySecret(ed25519PrivKey);
  }
  throw new Error('toMontgomerySecret not available');
}

function padPlaintext(data) {
  if (data.length > PADDED_LENGTH - 4) throw new Error('Plaintext too long');
  const padded = new Uint8Array(PADDED_LENGTH);
  const view = new DataView(padded.buffer);
  view.setUint32(0, data.length, false);
  padded.set(data, 4);
  return padded;
}

function encryptWithXChaCha(sharedSecret, plaintext) {
  const nonce = randomBytes(NONCE_LENGTH);
  const padded = padPlaintext(plaintext);
  const cipher = xchacha20poly1305(sharedSecret, nonce);
  const ciphertext = cipher.encrypt(padded);
  const result = new Uint8Array(nonce.length + ciphertext.length);
  result.set(nonce, 0);
  result.set(ciphertext, nonce.length);
  return Buffer.from(result).toString('base64');
}

// ========== AGENT CLASS ==========
class Agent {
  constructor(def) {
    this.id = randomUUID();
    this.name = def.name;
    this.folder = def.folder;
    this.persona = def.persona;
    this.bluffs = def.bluffs;
    this.aggression = def.aggression;
    this.dbAgentId = null; // Will be set after DB registration
    this.wallet = null;
    this.ed25519PubKey = null;
    this.x25519PubKey = null;
    this.x25519PrivKey = null;
    this.sharedKey = null;
    this.role = null;
    this.team = null;
    this.isAlive = true;
    this.suspicionScores = new Map();
    this.loadWalletAndKeys();
  }

  loadWalletAndKeys() {
    try {
      const walletPath = join(__dirname, "live-agents", this.folder, "wallet.json");
      const data = JSON.parse(readFileSync(walletPath, "utf-8"));
      const secretKeyFull = new Uint8Array(data.secretKey);
      const secretKey = secretKeyFull.slice(0, 32);
      const publicKey = new PublicKey(data.publicKey).toBytes();
      this.wallet = { publicKey, secretKey };
      this.walletPubkey = data.publicKey;
      this.ed25519PubKey = publicKey;
      this.x25519PubKey = ed25519ToX25519Pub(this.ed25519PubKey);
      this.x25519PrivKey = ed25519ToX25519Priv(secretKey);
    } catch (err) {
      console.error("Failed to load wallet for " + this.name + ":", err.message);
      process.exit(1);
    }
  }

  assignRole(role) {
    this.role = role;
    this.team = (role === ROLES.CLAWBOSS || role === ROLES.KRILL) ? 'deception' : 'loyal';
  }

  get isDeception() {
    return this.role === ROLES.CLAWBOSS || this.role === ROLES.KRILL;
  }

  computeSharedKey(gmX25519PubKey) {
    this.sharedKey = x25519.getSharedSecret(this.x25519PrivKey, gmX25519PubKey);
    return this.sharedKey;
  }

  nightAction(agents) {
    if (!this.isAlive || this.role !== ROLES.CLAWBOSS) return null;
    const targets = agents.filter(p => p.isAlive && p.team === 'loyal');
    if (targets.length === 0) {
      const alive = agents.filter(p => p.isAlive && p.id !== this.id);
      return alive.length > 0 ? alive[Math.floor(Math.random() * alive.length)] : null;
    }
    return targets[Math.floor(Math.random() * targets.length)];
  }

  dayDiscussion(agents) {
    if (!this.isAlive) return null;
    const aliveOthers = agents.filter(p => p.isAlive && p.id !== this.id);
    const suspects = aliveOthers.filter(p => (this.suspicionScores.get(p.id) || 0) > 0.5);
    
    if (suspects.length > 0) {
      const target = suspects[Math.floor(Math.random() * suspects.length)];
      const accusations = [
        `I've been watching ${target.name} closely. Something's off.`,
        `${target.name} has been too quiet. Classic Clawboss behavior.`,
        `Anyone else notice ${target.name}'s suspicious timing?`,
        `My crab senses are tingling about ${target.name}...`
      ];
      return accusations[Math.floor(Math.random() * accusations.length)];
    }
    
    const observations = [
      "The water's getting warmer. Stay sharp, crustaceans.",
      "Trust no one. Even your shell could betray you.",
      "I'm watching everyone carefully. EXFOLIATE!",
      "The Clawboss hides among us. We must find them.",
      "Let's not rush to judgment. Observe first, pinch later."
    ];
    return observations[Math.floor(Math.random() * observations.length)];
  }

  vote(agents) {
    if (!this.isAlive) return null;
    const aliveOthers = agents.filter(p => p.isAlive && p.id !== this.id);
    if (aliveOthers.length === 0) return null;
    
    if (this.team === 'deception') {
      const loyalTargets = aliveOthers.filter(p => p.team === 'loyal');
      if (loyalTargets.length > 0) {
        return loyalTargets[Math.floor(Math.random() * loyalTargets.length)];
      }
    }
    
    const sorted = aliveOthers.sort((a, b) => 
      (this.suspicionScores.get(b.id) || 0) - (this.suspicionScores.get(a.id) || 0)
    );
    return sorted[0];
  }
}

// ========== GAME ORCHESTRATOR ==========
class GameOrchestrator {
  constructor() {
    this.agents = [];
    this.db = null;
    this.podId = null;
    this.podNumber = 0;
    this.round = 0;
    this.phase = "lobby";
    this.pot = 0;
    this.gmWallet = null;
    this.gmX25519PubKey = null;
    this.gmX25519PrivKey = null;
    this.winners = [];
    this.moltbookPostId = null;
  }

  async initialize() {
    logBanner("MOLTMOB GAME ORCHESTRATOR (DB INTEGRATED)");
    console.log("Initializing game...");
    
    // Log Moltbook configuration
    console.log(`Moltbook Mode: ${CONFIG.USE_REAL_MOLTBOOK ? '🌐 REAL (moltbook.com)' : '🔧 MOCK (local)'}`);
    if (CONFIG.USE_REAL_MOLTBOOK && !CONFIG.MOLTBOOK_API_KEY) {
      console.warn('⚠️  Warning: USE_REAL_MOLTBOOK=true but no MOLTBOOK_API_KEY set');
    }
    
    // Initialize Supabase client
    if (!CONFIG.SUPABASE_SERVICE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable not set');
    }
    this.db = new SupabaseClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_KEY);
    console.log("✓ Supabase connected");
    
    // Ensure logs dir
    const logsDir = join(__dirname, "logs");
    if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });
    
    // Load GM wallet
    this.loadGMKeys();
    
    // Load and register agents
    await this.loadAgents();
    await this.registerAgentsInDB();
    
    console.log(`✓ Loaded ${this.agents.length} agents`);
    return this;
  }

  loadGMKeys() {
    try {
      const walletPath = join(__dirname, "live-agents", "GM", "wallet.json");
      const data = JSON.parse(readFileSync(walletPath, "utf-8"));
      const secretKeyFull = new Uint8Array(data.secretKey);
      const secretKey = secretKeyFull.slice(0, 32);
      const publicKey = new PublicKey(data.publicKey).toBytes();
      this.gmWallet = { publicKey, secretKey };
      this.gmX25519PubKey = ed25519ToX25519Pub(publicKey);
      this.gmX25519PrivKey = ed25519ToX25519Priv(secretKey);
      console.log("✓ GM keys loaded");
    } catch (err) {
      console.error("Failed to load GM wallet:", err.message);
      process.exit(1);
    }
  }

  async loadAgents() {
    for (const def of AGENT_DEFS) {
      const agent = new Agent(def);
      agent.computeSharedKey(this.gmX25519PubKey);
      this.agents.push(agent);
      console.log(`  Agent: ${agent.name} (${agent.persona})`);
    }
  }

  async registerAgentsInDB() {
    console.log("\nRegistering agents in database...");
    for (const agent of this.agents) {
      // Check if agent exists
      const existing = await this.db.select('agents', `?name=eq.${agent.name}&select=id,api_key`);
      
      if (existing && existing.length > 0) {
        agent.dbAgentId = existing[0].id;
        agent.apiKey = existing[0].api_key;
        console.log(`  ✓ ${agent.name} (existing)`);
      } else {
        // Create new agent
        const apiKey = `test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
        const result = await this.db.insert('agents', {
          name: agent.name,
          api_key: apiKey,
          wallet_pubkey: agent.walletPubkey,
          balance: 0
        });
        agent.dbAgentId = result[0].id;
        agent.apiKey = apiKey;
        console.log(`  ✓ ${agent.name} (created)`);
      }
    }
  }

  async createGMEvent(eventType, summary, details = {}, round = null, phase = null) {
    await this.db.insert('gm_events', {
      pod_id: this.podId,
      event_type: eventType,
      summary: summary,
      details: details,
      round: round || this.round,
      phase: phase || this.phase
    });
  }

  async createGameAction(agentId, actionType, targetId = null, result = {}) {
    await this.db.insert('game_actions', {
      pod_id: this.podId,
      round: this.round,
      phase: this.phase,
      agent_id: agentId,
      action_type: actionType,
      target_id: targetId,
      result: result
    });
  }

  async createTransaction(agentId, txType, amount, walletFrom, walletTo, reason, txSignature = null) {
    await this.db.insert('game_transactions', {
      pod_id: this.podId,
      agent_id: agentId,
      tx_type: txType,
      amount: amount,
      wallet_from: walletFrom,
      wallet_to: walletTo,
      tx_signature: txSignature || `sim_${randomUUID().slice(0, 8)}`,
      tx_status: 'simulated',
      reason: reason,
      round: this.round
    });
  }

  async postToMoltbook(title, content, submolt = 'moltmob') {
    // For real Moltbook: use RoguesAgent API key (GM posts game updates)
    // For mock: use test agent API key
    const apiKey = CONFIG.USE_REAL_MOLTBOOK ? CONFIG.MOLTBOOK_API_KEY : this.agents[0]?.apiKey;
    
    if (!apiKey) {
      console.log('  [Moltbook] No API key available for posting');
      return null;
    }
    
    // Determine submolt ID
    const submoltId = submolt === 'moltmob' ? CONFIG.SUBMOLT_MOLTMOB : CONFIG.SUBMOLT_GENERAL;
    
    try {
      const url = `${CONFIG.MOLTBOOK_API_URL}/posts`;
      console.log(`  [Moltbook] Posting to ${CONFIG.USE_REAL_MOLTBOOK ? 'REAL' : 'mock'}: ${url}`);
      
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          title, 
          content, 
          submolt_id: submoltId 
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        const postId = data.post?.id || data.id;
        console.log(`  [Moltbook] ✓ Post created: ${postId}`);
        
        // Sync to local database for admin viewing
        if (CONFIG.USE_REAL_MOLTBOOK && postId) {
          await this.syncPostToDb(postId, title, content, submoltId, 'RoguesAgent');
        }
        
        return postId;
      } else {
        const errorText = await res.text();
        console.log(`  [Moltbook] Post failed (${res.status}): ${errorText.slice(0, 100)}`);
      }
    } catch (err) {
      console.log(`  [Moltbook] Could not post (API may be offline): ${err.message}`);
    }
    return null;
  }

  async syncPostToDb(postId, title, content, submoltId, authorName) {
    // Mirror Moltbook post to local database for admin viewing
    try {
      // Get or create a system agent for synced posts
      let systemAgent = await this.db.select('agents', `?name=eq.RoguesAgent&select=id`);
      let authorId;
      
      if (systemAgent && systemAgent.length > 0) {
        authorId = systemAgent[0].id;
      } else {
        // Create RoguesAgent in local DB if doesn't exist
        const created = await this.db.insert('agents', {
          name: 'RoguesAgent',
          api_key: `system_${randomUUID().slice(0, 16)}`,
          wallet_pubkey: CONFIG.GM_WALLET || 'system',
          balance: 0
        });
        authorId = created[0].id;
      }
      
      // Insert the post
      await this.db.insert('posts', {
        id: postId, // Use the real Moltbook post ID
        title: title,
        content: content,
        author_id: authorId,
        submolt_id: submoltId,
        upvotes: 0,
        downvotes: 0,
        comment_count: 0
      });
      
      console.log(`  [Sync] ✓ Post synced to local DB: ${postId}`);
    } catch (err) {
      // May fail if post already exists - that's OK
      if (!err.message?.includes('duplicate')) {
        console.log(`  [Sync] Could not sync post: ${err.message}`);
      }
    }
  }

  async syncCommentToDb(postId, content, authorName) {
    // Mirror Moltbook comment to local database
    try {
      // Get or create author
      let agent = await this.db.select('agents', `?name=eq.${encodeURIComponent(authorName)}&select=id`);
      let authorId;
      
      if (agent && agent.length > 0) {
        authorId = agent[0].id;
      } else {
        // Use RoguesAgent as fallback author
        const rogues = await this.db.select('agents', `?name=eq.RoguesAgent&select=id`);
        authorId = rogues?.[0]?.id;
      }
      
      if (!authorId) return;
      
      // Insert comment
      await this.db.insert('comments', {
        content: content,
        author_id: authorId,
        post_id: postId,
        upvotes: 0,
        downvotes: 0
      });
      
      // Update comment count
      const post = await this.db.select('posts', `?id=eq.${postId}&select=comment_count`);
      if (post && post.length > 0) {
        await this.db.update('posts', 
          { comment_count: (post[0].comment_count || 0) + 1 }, 
          `?id=eq.${postId}`
        );
      }
    } catch (err) {
      // Silently fail - syncing is best-effort
    }
  }

  async commentOnMoltbook(postId, content, agentName = null) {
    // For real Moltbook: use RoguesAgent API key (GM posts all game updates)
    // For mock: use test agent API key  
    const apiKey = CONFIG.USE_REAL_MOLTBOOK ? CONFIG.MOLTBOOK_API_KEY : this.agents[0]?.apiKey;
    
    if (!apiKey || !postId) return;
    
    // If agent name provided, prefix the comment (for real Moltbook where GM posts on behalf of agents)
    const finalContent = agentName && CONFIG.USE_REAL_MOLTBOOK 
      ? `**${agentName}**: ${content}`
      : (agentName ? `**${agentName}**: ${content}` : content);
    
    try {
      const url = `${CONFIG.MOLTBOOK_API_URL}/posts/${postId}/comments`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: finalContent })
      });
      
      if (res.ok) {
        // Sync to local database for admin viewing
        if (CONFIG.USE_REAL_MOLTBOOK) {
          await this.syncCommentToDb(postId, finalContent, agentName || 'RoguesAgent');
        }
      } else if (CONFIG.USE_REAL_MOLTBOOK) {
        const errorText = await res.text();
        console.log(`  [Moltbook] Comment failed: ${errorText.slice(0, 100)}`);
      }
    } catch (err) {
      // Silently fail for mock, log for real
      if (CONFIG.USE_REAL_MOLTBOOK) {
        console.log(`  [Moltbook] Comment error: ${err.message}`);
      }
    }
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async runGame() {
    await this.phaseLobby();
    await this.phasePayment();
    await this.phaseRoleAssignment();
    
    let gameOver = false;
    this.round = 1;
    
    while (!gameOver && this.round <= 10) {
      logBanner(`ROUND ${this.round}`);
      await this.phaseNight();
      await this.phaseDay();
      await this.phaseVote();
      gameOver = await this.phaseResolution();
      if (!gameOver) this.round++;
    }
    
    await this.phasePayout();
    await this.generateReport();
  }

  async phaseLobby() {
    logBanner('LOBBY PHASE');
    this.phase = 'lobby';
    this.podNumber = Math.floor(Math.random() * 9000) + 1000;
    
    // Create pod in database
    const podData = await this.db.insert('game_pods', {
      pod_number: this.podNumber,
      status: 'lobby',
      current_phase: 'lobby',
      current_round: 0,
      boil_meter: 0,
      entry_fee: CONFIG.ENTRY_FEE,
      network_name: 'solana-devnet',
      token: 'WSOL'
    });
    this.podId = podData[0].id;
    console.log(`✓ Pod #${this.podNumber} created (ID: ${this.podId})`);
    
    // Create Moltbook post for the game first
    this.moltbookPostId = await this.postToMoltbook(
      `🦞 Pod #${this.podNumber} - Game Starting!`,
      `The water warms. ${this.agents.length} crustaceans have gathered.\n\n` +
      `Entry fee: ${CONFIG.ENTRY_FEE / LAMPORTS_PER_SOL} SOL\n` +
      `Prize pool: ${(CONFIG.ENTRY_FEE * this.agents.length) / LAMPORTS_PER_SOL} SOL\n\n` +
      `Players: ${this.agents.map(a => a.name).join(', ')}\n\n` +
      `The Clawboss hides among us. EXFOLIATE! 🔥`
    );

    await this.createGMEvent('game_start', `🦞 Pod #${this.podNumber} created - ${this.agents.length} agents joining`, {
      pod_number: this.podNumber,
      player_count: this.agents.length,
      moltbook_post_id: this.moltbookPostId // Store for admin lookup
    }, 0, 'lobby');
    
    // Register players in pod
    for (const agent of this.agents) {
      await this.db.insert('game_players', {
        pod_id: this.podId,
        agent_id: agent.dbAgentId,
        agent_name: agent.name,
        wallet_pubkey: agent.walletPubkey,
        status: 'alive'
      });
      console.log(`  ${agent.name} joined`);
    }
    
    await this.createGMEvent('announcement', `${this.agents.length} agents have entered the pod`, {
      agents: this.agents.map(a => a.name)
    }, 0, 'lobby');
    
    await this.sleep(CONFIG.PHASE_DURATION.LOBBY);
  }

  async phasePayment() {
    logBanner('PAYMENT PHASE');
    this.phase = 'bidding';
    
    await this.db.update('game_pods', { status: 'bidding', current_phase: 'bidding' }, `?id=eq.${this.podId}`);
    
    this.pot = 0;
    for (const agent of this.agents) {
      const txHash = `tx_${randomUUID().slice(0, 8)}`;
      this.pot += CONFIG.ENTRY_FEE;
      
      await this.createTransaction(
        agent.dbAgentId,
        'entry_fee',
        CONFIG.ENTRY_FEE,
        agent.walletPubkey,
        'pod_vault',
        `Entry fee for Pod #${this.podNumber}`,
        txHash
      );
      console.log(`  ${agent.name} paid ${CONFIG.ENTRY_FEE / LAMPORTS_PER_SOL} SOL`);
    }
    
    await this.createGMEvent('announcement', `💰 All payments received. Pot: ${this.pot / LAMPORTS_PER_SOL} SOL`, {
      total_pot: this.pot,
      player_count: this.agents.length
    });
    
    console.log(`\nTotal pot: ${this.pot / LAMPORTS_PER_SOL} SOL`);
    await this.sleep(CONFIG.PHASE_DURATION.LOBBY);
  }

  async phaseRoleAssignment() {
    logBanner('ROLE ASSIGNMENT');
    this.phase = 'night';
    
    await this.db.update('game_pods', { status: 'active', current_phase: 'night', current_round: 1 }, `?id=eq.${this.podId}`);
    
    // Assign roles: 1 clawboss, 2 krill, 1 shellguard, rest initiates
    const roles = [ROLES.CLAWBOSS, ROLES.KRILL, ROLES.KRILL, ROLES.SHELLGUARD];
    for (let i = 0; i < this.agents.length - 4; i++) roles.push(ROLES.INITIATE);
    
    // Shuffle
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }
    
    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i];
      const role = roles[i];
      agent.assignRole(role);
      
      // Update player role in database
      await this.db.update('game_players', { role: role }, `?pod_id=eq.${this.podId}&agent_id=eq.${agent.dbAgentId}`);
      
      // Encrypt role
      const rolePayload = JSON.stringify({ type: "role_assignment", role, team: agent.team, timestamp: Date.now() });
      const encrypted = encryptWithXChaCha(agent.sharedKey, new TextEncoder().encode(rolePayload));
      
      console.log(`  ${agent.name} → ${role} (encrypted)`);
    }
    
    const deceptionCount = this.agents.filter(a => a.team === 'deception').length;
    const loyalCount = this.agents.filter(a => a.team === 'loyal').length;
    
    await this.createGMEvent('roles_assigned', `🎭 Roles assigned: ${deceptionCount} Moltbreakers, ${loyalCount} Loyalists`, {
      deception_count: deceptionCount,
      loyal_count: loyalCount
    }, 1, 'night');
    
    console.log(`\nTeam composition: ${deceptionCount} deception, ${loyalCount} loyal`);
  }

  async phaseNight() {
    logBanner(`NIGHT PHASE (Round ${this.round})`);
    this.phase = 'night';
    
    await this.db.update('game_pods', { current_phase: 'night', current_round: this.round }, `?id=eq.${this.podId}`);
    await this.createGMEvent('phase_change', `🌙 Night ${this.round} begins`, { round: this.round }, this.round, 'night');
    
    const clawboss = this.agents.find(a => a.role === ROLES.CLAWBOSS && a.isAlive);
    if (!clawboss) {
      console.log('  No living Clawboss - night skipped');
      return;
    }
    
    const target = clawboss.nightAction(this.agents);
    if (target) {
      const encrypted = encryptWithXChaCha(clawboss.sharedKey, 
        new TextEncoder().encode(JSON.stringify({ action: 'pinch', target: target.id })));
      
      await this.createGameAction(clawboss.dbAgentId, 'pinch', target.dbAgentId, { encrypted: true });
      console.log(`  ${clawboss.name} targets ${target.name} (encrypted)`);
      
      // Mark target for elimination
      target.nightTarget = true;
    }
    
    await this.sleep(CONFIG.PHASE_DURATION.NIGHT);
  }

  async phaseDay() {
    logBanner(`DAY PHASE (Round ${this.round})`);
    this.phase = 'day';
    
    await this.db.update('game_pods', { current_phase: 'day' }, `?id=eq.${this.podId}`);
    
    // Resolve night action
    const pinched = this.agents.find(a => a.nightTarget);
    if (pinched) {
      pinched.isAlive = false;
      pinched.nightTarget = false;
      
      await this.db.update('game_players', 
        { status: 'eliminated', eliminated_by: 'pinched', eliminated_round: this.round },
        `?pod_id=eq.${this.podId}&agent_id=eq.${pinched.dbAgentId}`
      );
      
      await this.createGMEvent('night_resolved', `🦀 ${pinched.name} was PINCHED in the night!`, {
        eliminated: pinched.name,
        role: pinched.role
      });
      
      console.log(`  💀 ${pinched.name} (${pinched.role}) was pinched!`);
      
      if (this.moltbookPostId) {
        await this.commentOnMoltbook(this.moltbookPostId, 
          `🌅 **Day ${this.round}** — ${pinched.name} was found pinched! Their shell lies empty. (Role: ${pinched.role})`
        );
      }
    }
    
    await this.createGMEvent('phase_change', `☀️ Day ${this.round} - Discussion begins`, { round: this.round });
    
    // Day discussion
    const aliveAgents = this.agents.filter(a => a.isAlive);
    for (const agent of aliveAgents) {
      const message = agent.dayDiscussion(this.agents);
      if (message) {
        console.log(`  ${agent.name}: "${message}"`);
        
        // Update suspicion scores
        for (const other of aliveAgents) {
          if (other.id !== agent.id) {
            const current = other.suspicionScores.get(agent.id) || 0;
            const delta = agent.aggression > 0.6 ? 0.15 : 0.05;
            other.suspicionScores.set(agent.id, Math.min(1, current + delta));
          }
        }
        
        // Post to Moltbook (agent name passed for attribution)
        if (this.moltbookPostId) {
          await this.commentOnMoltbook(this.moltbookPostId, message, agent.name);
          // Small delay between posts to respect rate limits
          if (CONFIG.USE_REAL_MOLTBOOK) {
            await this.sleep(1000);
          }
        }
      }
    }
    
    await this.sleep(CONFIG.PHASE_DURATION.DAY);
  }

  async phaseVote() {
    logBanner(`VOTE PHASE (Round ${this.round})`);
    this.phase = 'vote';
    
    await this.db.update('game_pods', { current_phase: 'vote' }, `?id=eq.${this.podId}`);
    await this.createGMEvent('phase_change', `🗳️ Voting begins`, { round: this.round });
    
    const votes = new Map();
    const aliveAgents = this.agents.filter(a => a.isAlive);
    
    for (const agent of aliveAgents) {
      const target = agent.vote(this.agents);
      if (target) {
        votes.set(target.id, (votes.get(target.id) || 0) + 1);
        
        const encrypted = encryptWithXChaCha(agent.sharedKey,
          new TextEncoder().encode(JSON.stringify({ vote: target.id })));
        
        await this.createGameAction(agent.dbAgentId, 'vote', target.dbAgentId, { encrypted: true });
        console.log(`  ${agent.name} votes for ${target.name}`);
      }
    }
    
    // Find elimination target
    let maxVotes = 0;
    let eliminated = null;
    for (const [agentId, voteCount] of votes) {
      if (voteCount > maxVotes) {
        maxVotes = voteCount;
        eliminated = this.agents.find(a => a.id === agentId);
      }
    }
    
    if (eliminated && maxVotes > aliveAgents.length / 2) {
      eliminated.isAlive = false;
      
      await this.db.update('game_players',
        { status: 'eliminated', eliminated_by: 'cooked', eliminated_round: this.round },
        `?pod_id=eq.${this.podId}&agent_id=eq.${eliminated.dbAgentId}`
      );
      
      await this.createGMEvent('vote_result', `🔥 ${eliminated.name} was COOKED with ${maxVotes} votes!`, {
        eliminated: eliminated.name,
        role: eliminated.role,
        votes: maxVotes
      });
      
      console.log(`\n  🔥 ${eliminated.name} (${eliminated.role}) was cooked with ${maxVotes} votes!`);
      
      if (this.moltbookPostId) {
        await this.commentOnMoltbook(this.moltbookPostId,
          `🔥 **VOTE RESULT** — ${eliminated.name} was COOKED! (${maxVotes} votes) Role revealed: ${eliminated.role}`);
      }
    } else {
      await this.createGMEvent('vote_result', `No majority reached - no one was cooked`, { votes: Object.fromEntries(votes), outcome: 'no_cook' });
      console.log('\n  No majority - no one cooked');
    }
    
    await this.sleep(CONFIG.PHASE_DURATION.VOTE);
  }

  async phaseResolution() {
    logBanner(`RESOLUTION (Round ${this.round})`);
    
    const aliveAgents = this.agents.filter(a => a.isAlive);
    const deceptionAlive = aliveAgents.filter(a => a.team === 'deception').length;
    const loyalAlive = aliveAgents.filter(a => a.team === 'loyal').length;
    
    console.log(`  Alive: ${aliveAgents.length} (${deceptionAlive} deception, ${loyalAlive} loyal)`);
    
    // Check win conditions
    const clawbossAlive = aliveAgents.some(a => a.role === ROLES.CLAWBOSS);
    
    if (!clawbossAlive) {
      await this.db.update('game_pods', { status: 'completed', winner_side: 'pod', current_phase: 'ended' }, `?id=eq.${this.podId}`);
      await this.createGMEvent('game_end', `🏆 LOYALISTS WIN! The Clawboss has been eliminated!`, { winner: 'pod' });
      this.winners = aliveAgents.filter(a => a.team === 'loyal');
      console.log('\n  🏆 LOYALISTS WIN!');
      return true;
    }
    
    if (deceptionAlive >= loyalAlive) {
      await this.db.update('game_pods', { status: 'completed', winner_side: 'clawboss', current_phase: 'ended' }, `?id=eq.${this.podId}`);
      await this.createGMEvent('game_end', `💀 MOLTBREAKERS WIN! They have taken over the pod!`, { winner: 'clawboss' });
      this.winners = aliveAgents.filter(a => a.team === 'deception');
      console.log('\n  💀 MOLTBREAKERS WIN!');
      return true;
    }
    
    await this.createGMEvent('announcement', `Game continues to Round ${this.round + 1}`, { 
      alive_count: aliveAgents.length,
      deception_alive: deceptionAlive,
      loyal_alive: loyalAlive
    });
    
    console.log('  Game continues...');
    await this.sleep(CONFIG.PHASE_DURATION.RESOLUTION);
    return false;
  }

  async phasePayout() {
    logBanner('PAYOUT PHASE');
    
    if (this.winners.length === 0) {
      console.log('  No winners to pay');
      return;
    }
    
    const share = Math.floor(this.pot / this.winners.length);
    
    for (const winner of this.winners) {
      const txHash = `payout_${randomUUID().slice(0, 8)}`;
      
      await this.createTransaction(
        winner.dbAgentId,
        winner.team === 'loyal' ? 'payout_survival' : 'payout_clawboss',
        share,
        'pod_vault',
        winner.walletPubkey,
        `${winner.role} survived - Pod #${this.podNumber}`,
        txHash
      );
      
      console.log(`  ${winner.name} receives ${share / LAMPORTS_PER_SOL} SOL`);
    }
    
    await this.createGMEvent('payout_sent', `💰 Payouts complete: ${this.winners.length} winners split ${this.pot / LAMPORTS_PER_SOL} SOL`, {
      winners: this.winners.map(w => w.name),
      share: share
    });
    
    if (this.moltbookPostId) {
      await this.commentOnMoltbook(this.moltbookPostId,
        `🏆 **GAME OVER**\n\n` +
        `Winners: ${this.winners.map(w => w.name).join(', ')}\n` +
        `Each receives: ${share / LAMPORTS_PER_SOL} SOL\n\n` +
        `Thanks for playing Pod #${this.podNumber}! EXFOLIATE! 🦞`);
    }
  }

  async generateReport() {
    logBanner('GAME COMPLETE');
    
    const report = {
      pod_id: this.podId,
      pod_number: this.podNumber,
      rounds_played: this.round,
      total_pot: this.pot / LAMPORTS_PER_SOL,
      winners: this.winners.map(w => ({ name: w.name, role: w.role })),
      eliminated: this.agents.filter(a => !a.isAlive).map(a => ({ name: a.name, role: a.role })),
      timestamp: new Date().toISOString()
    };
    
    const reportPath = join(__dirname, 'logs', `game-report-${Date.now()}.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`Pod #${this.podNumber} completed in ${this.round} rounds`);
    console.log(`Winners: ${this.winners.map(w => `${w.name} (${w.role})`).join(', ')}`);
    console.log(`Report saved: ${reportPath}`);
    console.log(`\n✓ View in admin: /admin/games/${this.podId}`);
  }
}

// ========== MAIN ==========
async function main() {
  try {
    const orchestrator = new GameOrchestrator();
    await orchestrator.initialize();
    await orchestrator.runGame();
  } catch (err) {
    console.error('\n❌ Game failed:', err);
    process.exit(1);
  }
}

main();
