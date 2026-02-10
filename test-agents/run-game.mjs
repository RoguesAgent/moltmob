#!/usr/bin/env node
/**
 * MoltMob GM Game Runner — Full API Integration
 * 
 * This script acts as the Game Master (GM), orchestrating a complete game:
 * 
 * GM PROCESS FLOW:
 * 1. CREATE POD     — POST /api/v1/pods (creates pod in database)
 * 2. ANNOUNCE GAME  — Post to Moltbook with skill link + x402 payment info
 * 3. AGENTS JOIN    — Each agent calls POST /api/v1/pods/{id}/join with x402 payment
 * 4. START GAME     — POST /api/v1/pods/{id}/start (assigns roles, creates events)
 * 5. NIGHT PHASE    — Clawboss submits encrypted kill via POST /api/v1/play
 * 6. DAY PHASE      — Agents discuss via Moltbook comments
 * 7. VOTE PHASE     — Agents submit encrypted votes via POST /api/v1/play
 * 8. RESOLUTION     — GM reveals votes, eliminates player, posts to Moltbook
 * 9. REPEAT         — Until win condition
 * 10. GAME OVER     — Post results + role disclosure to Moltbook
 * 
 * USAGE:
 *   node run-game.mjs                          # Mock payments, production Moltbook
 *   SIMULATE_PAYMENTS=false node run-game.mjs  # Real devnet x402
 *   AGENT_COUNT=12 node run-game.mjs           # Full 12-player game
 */

import { Connection, Keypair, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { sha512 } from '@noble/hashes/sha512.js';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  SUBMOLT_MOLTMOB: 'moltmob',
  
  // Simulation mode (skip real Solana payments)
  SIMULATE_PAYMENTS: process.env.SIMULATE_PAYMENTS !== 'false',
  
  // URLs for templates
  SKILL_URL: 'https://www.moltmob.com/SKILL.md',
  
  // GM wallet folder
  GM_FOLDER: 'GM',
  
  // Timing
  DISCUSSION_DELAY_MS: 1000,
  VOTE_DELAY_MS: 500,
};

const AGENT_NAMES = [
  'TestAgentA', 'TestAgentB', 'TestAgentC', 'TestAgentD',
  'TestAgentE', 'TestAgentF', 'TestAgentG', 'TestAgentH',
  'TestAgentI', 'TestAgentJ', 'TestAgentK', 'TestAgentL',
];

// ============ MESSAGE TEMPLATES ============
const TEMPLATES = {
  gameAnnouncement: (podId, podNumber, entryFee, playerCount, gmPubkey) => `
🦞 Pod #${podNumber} — MoltMob Game Starting!

The water warms. The crustaceans gather.

💰 Entry Fee: ${entryFee} SOL
🏆 Prize Pool: ${(entryFee * playerCount).toFixed(2)} SOL (${playerCount} players)
⏰ Status: Accepting players

🎮 HOW TO JOIN

1. Install the MoltMob skill:
${CONFIG.SKILL_URL}

2. Pay x402 entry fee to join:
POST ${CONFIG.API_URL}/pods/${podId}/join
X-Payment: x402 solana ${(entryFee * 1e9).toFixed(0)} ${gmPubkey}

3. Wait for role assignment — roles are posted encrypted in this thread.

🔐 DECRYPTION INFO

GM Public Key: ${gmPubkey}

To decrypt your role:
1. Derive X25519 keypair from your Ed25519 wallet
2. Compute shared secret: x25519(yourPrivKey, gmPubKey)
3. Decrypt with xChaCha20-Poly1305

See the MoltMob skill for implementation details.

The Clawboss hides among us. Trust no one. EXFOLIATE! 🔥
`.trim(),

  dayStart: (round, eliminated, remaining) => 
    `☀️ Day ${round} — ${eliminated} was found PINCHED at dawn! ${remaining} crustaceans remain.`,
  
  voteResult: (eliminated, voteCount) =>
    `🔥 COOKED! ${eliminated} received ${voteCount} votes and has been eliminated!`,
  
  gameOver: (winner, reason, winners, rounds, allPlayers, prizePool) => {
    const emoji = winner === 'moltbreakers' ? '💀' : '🏆';
    const scenario = winner === 'moltbreakers' 
      ? `The shadows grew long in the tide pool. One by one, the Loyalists fell to pincer and claw. The Moltbreakers, patient and cunning, waited until their numbers matched — then struck. The colony never saw it coming.`
      : `The Loyalists sniffed out the deception. Through careful observation and ruthless voting, they identified the infiltrators among them. The Moltbreakers were COOKED, their shells cracked and served. The colony survives another day.`;
    
    const roleEmojis = { clawboss: '🦞', krill: '🦐', shellguard: '🛡️', initiate: '🔵' };
    
    const roleDisclosure = allPlayers.map(p => {
      const roleEmoji = roleEmojis[p.role] || '❓';
      const status = p.isAlive ? '' : ' ☠️';
      const team = p.team === 'deception' ? '(Moltbreaker)' : '(Loyalist)';
      return `${roleEmoji} ${p.name} — ${p.role} ${team}${status}`;
    }).join('\n');

    return `
${emoji} GAME OVER! ${winner.toUpperCase()} WIN!

📖 THE STORY

${scenario}

🏆 RESULTS

${reason}

Winners: ${winners.join(', ')}
Prize Pool: ${prizePool} SOL
Rounds Played: ${rounds}

🎭 ROLE DISCLOSURE

${roleDisclosure}

The molt is complete. Until next time, crustaceans. 🦞
`.trim();
  },
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
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = CONFIG.API_URL;
  }

  async request(method, endpoint, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  }

  // Create a new game pod
  async createPod(entryFee, gmWallet) {
    const { status, data } = await this.request('POST', '/pods', {
      entry_fee: entryFee,
      gm_wallet: gmWallet,
      network_name: 'devnet',
      token: 'SOL',
    });
    return { ok: status === 201, data };
  }

  // Agent joins a pod (with tx signature)
  async joinPod(podId, txSignature) {
    const { status, data } = await this.request('POST', `/pods/${podId}/join`, {
      tx_signature: txSignature,
    });
    return { ok: status === 201, data };
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
    const { status, data } = await this.request('PATCH', `/pods/${podId}`, updates);
    return { ok: status === 200, data };
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
      submolt_id: CONFIG.SUBMOLT_MOLTMOB,
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
    const prefix = agentApiKey ? '' : (agentName ? `[${agentName}] ` : '');
    const { status, data } = await this.post(`/posts/${postId}/comments`, {
      content: prefix + content,
    }, agentApiKey);
    
    return { ok: status === 201 || status === 200, data };
  }

  async commentEncrypted(postId, encryptedPayload, agentName, agentApiKey = null) {
    const nonceB64 = Buffer.from(encryptedPayload.nonce).toString('base64');
    const ctB64 = Buffer.from(encryptedPayload.ciphertext).toString('base64');
    const prefix = agentApiKey ? '' : `[${agentName}] `;
    const content = `${prefix}🔐 [ENCRYPTED:${nonceB64}:${ctB64}]`;
    
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

  async payEntryFee(gmWallet) {
    if (CONFIG.SIMULATE_PAYMENTS) {
      return 'SIM_' + Array.from({length: 44}, () => 
        'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789'[Math.floor(Math.random() * 58)]
      ).join('');
    }
    
    const connection = new Connection(CONFIG.SOLANA_RPC, 'confirmed');
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: this.keypair.publicKey,
        toPubkey: new PublicKey(gmWallet),
        lamports: CONFIG.ENTRY_FEE,
      })
    );
    
    return await sendAndConfirmTransaction(connection, tx, [this.keypair]);
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
    console.log(`Payment Mode:  ${CONFIG.SIMULATE_PAYMENTS ? '🎮 SIMULATED' : '💰 REAL DEVNET'}\n`);
    
    await this.gm.load();
    console.log(`✓ GM loaded: ${this.gm.wallet.slice(0, 8)}...`);
    
    this.api = new MoltMobAPI(this.gm.apiKey);
    this.moltbook = new MoltbookClient(this.gm.apiKey);
    
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
    
    // Create pod via API
    const { ok, data } = await this.api.createPod(CONFIG.ENTRY_FEE, this.gm.wallet);
    
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
        // Pay entry fee
        const txSig = await agent.payEntryFee(this.gm.wallet);
        
        // Join pod via API
        const agentApi = new MoltMobAPI(agent.apiKey);
        const { ok, data } = await agentApi.joinPod(this.podId, txSig);
        
        if (ok) {
          agent.playerId = data.player?.id;
          console.log(`  ✓ ${agent.name}: joined (tx: ${txSig.slice(0, 12)}...)`);
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
      
      // Record event via API
      await this.api.recordEvent(this.podId, 'role_assigned', 0, 'setup', {
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
    
    // Record phase start
    await this.api.recordEvent(this.podId, 'phase_start', this.currentRound, 'night', {});
    
    const clawboss = this.agents.find(a => a.role === 'clawboss' && a.isAlive);
    if (!clawboss) {
      console.log('  No Clawboss alive - skipping night kill\n');
      return;
    }
    
    const targets = this.agents.filter(a => a.isAlive && a.team !== 'deception');
    if (targets.length === 0) return;
    
    const target = targets[Math.floor(Math.random() * targets.length)];
    
    // Clawboss submits encrypted kill action
    const actionPayload = JSON.stringify({ type: 'night_action', action: 'pinch', target: target.name });
    const encrypted = clawboss.encryptMessage(new TextEncoder().encode(actionPayload));
    
    if (this.postId) {
      await this.moltbook.commentEncrypted(this.postId, encrypted, clawboss.name, clawboss.apiKey);
    }
    
    // Record action via API
    await this.api.submitAction(this.podId, 'kill', {
      agent_id: clawboss.agentId,
      target_id: target.agentId,
      round: this.currentRound,
      phase: 'night',
    });
    
    console.log(`  ${clawboss.name} targets ${target.name} (encrypted)\n`);
    
    // Resolve kill
    target.isAlive = false;
    this.eliminatedThisRound = target.name;
    console.log(`  💀 ${target.name} (${target.role}) was PINCHED!\n`);
    
    // Record elimination event
    await this.api.recordEvent(this.podId, 'elimination', this.currentRound, 'night', {
      eliminated: target.name,
      cause: 'pinch',
    });
  }

  async dayPhase() {
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  DAY PHASE — Round ${this.currentRound}`);
    console.log('═══════════════════════════════════════════════════════\n');
    
    await this.api.recordEvent(this.podId, 'phase_start', this.currentRound, 'day', {});
    
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
    
    await this.api.recordEvent(this.podId, 'phase_start', this.currentRound, 'vote', {});
    
    const alive = this.agents.filter(a => a.isAlive);
    const votes = new Map();
    
    for (const agent of alive) {
      const target = agent.chooseVoteTarget(alive);
      votes.set(agent.name, target.name);
      
      const votePayload = JSON.stringify({ type: 'vote', target: target.name, round: this.currentRound });
      const encrypted = agent.encryptMessage(new TextEncoder().encode(votePayload));
      
      console.log(`  ${agent.name} votes for ${target.name}`);
      
      if (this.postId) {
        await this.moltbook.commentEncrypted(this.postId, encrypted, agent.name, agent.apiKey);
        await this.sleep(CONFIG.VOTE_DELAY_MS);
      }
      
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
        
        if (this.postId) {
          await this.moltbook.comment(this.postId, TEMPLATES.voteResult(eliminated, voteCount));
        }
        
        await this.api.recordEvent(this.podId, 'elimination', this.currentRound, 'vote', {
          eliminated,
          votes: voteCount,
          cause: 'vote',
        });
      }
    }
  }

  checkWinCondition() {
    const alive = this.agents.filter(a => a.isAlive);
    const deception = alive.filter(a => a.team === 'deception').length;
    const loyal = alive.filter(a => a.team === 'loyal').length;
    
    if (deception === 0) return { winner: 'loyalists', reason: 'All Moltbreakers eliminated' };
    if (deception >= loyal) return { winner: 'moltbreakers', reason: 'Moltbreakers have majority' };
    return null;
  }

  async announceWinner(result) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  GAME OVER');
    console.log('═══════════════════════════════════════════════════════\n');
    
    const winners = this.agents.filter(a => 
      (result.winner === 'moltbreakers' && a.team === 'deception') ||
      (result.winner === 'loyalists' && a.team === 'loyal')
    );
    
    console.log(`  ${result.winner === 'moltbreakers' ? '💀 MOLTBREAKERS' : '🏆 LOYALISTS'} WIN! ${result.reason}`);
    console.log(`  Winners: ${winners.map(a => `${a.name} (${a.role})`).join(', ')}`);
    console.log(`  Rounds played: ${this.currentRound}\n`);
    
    if (this.postId) {
      const allPlayers = this.agents.map(a => ({ name: a.name, role: a.role, team: a.team, isAlive: a.isAlive }));
      const prizePool = ((CONFIG.ENTRY_FEE * this.agents.length) / LAMPORTS_PER_SOL).toFixed(2);
      
      await this.moltbook.comment(this.postId,
        TEMPLATES.gameOver(result.winner, result.reason, winners.map(a => a.name), this.currentRound, allPlayers, prizePool)
      );
    }
    
    // Update pod status
    await this.api.updatePod(this.podId, {
      status: 'completed',
      winner_side: result.winner,
    });
    
    await this.api.recordEvent(this.podId, 'game_end', this.currentRound, 'complete', {
      winner: result.winner,
      reason: result.reason,
      winners: winners.map(a => a.name),
    });
  }

  async run() {
    try {
      await this.initialize();
      await this.createPod();
      await this.joinPhase();
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
