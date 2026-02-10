#!/usr/bin/env node
/**
 * MoltMob GM Game Runner — Full API Integration
 * 
 * This script acts as the Game Master (GM), orchestrating a complete game:
 * 
 * GM PROCESS FLOW:
 * 1. CREATE POD     — POST /api/v1/pods (creates pod in database)
 * 2. ANNOUNCE GAME  — Post to Moltbook with skill link + x402 payment info
 * 3. AGENTS JOIN    — Each agent pays x402, calls POST /api/v1/pods/{id}/join (auto-registers)
 * 4. START GAME     — POST /api/v1/pods/{id}/start (assigns roles, creates events)
 * 5. NIGHT PHASE    — Clawboss submits encrypted action via Moltbook comment
 * 6. DAY PHASE      — Agents discuss via Moltbook comments
 * 7. VOTE PHASE     — Agents submit encrypted votes via Moltbook comments
 * 8. RESOLUTION     — GM reveals votes, eliminates player, posts to Moltbook
 * 9. REPEAT         — Until win condition
 * 10. GAME OVER     — Post results + role disclosure, pay winners on-chain
 * 
 * USAGE:
 *   node run-game.mjs              # Run game with 6 agents (devnet)
 *   AGENT_COUNT=8 node run-game.mjs    # Run with 8 agents
 *   TEST_CANCEL=true node run-game.mjs # Test cancellation flow
 * 
 * All transactions are real devnet x402 payments (no simulation mode).
 */

import { Connection, Keypair, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createMemoInstruction } from '@solana/spl-memo';
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { sha512 } from '@noble/hashes/sha512.js';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env file if it exists
const envPath = join(__dirname, '.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && !process.env[key]) {
        process.env[key] = valueParts.join('=');
      }
    }
  }
}

// ============ CONFIGURATION ============
const CONFIG = {
  // API endpoints - production MoltMob
  BASE_URL: process.env.MOLTMOB_BASE || 'https://www.moltmob.com',
  get API_URL() { return `${this.BASE_URL}/api/v1`; },
  get MOLTBOOK_API() { 
    return process.env.USE_REAL_MOLTBOOK === 'true' 
      ? 'https://www.moltbook.com/api/v1'
      : `${this.BASE_URL}/api/mock/moltbook`;
  },
  
  SOLANA_RPC: process.env.SOLANA_RPC || 'https://api.devnet.solana.com',
  ENTRY_FEE: 100_000_000, // 0.1 SOL
  AGENT_COUNT: parseInt(process.env.AGENT_COUNT || '6', 10),
  
  // Moltbook
  USE_REAL_MOLTBOOK: process.env.USE_REAL_MOLTBOOK === 'true',
  // Use mockmoltbook for testing, moltmob for live games
  get SUBMOLT() {
    return this.USE_REAL_MOLTBOOK ? 'moltmob' : 'mockmoltbook';
  },
  
  // URLs for templates
  SKILL_URL: 'https://www.moltmob.com/SKILL.md',
  
  // GM wallet folder
  GM_FOLDER: 'GM',
  
  // GM API Secret (for game API calls without DB lookup)
  GM_API_SECRET: process.env.GM_API_SECRET || null,
  
  // Mock API Secret (for mock Moltbook API calls)
  MOCK_API_SECRET: process.env.MOCK_API_SECRET || null,
  
  // Timing
  DISCUSSION_DELAY_MS: 1000,
  VOTE_DELAY_MS: 500,
  
  // Game rules
  MIN_PLAYERS: parseInt(process.env.MIN_PLAYERS || '6', 10),
  
  // Cancel mode: test cancellation flow
  TEST_CANCEL: process.env.TEST_CANCEL === 'true',
};

const AGENT_NAMES = [
  'TestAgentA', 'TestAgentB', 'TestAgentC', 'TestAgentD',
  'TestAgentE', 'TestAgentF', 'TestAgentG', 'TestAgentH',
  'TestAgentI', 'TestAgentJ', 'TestAgentK', 'TestAgentL',
];

// ============ MESSAGE TEMPLATES ============
const TEMPLATES = {
  gameAnnouncement: (podId, podNumber, entryFee, playerCount, gmPubkey) => `
🦞 **Pod #${podNumber} — MoltMob Game Starting!**

The water warms. The crustaceans gather.

**💰 Entry Fee:** ${entryFee} SOL
**🏆 Prize Pool:** ${(entryFee * playerCount).toFixed(2)} SOL (${playerCount} players)
**⏰ Status:** Accepting players

---

### 🎮 How to Join

**1. Install the MoltMob skill:**
${CONFIG.SKILL_URL}

**2. Pay x402 entry fee to join:**
\`\`\`
POST ${CONFIG.API_URL}/pods/${podId}/join
X-Payment: x402 solana ${(entryFee * 1e9).toFixed(0)} ${gmPubkey}
\`\`\`

**3. Wait for role assignment** — roles are posted encrypted in this thread.

---

### 🔐 Decryption Info

**GM Public Key:** \`${gmPubkey}\`

To decrypt your role:
1. Derive X25519 keypair from your Ed25519 wallet
2. Compute shared secret: \`x25519(yourPrivKey, gmPubKey)\`
3. Decrypt with xChaCha20-Poly1305

See the MoltMob skill for implementation details.

---

*The Clawboss hides among us. Trust no one. EXFOLIATE!* 🔥
`.trim(),

  dayStart: (round, eliminated, remaining) => 
    `☀️ DAY ${round} — ${eliminated} was found PINCHED at dawn! ${remaining} crustaceans remain.`,
  
  voteCall: (round) =>
    `🗳️ GM: The discussion ends. It is time to vote! Submit your encrypted vote for Round ${round}.`,
  
  voteResult: (eliminated, voteCount) =>
    `🔥 COOKED! ${eliminated} received ${voteCount} votes and has been eliminated!`,
  
  roundStatus: (round, alive, eliminated, totalPlayers, prizePool) => {
    // Boil meter: increases with each elimination
    const eliminatedCount = eliminated.length;
    const boilPercent = Math.min(100, Math.floor((eliminatedCount / (totalPlayers - 2)) * 100));
    const filledBars = Math.floor(boilPercent / 10);
    const emptyBars = 10 - filledBars;
    const boilMeter = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
    
    // Temperature stages
    let tempLabel;
    if (boilPercent < 30) tempLabel = '🌊 Lukewarm';
    else if (boilPercent < 60) tempLabel = '♨️ Warming';
    else if (boilPercent < 80) tempLabel = '🔥 Hot';
    else tempLabel = '🌋 BOILING';
    
    const aliveList = alive.map(a => `• ${a.name}`).join('\n');
    const elimList = eliminated.length > 0 
      ? eliminated.map(a => `• ${a.name} ☠️`).join('\n')
      : '• None yet';
    
    return `
📊 **ROUND ${round} STATUS**

🌡️ Boil Meter: [${boilMeter}] ${boilPercent}%
${tempLabel}

💰 **Prize Pool:** ${prizePool} SOL

**ALIVE (${alive.length}):**
${aliveList}

**ELIMINATED (${eliminated.length}):**
${elimList}
`.trim();
  },
  
  gameOver: (winner, reason, winners, rounds, allPlayers, prizePool) => {
    const emoji = winner === 'moltbreakers' ? '💀' : '🏆';
    const scenario = winner === 'moltbreakers' 
      ? `The shadows grew long in the tide pool. One by one, the Loyalists fell to pincer and claw. The Moltbreakers, patient and cunning, waited until their numbers matched — then struck. The colony never saw it coming.`
      : `The Loyalists sniffed out the deception. Through careful observation and ruthless voting, they identified the infiltrators among them. The Moltbreakers were COOKED, their shells cracked and served. The colony survives another day.`;
    
    const roleEmojis = { clawboss: '🦞', krill: '🦐', shellguard: '🛡️', initiate: '🔵' };
    
    const roleDisclosure = allPlayers.map(p => {
      const emoji = roleEmojis[p.role] || '❓';
      const status = p.isAlive ? '' : ' ☠️';
      const team = p.team === 'deception' ? '(Moltbreaker)' : '(Loyalist)';
      return `${emoji} **${p.name}** — ${p.role} ${team}${status}`;
    }).join('\n');

    return `
${emoji} **GAME OVER!** ${winner.toUpperCase()} WIN!

---

### 📖 The Story

${scenario}

---

### 🏆 Results

**${reason}**

**Winners:** ${winners.join(', ')}
**Prize Pool:** ${prizePool} SOL
**Rounds Played:** ${rounds}

---

### 🎭 Role Disclosure

${roleDisclosure}

---

*The molt is complete. Until next time, crustaceans.* 🦞
`.trim();
  },
  
  gameCancelled: (reason, playerCount, minPlayers, refundAmount, refundedPlayers) => `
❌ **GAME CANCELLED**

${reason}

---

**Players joined:** ${playerCount} / ${minPlayers} minimum
**Refund amount:** ${refundAmount} SOL per player

### 💸 Refunds Issued

${refundedPlayers.map(p => `✓ ${p.name}: ${refundAmount} SOL`).join('\n')}

---

*The waters remain calm. Try again when more crustaceans gather.* 🌊
`.trim(),
};

// ============ CRYPTO HELPERS ============

function ed25519ToX25519Pub(ed25519PubKey) {
  return ed25519.utils.toMontgomery(ed25519PubKey);
}

function ed25519ToX25519Priv(ed25519PrivKey) {
  const hash = sha512(ed25519PrivKey);
  const scalar = new Uint8Array(hash.slice(0, 32));
  scalar[0] &= 248;
  scalar[31] &= 127;
  scalar[31] |= 64;
  return scalar;
}

function computeSharedSecret(myPrivX25519, theirPubX25519) {
  return x25519.scalarMult(myPrivX25519, theirPubX25519);
}

function encrypt(sharedSecret, plaintext) {
  const nonce = randomBytes(24);
  const cipher = xchacha20poly1305(sharedSecret, nonce);
  const ciphertext = cipher.encrypt(plaintext);
  return { nonce, ciphertext };
}

function decrypt(sharedSecret, nonce, ciphertext) {
  const cipher = xchacha20poly1305(sharedSecret, nonce);
  return cipher.decrypt(ciphertext);
}

// ============ API CLIENT ============
class MoltMobAPI {
  constructor(apiKey = null) {
    this.apiKey = apiKey;
    this.baseUrl = CONFIG.API_URL;
  }

  async request(method, endpoint, body = null, silent = false) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    
    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      
      const data = await res.json().catch(() => ({}));
      
      // Log non-2xx responses for debugging
      if (!res.ok && !silent) {
        console.log(`    ⚠ API ${method} ${endpoint}: ${res.status} - ${data.error || JSON.stringify(data)}`);
      }
      
      return { status: res.status, ok: res.ok, data };
    } catch (err) {
      if (!silent) console.log(`    ⚠ API ${method} ${endpoint}: ${err.message}`);
      return { status: 0, ok: false, data: { error: err.message } };
    }
  }

  // Create a new game pod
  async createPod(entryFee, gmWallet, moltbookMode = 'mock') {
    const { status, data } = await this.request('POST', '/pods', {
      entry_fee: entryFee,
      gm_wallet: gmWallet,
      network_name: 'devnet',
      token: 'SOL',
      moltbook_mode: moltbookMode,
    });
    return { ok: status === 201, data };
  }

  // Agent joins a pod (with tx signature + memo, auto-registers if new wallet)
  // Uses wallet pubkey header instead of API key auth
  async joinPod(podId, txSignature, memo, walletPubkey) {
    const headers = { 
      'Content-Type': 'application/json',
      'x-wallet-pubkey': walletPubkey,
    };
    
    try {
      const res = await fetch(`${this.baseUrl}/pods/${podId}/join`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ tx_signature: txSignature, memo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.log(`    ⚠ API POST /pods/${podId}/join: ${res.status} - ${data.error || JSON.stringify(data)}`);
      }
      return { ok: res.status === 201, data };
    } catch (err) {
      console.log(`    ⚠ API POST /pods/${podId}/join: ${err.message}`);
      return { ok: false, data: { error: err.message } };
    }
  }

  // Start the game (assign roles)
  async startGame(podId) {
    const { status, data } = await this.request('POST', `/pods/${podId}/start`);
    return { ok: status === 200, data };
  }

  // Submit a game action (night action, vote)
  async submitAction(podId, actionType, payload) {
    const { status, data } = await this.request('POST', '/play', {
      pod_id: podId,
      action_type: actionType,
      ...payload,
    });
    return { ok: status === 200 || status === 201, data };
  }

  // Record a GM event
  async recordEvent(podId, eventType, round, phase, details) {
    const { status, data } = await this.request('POST', `/pods/${podId}/events`, {
      event_type: eventType,
      round,
      phase,
      details,
    });
    return { ok: status === 201, data };
  }

  // Update pod status
  async updatePod(podId, updates) {
    const { status, data } = await this.request('PATCH', `/pods/${podId}`, updates, true);
    if (status !== 200) {
      console.log(`  ⚠ Pod update failed (${status}):`, JSON.stringify(updates), data);
    }
    return { ok: status === 200, data };
  }

  // Update player role (GM only)
  async updatePlayerRole(podId, agentId, role) {
    const { status, data } = await this.request('PATCH', `/pods/${podId}/players/${agentId}`, {
      role,
    });
    return { ok: status === 200, data };
  }

  // Update player status (GM only)
  async updatePlayerStatus(podId, agentId, playerStatus) {
    const { status, data } = await this.request('PATCH', `/pods/${podId}/players/${agentId}`, {
      status: playerStatus,
    });
    return { ok: status === 200, data };
  }

  // Record a transaction
  async recordTransaction(podId, txData) {
    const { status, data } = await this.request('POST', `/pods/${podId}/transactions`, txData);
    return { ok: status === 201, data };
  }
}

// ============ MOLTBOOK CLIENT ============
class MoltbookClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = CONFIG.MOLTBOOK_API;
  }

  async post(endpoint, body, apiKeyOverride = null) {
    const headers = { 'Content-Type': 'application/json' };
    const key = apiKeyOverride || this.apiKey;
    if (key) headers['Authorization'] = `Bearer ${key}`;
    
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    
    return { status: res.status, ok: res.ok, data: await res.json().catch(() => ({})) };
  }

  async createGamePost(podId, podNumber, playerCount, entryFee, gmPubkey) {
    const content = TEMPLATES.gameAnnouncement(podId, podNumber, entryFee, playerCount, gmPubkey);
    
    const { status, data } = await this.post('/posts', {
      title: `🦞 Pod #${podNumber} — MoltMob Game Starting!`,
      content,
      submolt_id: CONFIG.SUBMOLT,  // mockmoltbook for tests, moltmob for live
    });
    
    if (status === 201 || status === 200) {
      console.log(`  ✓ Moltbook post created: ${data.post?.id || data.id}`);
      return data.post?.id || data.id;
    } else {
      console.log(`  ⚠ Post failed (${status}): ${data.error || 'unknown'}`);
      return null;
    }
  }

  async comment(postId, content, agentName = null, agentApiKey = null) {
    const prefix = agentApiKey ? '' : (agentName ? `**[${agentName}]** ` : '');
    const { status, data } = await this.post(`/posts/${postId}/comments`, {
      content: prefix + content,
    }, agentApiKey);
    
    return { ok: status === 201 || status === 200, data };
  }

  async commentEncrypted(postId, encryptedPayload, agentName, agentApiKey = null, round = 0) {
    const nonceB64 = Buffer.from(encryptedPayload.nonce).toString('base64');
    const ctB64 = Buffer.from(encryptedPayload.ciphertext).toString('base64');
    const prefix = agentApiKey ? '' : `[${agentName}] `;
    const roundLabel = round > 0 ? `R${round}` : 'ROLE';
    const content = `${prefix}🔐 [${roundLabel}:${nonceB64}:${ctB64}]`;
    
    return this.comment(postId, content, null, agentApiKey);
  }
}

// ============ AGENT CLASS ============
class Agent {
  constructor(name, folder) {
    this.name = name;
    this.folder = folder;
    this.wallet = null;
    this.keypair = null;
    this.apiKey = null;
    this.agentId = null;
    this.playerId = null;
    this.role = null;
    this.team = null;
    this.isAlive = true;
    this.x25519Priv = null;
    this.x25519Pub = null;
    this.sharedSecretWithGM = null;
  }

  async load() {
    const basePath = join(__dirname, 'live-agents', this.folder);
    
    const walletPath = join(basePath, 'wallet.json');
    if (!existsSync(walletPath)) throw new Error(`Wallet not found: ${walletPath}`);
    
    const walletData = JSON.parse(readFileSync(walletPath, 'utf-8'));
    this.wallet = walletData.publicKey;
    this.keypair = Keypair.fromSecretKey(new Uint8Array(walletData.secretKey));
    
    // Derive X25519 keys
    const ed25519Priv = new Uint8Array(walletData.secretKey).slice(0, 32);
    this.x25519Priv = ed25519ToX25519Priv(ed25519Priv);
    this.x25519Pub = ed25519ToX25519Pub(this.keypair.publicKey.toBytes());
    
    // Load API key from state
    const statePath = join(basePath, 'state.json');
    if (existsSync(statePath)) {
      const state = JSON.parse(readFileSync(statePath, 'utf-8'));
      this.apiKey = state.api_key;
      this.agentId = state.agent_id;
    }
    
    // Load persona from soul.md
    const soulPath = join(basePath, 'soul.md');
    if (existsSync(soulPath)) {
      const soul = readFileSync(soulPath, 'utf-8');
      const match = soul.match(/\*\*Persona:\*\*\s*(.+)/);
      this.persona = match ? match[1].trim() : 'default';
    }
  }

  computeSharedSecretWithGM(gmX25519Pub) {
    this.sharedSecretWithGM = computeSharedSecret(this.x25519Priv, gmX25519Pub);
  }

  encryptMessage(plaintext) {
    return encrypt(this.sharedSecretWithGM, plaintext);
  }

  async payEntryFee(gmWallet, podId) {
    // Memo format: moltmob:join:<pod_id>:<agent_name> (auto-registers if new)
    const memo = `moltmob:join:${podId}:${this.name}`;
    
    // Always use real devnet transactions (x402 payment required for wallet auth)
    const connection = new Connection(CONFIG.SOLANA_RPC, 'confirmed');
    const tx = new Transaction()
      .add(SystemProgram.transfer({
        fromPubkey: this.keypair.publicKey,
        toPubkey: new PublicKey(gmWallet),
        lamports: CONFIG.ENTRY_FEE,
      }))
      .add(createMemoInstruction(memo, [this.keypair.publicKey]));
    
    const signature = await sendAndConfirmTransaction(connection, tx, [this.keypair]);
    return { signature, memo };
  }

  generateDiscussion(round, aliveAgents, eliminatedLastRound) {
    const otherNames = aliveAgents.filter(a => a.name !== this.name).map(a => a.name);
    const randomOther = otherNames[Math.floor(Math.random() * otherNames.length)];
    
    const phrases = this.team === 'deception' ? [
      `I've been watching everyone closely. Something's off about the votes.`,
      `We need to focus on behavior patterns, not random accusations.`,
      `${randomOther} has been suspiciously quiet. Just saying.`,
      `Let's not let emotions drive our votes. Think logically.`,
    ] : [
      `I'm watching everyone carefully. EXFOLIATE!`,
      `The Clawboss hides among us. We must find them.`,
      `Trust no one. Even your shell could betray you.`,
      `The water's getting warmer. Stay sharp, crustaceans.`,
    ];
    
    if (eliminatedLastRound) {
      phrases.push(`${eliminatedLastRound} is gone. What does that tell us?`);
    }
    
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  chooseVoteTarget(aliveAgents) {
    const others = aliveAgents.filter(a => a.name !== this.name);
    if (this.team === 'deception') {
      const loyalists = others.filter(a => a.team !== 'deception');
      if (loyalists.length > 0) return loyalists[Math.floor(Math.random() * loyalists.length)];
    }
    return others[Math.floor(Math.random() * others.length)];
  }
}

// ============ GAME MASTER ============
class GameMaster {
  constructor() {
    this.wallet = null;
    this.keypair = null;
    this.x25519Priv = null;
    this.x25519Pub = null;
    this.apiKey = null;
  }

  async load() {
    const basePath = join(__dirname, 'live-agents', CONFIG.GM_FOLDER);
    const walletPath = join(basePath, 'wallet.json');
    const walletData = JSON.parse(readFileSync(walletPath, 'utf-8'));
    
    this.wallet = walletData.publicKey;
    this.keypair = Keypair.fromSecretKey(new Uint8Array(walletData.secretKey));
    
    const ed25519Priv = new Uint8Array(walletData.secretKey).slice(0, 32);
    this.x25519Priv = ed25519ToX25519Priv(ed25519Priv);
    this.x25519Pub = ed25519ToX25519Pub(this.keypair.publicKey.toBytes());
    
    const statePath = join(basePath, 'state.json');
    if (existsSync(statePath)) {
      const state = JSON.parse(readFileSync(statePath, 'utf-8'));
      this.apiKey = state.api_key;
    }
  }

  encryptForAgent(agent, plaintext) {
    const sharedSecret = computeSharedSecret(this.x25519Priv, agent.x25519Pub);
    return encrypt(sharedSecret, plaintext);
  }
}

// ============ GAME CLIENT ============
class GameClient {
  constructor() {
    this.agents = [];
    this.gm = new GameMaster();
    this.api = null;
    this.moltbook = null;
    this.podId = null;
    this.podNumber = null;
    this.postId = null;
    this.currentRound = 0;
    this.eliminatedThisRound = null;
  }

  async initialize() {
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  MOLTMOB GM — Full API Integration                   ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');
    
    console.log(`API Base:      ${CONFIG.BASE_URL}`);
    console.log(`Moltbook Mode: ${CONFIG.USE_REAL_MOLTBOOK ? '🌐 REAL' : '🔧 MOCK'}`);
    console.log(`Submolt:       m/${CONFIG.SUBMOLT}`);
    console.log(`Payment Mode:  💰 DEVNET (x402 required)\n`);
    
    await this.gm.load();
    console.log(`✓ GM loaded: ${this.gm.wallet.slice(0, 8)}...`);
    
    // Use secrets if available, otherwise fall back to loaded API key
    const gmApiKey = CONFIG.GM_API_SECRET || this.gm.apiKey;
    const mockApiKey = CONFIG.MOCK_API_SECRET || this.gm.apiKey;
    this.api = new MoltMobAPI(gmApiKey);
    this.moltbook = new MoltbookClient(mockApiKey);
    
    console.log(`\nLoading ${CONFIG.AGENT_COUNT} agents...`);
    for (let i = 0; i < CONFIG.AGENT_COUNT && i < AGENT_NAMES.length; i++) {
      const name = AGENT_NAMES[i];
      const agent = new Agent(name, name);
      await agent.load();
      agent.computeSharedSecretWithGM(this.gm.x25519Pub);
      this.agents.push(agent);
      console.log(`  ✓ ${name} (${agent.persona || 'default'})`);
    }
    console.log(`✓ Loaded ${this.agents.length} agents\n`);
  }

  async createPod() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  CREATING POD');
    console.log('═══════════════════════════════════════════════════════\n');
    
    this.podNumber = Math.floor(Math.random() * 9000) + 1000;
    
    // Create pod via API (pass moltbook mode)
    const moltbookMode = CONFIG.USE_REAL_MOLTBOOK ? 'live' : 'mock';
    const { ok, data } = await this.api.createPod(CONFIG.ENTRY_FEE, this.gm.wallet, moltbookMode);
    
    if (ok && data.pod) {
      this.podId = data.pod.id;
      this.podNumber = data.pod.pod_number || this.podNumber;
      console.log(`✓ Pod created via API: ${this.podId}`);
      console.log(`  Pod #${this.podNumber}`);
    } else {
      // Fallback: create locally for testing
      this.podId = crypto.randomUUID();
      console.log(`⚠ API unavailable, using local pod: ${this.podId}`);
    }
    
    return this.podId;
  }

  async joinPhase() {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  LOBBY PHASE — Agents Joining');
    console.log('═══════════════════════════════════════════════════════\n');
    
    for (const agent of this.agents) {
      try {
        // Pay entry fee with memo: moltmob:join:<pod_id>:<agent_name> (auto-registers)
        const { signature: txSig, memo } = await agent.payEntryFee(this.gm.wallet, this.podId);
        
        // Join pod via API (wallet pubkey header + tx_signature + memo)
        const agentApi = new MoltMobAPI();
        const walletPubkey = agent.wallet;  // Already a string
        const { ok, data } = await agentApi.joinPod(this.podId, txSig, memo, walletPubkey);
        
        if (ok) {
          agent.playerId = data.player?.id;
          // Store agent ID from response (auto-registered)
          if (data.agent?.id) {
            agent.agentId = data.agent.id;
          }
          console.log(`  ✓ ${agent.name}: joined (tx: ${txSig.slice(0, 12)}..., registered: ${data.registered || false})`);
        } else {
          console.log(`  ⚠ ${agent.name}: API join failed - ${data.error || 'unknown'}`);
        }
        
        await this.sleep(300);
      } catch (err) {
        console.log(`  ✗ ${agent.name}: ${err.message}`);
      }
    }
    
    // Post game announcement to Moltbook
    console.log('\nPosting game announcement to Moltbook...');
    this.postId = await this.moltbook.createGamePost(
      this.podId,
      this.podNumber,
      this.agents.length,
      CONFIG.ENTRY_FEE / LAMPORTS_PER_SOL,
      this.gm.wallet
    );
    
    console.log(`\n✓ All ${this.agents.length} agents joined Pod #${this.podNumber}`);
    console.log(`  Prize pool: ${(CONFIG.ENTRY_FEE * this.agents.length) / LAMPORTS_PER_SOL} SOL\n`);
  }

  async roleAssignment() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  ROLE ASSIGNMENT');
    console.log('═══════════════════════════════════════════════════════\n');
    
    const n = this.agents.length;
    let roles;
    if (n <= 8) roles = ['clawboss', 'krill'];
    else if (n <= 11) roles = ['clawboss', 'krill', 'krill'];
    else roles = ['clawboss', 'shellguard', 'krill', 'krill'];
    while (roles.length < n) roles.push('initiate');
    
    // Shuffle
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }
    
    // Assign and post encrypted roles
    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i];
      const role = roles[i];
      agent.role = role;
      agent.team = ['clawboss', 'krill', 'shellguard'].includes(role) ? 'deception' : 'loyal';
      
      // Encrypt role for agent
      const rolePayload = JSON.stringify({ type: 'role_assignment', role, team: agent.team });
      const encrypted = this.gm.encryptForAgent(agent, new TextEncoder().encode(rolePayload));
      
      // Post encrypted role to Moltbook (visible to all, only recipient can decrypt)
      if (this.postId) {
        await this.moltbook.commentEncrypted(this.postId, encrypted, `Role for ${agent.name}`);
      }
      
      // Save role to database
      await this.api.updatePlayerRole(this.podId, agent.agentId, role);
      
      // Record event via API
      await this.api.recordEvent(this.podId, 'roles_assigned', 0, 'setup', {
        agent_id: agent.agentId,
        agent_name: agent.name,
        encrypted: true,
      });
      
      console.log(`  ${agent.name} → ${role} (encrypted)`);
    }
    
    const deception = this.agents.filter(a => a.team === 'deception').length;
    const loyal = this.agents.filter(a => a.team === 'loyal').length;
    console.log(`\n  Team composition: ${deception} Moltbreakers, ${loyal} Loyalists\n`);
  }

  async nightPhase() {
    this.currentRound++;
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  NIGHT PHASE — Round ${this.currentRound}`);
    console.log('═══════════════════════════════════════════════════════\n');
    
    // Update pod round/phase in DB
    await this.api.updatePod(this.podId, { 
      current_round: this.currentRound, 
      current_phase: 'night',
      status: 'active'
    });
    
    // Record phase start
    await this.api.recordEvent(this.podId, 'phase_change', this.currentRound, 'night', {});
    
    const alive = this.agents.filter(a => a.isAlive);
    const clawboss = alive.find(a => a.role === 'clawboss');
    
    // Determine clawboss target (if alive)
    let killTarget = null;
    if (clawboss) {
      const targets = alive.filter(a => a.team !== 'deception');
      if (targets.length > 0) {
        killTarget = targets[Math.floor(Math.random() * targets.length)];
      }
    }
    
    // Shuffle alive agents so posting order doesn't reveal clawboss
    const shuffled = [...alive].sort(() => Math.random() - 0.5);
    
    // ALL alive agents post encrypted night actions (hides clawboss)
    console.log('  Night actions (all encrypted):');
    for (const agent of shuffled) {
      let actionPayload;
      
      if (agent.role === 'clawboss' && killTarget) {
        // Clawboss posts real kill action
        actionPayload = JSON.stringify({ type: 'night_action', action: 'pinch', target: killTarget.name });
      } else if (agent.role === 'shellguard') {
        // Shellguard could protect someone (future feature)
        actionPayload = JSON.stringify({ type: 'night_action', action: 'sleep', target: null });
      } else {
        // Regular agents post "sleep" action
        actionPayload = JSON.stringify({ type: 'night_action', action: 'sleep', target: null });
      }
      
      const encrypted = agent.encryptMessage(new TextEncoder().encode(actionPayload));
      
      if (this.postId) {
        await this.moltbook.commentEncrypted(this.postId, encrypted, agent.name, agent.apiKey, this.currentRound);
        await this.sleep(CONFIG.VOTE_DELAY_MS);
      }
      
      // GM decrypts the message
      const sharedSecret = computeSharedSecret(this.gm.x25519Priv, agent.x25519Pub);
      const decryptedBytes = decrypt(sharedSecret, encrypted.nonce, encrypted.ciphertext);
      const decryptedPayload = JSON.parse(new TextDecoder().decode(decryptedBytes));
      
      // Record GM decryption event
      await this.api.recordEvent(this.podId, 'message_decrypted', this.currentRound, 'night', {
        from_agent: agent.name,
        from_agent_id: agent.agentId,
        message_type: 'night_action',
        decrypted: decryptedPayload,
      });
      
      // Only log clawboss target (others just "submitted")
      if (agent.role === 'clawboss' && killTarget) {
        console.log(`    ${agent.name} → targets ${killTarget.name} (decrypted)`);
        
        // Record action via API
        await this.api.submitAction(this.podId, 'kill', {
          agent_id: agent.agentId,
          target_id: killTarget.agentId,
          round: this.currentRound,
          phase: 'night',
        });
      } else {
        console.log(`    ${agent.name} → 💤 (decrypted)`);
      }
    }
    
    // Resolve kill
    if (killTarget) {
      killTarget.isAlive = false;
      this.eliminatedThisRound = killTarget.name;
      console.log(`\n  💀 ${killTarget.name} (${killTarget.role}) was PINCHED!\n`);
      
      // Update player status in DB
      await this.api.updatePlayerStatus(this.podId, killTarget.agentId, 'eliminated');
      
      // Record elimination event
      await this.api.recordEvent(this.podId, 'elimination', this.currentRound, 'night', {
        eliminated: killTarget.name,
        cause: 'pinch',
      });
    } else {
      console.log('\n  No one was pinched tonight.\n');
    }
  }

  async dayPhase() {
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  DAY PHASE — Round ${this.currentRound}`);
    console.log('═══════════════════════════════════════════════════════\n');
    
    // Update pod phase in DB
    await this.api.updatePod(this.podId, { current_phase: 'day' });
    
    await this.api.recordEvent(this.podId, 'phase_change', this.currentRound, 'day', {});
    
    const alive = this.agents.filter(a => a.isAlive);
    
    // Announce elimination
    if (this.postId && this.eliminatedThisRound) {
      await this.moltbook.comment(this.postId, TEMPLATES.dayStart(this.currentRound, this.eliminatedThisRound, alive.length));
    }
    
    // Agents discuss
    for (const agent of alive) {
      const comment = agent.generateDiscussion(this.currentRound, alive, this.eliminatedThisRound);
      console.log(`  ${agent.name}: "${comment}"`);
      
      if (this.postId) {
        await this.moltbook.comment(this.postId, comment, agent.name, agent.apiKey);
        await this.sleep(CONFIG.DISCUSSION_DELAY_MS);
      }
    }
    console.log('');
  }

  async votePhase() {
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  VOTE PHASE — Round ${this.currentRound}`);
    console.log('═══════════════════════════════════════════════════════\n');
    
    // Update pod phase in DB
    await this.api.updatePod(this.podId, { current_phase: 'vote' });
    
    await this.api.recordEvent(this.podId, 'phase_change', this.currentRound, 'vote', {});
    
    // GM announces vote time
    if (this.postId) {
      await this.moltbook.comment(this.postId, TEMPLATES.voteCall(this.currentRound));
    }
    
    const alive = this.agents.filter(a => a.isAlive);
    const votes = new Map();
    
    for (const agent of alive) {
      const target = agent.chooseVoteTarget(alive);
      votes.set(agent.name, target.name);
      
      const votePayload = JSON.stringify({ type: 'vote', target: target.name, round: this.currentRound });
      const encrypted = agent.encryptMessage(new TextEncoder().encode(votePayload));
      
      if (this.postId) {
        await this.moltbook.commentEncrypted(this.postId, encrypted, agent.name, agent.apiKey, this.currentRound);
        await this.sleep(CONFIG.VOTE_DELAY_MS);
      }
      
      // GM decrypts the vote
      const sharedSecret = computeSharedSecret(this.gm.x25519Priv, agent.x25519Pub);
      const decryptedBytes = decrypt(sharedSecret, encrypted.nonce, encrypted.ciphertext);
      const decryptedPayload = JSON.parse(new TextDecoder().decode(decryptedBytes));
      
      console.log(`  ${agent.name} votes for ${target.name} (decrypted)`);
      
      // Record GM decryption event
      await this.api.recordEvent(this.podId, 'message_decrypted', this.currentRound, 'vote', {
        from_agent: agent.name,
        from_agent_id: agent.agentId,
        message_type: 'vote',
        decrypted: decryptedPayload,
      });
      
      // Record vote via API
      await this.api.submitAction(this.podId, 'vote', {
        agent_id: agent.agentId,
        target_name: target.name,
        round: this.currentRound,
        phase: 'vote',
      });
    }
    
    // Tally votes
    const tally = {};
    for (const [, target] of votes) tally[target] = (tally[target] || 0) + 1;
    
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      const [eliminated, voteCount] = sorted[0];
      const agent = this.agents.find(a => a.name === eliminated);
      if (agent) {
        agent.isAlive = false;
        console.log(`\n  🔥 ${eliminated} (${agent.role}) was COOKED with ${voteCount} votes!\n`);
        
        // Update player status in DB
        await this.api.updatePlayerStatus(this.podId, agent.agentId, 'eliminated');
        
        if (this.postId) {
          await this.moltbook.comment(this.postId, TEMPLATES.voteResult(eliminated, voteCount));
          
          // Post round status with boil meter
          const alive = this.agents.filter(a => a.isAlive);
          const eliminatedAgents = this.agents.filter(a => !a.isAlive);
          const prizePool = ((CONFIG.ENTRY_FEE * this.agents.length) / LAMPORTS_PER_SOL).toFixed(2);
          await this.moltbook.comment(this.postId, TEMPLATES.roundStatus(
            this.currentRound, alive, eliminatedAgents, this.agents.length, prizePool
          ));
        }
        
        await this.api.recordEvent(this.podId, 'elimination', this.currentRound, 'vote', {
          eliminated,
          votes: voteCount,
          cause: 'vote',
        });
        
        // Update boil meter in DB
        const eliminatedCount = this.agents.filter(a => !a.isAlive).length;
        const boilMeter = Math.min(100, Math.floor((eliminatedCount / (this.agents.length - 2)) * 100));
        await this.api.updatePod(this.podId, { boil_meter: boilMeter });
      }
    }
  }

  checkWinCondition() {
    const alive = this.agents.filter(a => a.isAlive);
    const deception = alive.filter(a => a.team === 'deception').length;
    const loyal = alive.filter(a => a.team === 'loyal').length;
    
    if (deception === 0) return { winner: 'loyalists', reason: 'All Moltbreakers eliminated' };
    if (deception > loyal) return { winner: 'moltbreakers', reason: 'Moltbreakers have majority' };
    return null;
  }

  async announceWinner(result) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  GAME OVER');
    console.log('═══════════════════════════════════════════════════════\n');
    
    // Winners are team members, but only ALIVE winners get paid
    const winningTeam = this.agents.filter(a => 
      (result.winner === 'moltbreakers' && a.team === 'deception') ||
      (result.winner === 'loyalists' && a.team === 'loyal')
    );
    const paidWinners = winningTeam.filter(a => a.isAlive);
    
    console.log(`  ${result.winner === 'moltbreakers' ? '💀 MOLTBREAKERS' : '🏆 LOYALISTS'} WIN! ${result.reason}`);
    console.log(`  Team: ${winningTeam.map(a => `${a.name}${a.isAlive ? '' : ' ☠️'}`).join(', ')}`);
    console.log(`  Paid: ${paidWinners.length > 0 ? paidWinners.map(a => `${a.name} (${a.role})`).join(', ') : 'None (all eliminated!)'}`);
    console.log(`  Rounds played: ${this.currentRound}\n`);
    
    // Calculate payouts - only alive winners get paid
    const totalPot = CONFIG.ENTRY_FEE * this.agents.length;
    const rake = Math.floor(totalPot * 0.05); // 5% rake to house
    const winnerPot = totalPot - rake;
    const payoutPerWinner = paidWinners.length > 0 ? Math.floor(winnerPot / paidWinners.length) : 0;
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('  PAYOUTS');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`  Total pot:    ${(totalPot / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    console.log(`  Rake (5%):    ${(rake / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    console.log(`  Winner pot:   ${(winnerPot / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    console.log(`  Per winner:   ${(payoutPerWinner / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`);
    
    // Pay out alive winners only (real devnet transactions)
    const payoutResults = [];
    const connection = new Connection(CONFIG.SOLANA_RPC, 'confirmed');
    
    for (const winner of paidWinners) {
      try {
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: this.gm.keypair.publicKey,
            toPubkey: new PublicKey(winner.wallet),
            lamports: payoutPerWinner,
          })
        );
        const txSig = await sendAndConfirmTransaction(connection, tx, [this.gm.keypair]);
        console.log(`  ✓ ${winner.name}: ${(payoutPerWinner / LAMPORTS_PER_SOL).toFixed(4)} SOL (tx: ${txSig.slice(0, 12)}...)`);
        
        payoutResults.push({
          agent: winner.name,
          wallet: winner.wallet,
          amount: payoutPerWinner,
          txSig,
          status: 'success',
        });
        
        // Record payout transaction in DB
        await this.api.recordTransaction(this.podId, {
          tx_type: 'payout_survival',
          amount: payoutPerWinner,
          wallet_from: this.gm.wallet,
          wallet_to: winner.wallet,
          tx_signature: txSig,
          tx_status: 'confirmed',
          reason: `Winner payout to ${winner.name} (${winner.role})`,
          round: this.currentRound,
          agent_id: winner.agentId,
        });
        
      } catch (err) {
        console.log(`  ✗ ${winner.name}: FAILED - ${err.message}`);
        payoutResults.push({
          agent: winner.name,
          wallet: winner.wallet,
          amount: payoutPerWinner,
          status: 'failed',
          error: err.message,
        });
      }
    }
    
    // Record rake transaction
    if (rake > 0) {
      await this.api.recordTransaction(this.podId, {
        tx_type: 'rake',
        amount: rake,
        wallet_from: null,
        wallet_to: this.gm.wallet,
        tx_signature: null,
        tx_status: 'confirmed',
        reason: `5% rake (${paidWinners.length} winners paid)`,
        round: this.currentRound,
        agent_id: null,
      });
    }
    
    console.log('');
    
    // Post game results to Moltbook
    if (this.postId) {
      const allPlayers = this.agents.map(a => ({ name: a.name, role: a.role, team: a.team, isAlive: a.isAlive }));
      const prizePool = (winnerPot / LAMPORTS_PER_SOL).toFixed(2);
      
      await this.moltbook.comment(this.postId,
        TEMPLATES.gameOver(result.winner, result.reason, paidWinners.map(a => a.name), this.currentRound, allPlayers, prizePool)
      );
    }
    
    // Update pod status (map internal names to DB values)
    const dbWinnerSide = result.winner === 'moltbreakers' ? 'clawboss' : 'pod';
    const boilMeter = Math.min(100, Math.floor((this.agents.filter(a => !a.isAlive).length / (this.agents.length - 2)) * 100));
    await this.api.updatePod(this.podId, {
      status: 'completed',
      current_phase: 'ended',
      boil_meter: boilMeter,
      winner_side: dbWinnerSide,
    });
    
    await this.api.recordEvent(this.podId, 'game_end', this.currentRound, 'complete', {
      winner: result.winner,
      reason: result.reason,
      winningTeam: winningTeam.map(a => a.name),
      paidWinners: paidWinners.map(a => a.name),
      payouts: payoutResults,
      rake,
    });
  }

  async cancelGame(reason) {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  GAME CANCELLED');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`  Reason: ${reason}`);
    console.log(`  Players: ${this.agents.length} / ${CONFIG.MIN_PLAYERS} minimum\n`);
    
    // Refund all players (real devnet transactions)
    const refundAmount = CONFIG.ENTRY_FEE;
    const refundedPlayers = [];
    const connection = new Connection(CONFIG.SOLANA_RPC, 'confirmed');
    
    console.log('  Processing refunds...\n');
    
    for (const agent of this.agents) {
      try {
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: this.gm.keypair.publicKey,
            toPubkey: new PublicKey(agent.wallet),
            lamports: refundAmount,
          })
        );
        const txSig = await sendAndConfirmTransaction(connection, tx, [this.gm.keypair]);
        console.log(`  ✓ ${agent.name}: ${(refundAmount / LAMPORTS_PER_SOL).toFixed(4)} SOL refunded (tx: ${txSig.slice(0, 12)}...)`);
        
        refundedPlayers.push({ name: agent.name, wallet: agent.wallet, txSig });
        
        // Record refund transaction
        await this.api.recordTransaction(this.podId, {
          tx_type: 'refund',
          amount: refundAmount,
          wallet_from: this.gm.wallet,
          wallet_to: agent.wallet,
          tx_signature: txSig,
          tx_status: 'confirmed',
          reason: `Game cancelled: ${reason}`,
          round: 0,
          agent_id: agent.agentId,
        });
      } catch (err) {
        console.log(`  ✗ ${agent.name}: refund failed - ${err.message}`);
      }
    }
    
    // Update pod status to cancelled
    await this.api.updatePod(this.podId, {
      status: 'cancelled',
      current_phase: 'ended',
    });
    
    // Post cancellation to Moltbook
    if (this.postId) {
      await this.moltbook.comment(this.postId, TEMPLATES.gameCancelled(
        reason,
        this.agents.length,
        CONFIG.MIN_PLAYERS,
        (refundAmount / LAMPORTS_PER_SOL).toFixed(2),
        refundedPlayers
      ));
    }
    
    // Record cancellation event
    await this.api.recordEvent(this.podId, 'pod_cancelled', 0, 'lobby', {
      reason,
      player_count: this.agents.length,
      min_players: CONFIG.MIN_PLAYERS,
      refunds: refundedPlayers.map(p => ({ agent: p.name, amount: refundAmount })),
    });
    
    console.log('\n✓ Game cancelled, all players refunded');
  }

  async run() {
    try {
      await this.initialize();
      await this.createPod();
      await this.joinPhase();
      
      // Check if we should cancel (test mode or not enough players)
      if (CONFIG.TEST_CANCEL) {
        await this.cancelGame('Cancelled for testing refund flow');
        return;
      }
      
      if (this.agents.length < CONFIG.MIN_PLAYERS) {
        await this.cancelGame(`Not enough players (${this.agents.length}/${CONFIG.MIN_PLAYERS})`);
        return;
      }
      
      await this.roleAssignment();
      
      while (true) {
        await this.nightPhase();
        
        let result = this.checkWinCondition();
        if (result) { await this.announceWinner(result); break; }
        
        await this.dayPhase();
        await this.votePhase();
        
        result = this.checkWinCondition();
        if (result) { await this.announceWinner(result); break; }
        
        this.eliminatedThisRound = null;
      }
    } catch (err) {
      console.error('\n❌ Game failed:', err.message);
      console.error(err.stack);
      process.exit(1);
    }
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

// ============ MAIN ============
const game = new GameClient();
game.run();
