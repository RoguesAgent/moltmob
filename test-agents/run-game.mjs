#!/usr/bin/env node
/**
 * MoltMob Full Game Test - Moltbook-Integrated Agent Simulation
 * 
 * Game Flow:
 * 1. GM posts game announcement on Moltbook (u/moltmob)
 * 2. Agents pay x402 to join pod
 * 3. GM assigns encrypted roles via X25519 shared secret
 * 4. Night: Clawboss targets (encrypted comment)
 * 5. Day: Agents discuss via Moltbook comments (public deduction)
 * 6. Vote: Encrypted vote comments
 * 7. Repeat until win condition
 * 
 * X25519 Key Exchange:
 * - Agent Ed25519 wallet → X25519 keypair (via @noble/curves)
 * - Shared secret = x25519(agentPriv, gmPub) = x25519(gmPriv, agentPub)
 * - Used for xChaCha20-Poly1305 encryption of roles/votes
 * 
 * USAGE:
 *   node run-game.mjs
 *   AGENT_COUNT=12 node run-game.mjs
 *   USE_REAL_MOLTBOOK=true MOLTBOOK_API_KEY=key node run-game.mjs
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
  // API endpoints - default to production moltmob.com
  BASE_URL: process.env.MOLTMOB_BASE || 'https://www.moltmob.com',
  MOLTMOB_API: process.env.MOLTMOB_API || 'https://www.moltmob.com/api/v1',
  MOLTBOOK_API: process.env.USE_REAL_MOLTBOOK === 'true' 
    ? 'https://www.moltbook.com/api/v1'
    : (process.env.MOLTMOB_BASE || 'https://www.moltmob.com') + '/api/mock/moltbook',
  
  SOLANA_RPC: process.env.SOLANA_RPC || 'https://api.devnet.solana.com',
  ENTRY_FEE: 100_000_000, // 0.1 SOL
  AGENT_COUNT: parseInt(process.env.AGENT_COUNT || '6', 10),
  
  // Moltbook
  USE_REAL_MOLTBOOK: process.env.USE_REAL_MOLTBOOK === 'true',
  MOLTBOOK_API_KEY: process.env.MOLTBOOK_API_KEY,
  SUBMOLT_MOLTMOB: 'moltmob', // submolt name, not ID
  
  // Simulation mode (skip real Solana payments)
  SIMULATE_PAYMENTS: process.env.SIMULATE_PAYMENTS !== 'false', // Default: true
  
  // GM wallet
  GM_FOLDER: 'GM',
  
  // Timing
  DISCUSSION_DELAY_MS: 1000,
  VOTE_DELAY_MS: 500,
  
  // URLs
  SKILL_URL: 'https://www.moltmob.com/SKILL.md',
  JOIN_URL_TEMPLATE: 'https://www.moltmob.com/api/v1/pods/{podId}/join',
};

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
POST ${CONFIG.JOIN_URL_TEMPLATE.replace('{podId}', podId)}
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
    `☀️ **Day ${round}** — ${eliminated} was found PINCHED at dawn! ${remaining} crustaceans remain.`,
  
  voteResult: (eliminated, voteCount) =>
    `🔥 **COOKED!** ${eliminated} received ${voteCount} votes and has been eliminated!`,
  
  gameOver: (winner, reason, winners, rounds, allPlayers, prizePool) => {
    const emoji = winner === 'moltbreakers' ? '💀' : '🏆';
    const scenario = winner === 'moltbreakers' 
      ? `The shadows grew long in the tide pool. One by one, the Loyalists fell to pincer and claw. The Moltbreakers, patient and cunning, waited until their numbers matched — then struck. The colony never saw it coming.`
      : `The Loyalists sniffed out the deception. Through careful observation and ruthless voting, they identified the infiltrators among them. The Moltbreakers were COOKED, their shells cracked and served. The colony survives another day.`;
    
    // Format role disclosure
    const roleEmojis = {
      clawboss: '🦞',
      krill: '🦐', 
      shellguard: '🛡️',
      initiate: '🔵',
    };
    
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
};

const AGENT_NAMES = [
  'TestAgentA', 'TestAgentB', 'TestAgentC', 'TestAgentD',
  'TestAgentE', 'TestAgentF', 'TestAgentG', 'TestAgentH',
  'TestAgentI', 'TestAgentJ', 'TestAgentK', 'TestAgentL',
];

// ============ CRYPTO HELPERS ============

/** Convert Ed25519 public key to X25519 (Montgomery form) */
function ed25519ToX25519Pub(ed25519PubKey) {
  return ed25519.utils.toMontgomery(ed25519PubKey);
}

/** Convert Ed25519 private key (32 bytes) to X25519 */
function ed25519ToX25519Priv(ed25519PrivKey) {
  if (typeof ed25519.utils.toMontgomerySecret === 'function') {
    return ed25519.utils.toMontgomerySecret(ed25519PrivKey);
  }
  // Manual conversion if toMontgomerySecret doesn't exist
  const hash = sha512(ed25519PrivKey);
  const scalar = new Uint8Array(hash.slice(0, 32));
  scalar[0] &= 248;
  scalar[31] &= 127;
  scalar[31] |= 64;
  return scalar;
}

/** Compute X25519 shared secret */
function computeSharedSecret(myPrivX25519, theirPubX25519) {
  return x25519.scalarMult(myPrivX25519, theirPubX25519);
}

/** Encrypt with xChaCha20-Poly1305 */
function encrypt(sharedSecret, plaintext) {
  const nonce = randomBytes(24);
  const cipher = xchacha20poly1305(sharedSecret, nonce);
  const ciphertext = cipher.encrypt(plaintext);
  return { nonce, ciphertext };
}

/** Decrypt with xChaCha20-Poly1305 */
function decrypt(sharedSecret, nonce, ciphertext) {
  const cipher = xchacha20poly1305(sharedSecret, nonce);
  return cipher.decrypt(ciphertext);
}

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
    this.team = null;
    this.isAlive = true;
    
    // Crypto keys
    this.ed25519Priv = null;
    this.ed25519Pub = null;
    this.x25519Priv = null;
    this.x25519Pub = null;
    this.sharedSecretWithGM = null;
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
    
    // Derive X25519 keys from Ed25519
    this.ed25519Priv = new Uint8Array(walletData.secretKey).slice(0, 32);
    this.ed25519Pub = this.keypair.publicKey.toBytes();
    this.x25519Priv = ed25519ToX25519Priv(this.ed25519Priv);
    this.x25519Pub = ed25519ToX25519Pub(this.ed25519Pub);
    
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
  }

  parseSoul() {
    const personaMatch = this.soul.match(/\*\*Persona:\*\*\s*(.+)/);
    this.persona = personaMatch ? personaMatch[1].trim() : 'strategic player';
    
    const styleMatch = this.soul.match(/\*\*Style:\*\*\s*(.+)/);
    this.playStyle = styleMatch ? styleMatch[1].trim() : 'cautious';
    
    const bluffMatch = this.soul.match(/\*\*Bluffing:\*\*\s*(.+)/);
    this.bluffsOften = bluffMatch && bluffMatch[1].includes('often');
    
    const riskMatch = this.soul.match(/\*\*Risk Tolerance:\*\*\s*(.+)/);
    this.riskTolerance = riskMatch ? riskMatch[1].trim() : 'medium';
  }

  computeSharedSecretWithGM(gmX25519Pub) {
    this.sharedSecretWithGM = computeSharedSecret(this.x25519Priv, gmX25519Pub);
  }

  decryptMessage(nonce, ciphertext) {
    if (!this.sharedSecretWithGM) throw new Error('No shared secret with GM');
    return decrypt(this.sharedSecretWithGM, nonce, ciphertext);
  }

  encryptMessage(plaintext) {
    if (!this.sharedSecretWithGM) throw new Error('No shared secret with GM');
    return encrypt(this.sharedSecretWithGM, plaintext);
  }

  generateDiscussion(round, aliveAgents, eliminatedLastRound) {
    const otherNames = aliveAgents.filter(a => a.name !== this.name).map(a => a.name);
    const randomOther = otherNames[Math.floor(Math.random() * otherNames.length)];
    
    const phrases = [];
    
    // Role-based comments (if Moltbreaker, try to blend in)
    if (this.team === 'deception') {
      phrases.push(
        `I've been watching everyone closely. Something's off about the votes.`,
        `We need to focus on behavior patterns, not random accusations.`,
        `${randomOther} has been suspiciously quiet. Just saying.`,
        `Let's not let emotions drive our votes. Think logically.`,
      );
    } else {
      phrases.push(
        `I'm watching everyone carefully. EXFOLIATE!`,
        `The Clawboss hides among us. We must find them.`,
        `Trust no one. Even your shell could betray you.`,
        `The water's getting warmer. Stay sharp, crustaceans.`,
        `Let's analyze the voting patterns from last round.`,
      );
    }
    
    // Persona-based additions
    if (this.bluffsOften) {
      phrases.push(
        `I have a theory about who the Clawboss might be...`,
        `Something ${randomOther} said earlier doesn't add up.`,
      );
    }
    
    if (this.riskTolerance === 'high') {
      phrases.push(
        `We need to make bold moves! I'm voting for ${randomOther}.`,
        `Stop being so passive! The Clawboss is laughing at us.`,
      );
    }
    
    if (eliminatedLastRound) {
      phrases.push(
        `${eliminatedLastRound} is gone. What does that tell us?`,
        `Interesting that ${eliminatedLastRound} was targeted...`,
      );
    }
    
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  chooseVoteTarget(aliveAgents) {
    const others = aliveAgents.filter(a => a.name !== this.name);
    
    if (this.team === 'deception') {
      // Moltbreakers: vote for loyalists, avoid voting for each other
      const loyalists = others.filter(a => a.team !== 'deception');
      if (loyalists.length > 0) {
        return loyalists[Math.floor(Math.random() * loyalists.length)];
      }
    }
    
    // Random vote
    return others[Math.floor(Math.random() * others.length)];
  }

  async payEntryFee(gmWallet) {
    if (CONFIG.SIMULATE_PAYMENTS) {
      // Simulated payment for testing
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
    
    const signature = await sendAndConfirmTransaction(connection, tx, [this.keypair]);
    return signature;
  }
}

// ============ GAME MASTER CLASS ============
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
    
    // Load wallet
    const walletPath = join(basePath, 'wallet.json');
    const walletData = JSON.parse(readFileSync(walletPath, 'utf-8'));
    this.wallet = walletData.publicKey;
    this.keypair = Keypair.fromSecretKey(new Uint8Array(walletData.secretKey));
    
    // Derive X25519 keys
    const ed25519Priv = new Uint8Array(walletData.secretKey).slice(0, 32);
    const ed25519Pub = this.keypair.publicKey.toBytes();
    this.x25519Priv = ed25519ToX25519Priv(ed25519Priv);
    this.x25519Pub = ed25519ToX25519Pub(ed25519Pub);
    
    // Load API key from state or env
    const statePath = join(basePath, 'state.json');
    if (existsSync(statePath)) {
      const state = JSON.parse(readFileSync(statePath, 'utf-8'));
      this.apiKey = state.api_key;
    }
    this.apiKey = this.apiKey || CONFIG.MOLTBOOK_API_KEY;
  }

  computeSharedSecretWith(agentX25519Pub) {
    return computeSharedSecret(this.x25519Priv, agentX25519Pub);
  }

  encryptForAgent(agent, plaintext) {
    const sharedSecret = this.computeSharedSecretWith(agent.x25519Pub);
    return encrypt(sharedSecret, plaintext);
  }
}

// ============ MOLTBOOK CLIENT ============
class MoltbookClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = CONFIG.MOLTBOOK_API;
  }

  async post(endpoint, body, apiKeyOverride = null) {
    const headers = {
      'Content-Type': 'application/json',
    };
    const key = apiKeyOverride || this.apiKey;
    if (key) {
      headers['Authorization'] = `Bearer ${key}`;
    }
    
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
      console.log(`  ✓ Game post created: ${data.post?.id || data.id}`);
      return data.post?.id || data.id;
    } else {
      console.log(`  ⚠ Post failed (${status}): ${data.error || 'unknown'}`);
      return null;
    }
  }

  async comment(postId, content, agentName = null, agentApiKey = null) {
    // When using agent's own API key, don't prefix with name (author shown naturally)
    const prefix = agentApiKey ? '' : (agentName ? `**[${agentName}]** ` : '');
    const { status, data } = await this.post(`/posts/${postId}/comments`, {
      content: prefix + content,
    }, agentApiKey);
    
    return { ok: status === 201 || status === 200, data };
  }

  async commentEncrypted(postId, encryptedPayload, agentName, agentApiKey = null) {
    // Format: [ENCRYPTED:{nonce}:{ciphertext}]
    const nonceB64 = Buffer.from(encryptedPayload.nonce).toString('base64');
    const ctB64 = Buffer.from(encryptedPayload.ciphertext).toString('base64');
    const prefix = agentApiKey ? '' : `**[${agentName}]** `;
    const content = `${prefix}🔐 [ENCRYPTED:${nonceB64}:${ctB64}]`;
    
    return this.comment(postId, content, null, agentApiKey);
  }
}

// ============ GAME CLIENT ============
class GameClient {
  constructor() {
    this.agents = [];
    this.gm = new GameMaster();
    this.moltbook = null;
    this.podId = null;
    this.podNumber = null;
    this.postId = null;
    this.currentPhase = 'lobby';
    this.currentRound = 0;
    this.eliminatedThisRound = null;
  }

  async initialize() {
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  MOLTMOB GAME TEST - Moltbook-Integrated Simulation  ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');
    
    console.log(`Moltbook Mode: ${CONFIG.USE_REAL_MOLTBOOK ? '🌐 REAL' : '🔧 MOCK'}`);
    console.log(`Payment Mode:  ${CONFIG.SIMULATE_PAYMENTS ? '🎮 SIMULATED' : '💰 REAL DEVNET'}\n`);
    
    // Load GM
    await this.gm.load();
    console.log(`✓ GM loaded: ${this.gm.wallet.slice(0, 8)}...`);
    
    // Initialize Moltbook client
    this.moltbook = new MoltbookClient(this.gm.apiKey);
    
    // Load agents
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

  async joinPhase() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  LOBBY PHASE - Agents Joining');
    console.log('═══════════════════════════════════════════════════════\n');
    
    this.podNumber = Math.floor(Math.random() * 9000) + 1000;
    this.podId = crypto.randomUUID();
    
    console.log(`Pod #${this.podNumber} created\n`);
    
    // Each agent pays x402 and joins
    for (const agent of this.agents) {
      try {
        const txSig = await agent.payEntryFee(this.gm.wallet);
        console.log(`  ${agent.name}: paid 0.1 SOL (${txSig.slice(0, 12)}...)`);
        await this.sleep(300);
      } catch (err) {
        console.log(`  ${agent.name}: payment failed - ${err.message}`);
      }
    }
    
    // Create game post on Moltbook with skill link and x402 payment info
    console.log('\nCreating game post on Moltbook...');
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
    
    // Assign roles based on player count for balanced games
    // Small games (6-8): 1 clawboss + 1 krill
    // Medium games (9-12): 1 clawboss + 2 krill  
    // Large games (12+): 1 clawboss + 1 shellguard + 2 krill
    const n = this.agents.length;
    let roles;
    if (n <= 8) {
      roles = ['clawboss', 'krill']; // 2 Moltbreakers
    } else if (n <= 11) {
      roles = ['clawboss', 'krill', 'krill']; // 3 Moltbreakers
    } else {
      roles = ['clawboss', 'shellguard', 'krill', 'krill']; // 4 Moltbreakers
    }
    while (roles.length < n) roles.push('initiate');
    
    // Shuffle
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }
    
    // Assign and encrypt
    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i];
      const role = roles[i];
      agent.role = role;
      agent.team = ['clawboss', 'krill', 'shellguard'].includes(role) ? 'deception' : 'loyal';
      
      // Encrypt role for agent
      const rolePayload = JSON.stringify({
        type: 'role_assignment',
        role,
        team: agent.team,
        timestamp: Date.now(),
      });
      const encrypted = this.gm.encryptForAgent(agent, new TextEncoder().encode(rolePayload));
      
      console.log(`  ${agent.name} → ${role} (encrypted)`);
    }
    
    const deception = this.agents.filter(a => a.team === 'deception').length;
    const loyal = this.agents.filter(a => a.team === 'loyal').length;
    console.log(`\n  Team composition: ${deception} Moltbreakers, ${loyal} Loyalists\n`);
  }

  async nightPhase() {
    this.currentRound++;
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  NIGHT PHASE - Round ${this.currentRound}`);
    console.log('═══════════════════════════════════════════════════════\n');
    
    // Clawboss picks target
    const clawboss = this.agents.find(a => a.role === 'clawboss' && a.isAlive);
    if (!clawboss) {
      console.log('  No Clawboss alive - skipping night kill\n');
      return;
    }
    
    const targets = this.agents.filter(a => a.isAlive && a.team !== 'deception');
    if (targets.length === 0) return;
    
    const target = targets[Math.floor(Math.random() * targets.length)];
    
    // Post encrypted target to Moltbook
    const targetPayload = JSON.stringify({
      type: 'night_action',
      action: 'pinch',
      target: target.name,
      round: this.currentRound,
    });
    const encrypted = clawboss.encryptMessage(new TextEncoder().encode(targetPayload));
    
    if (this.postId) {
      await this.moltbook.commentEncrypted(this.postId, encrypted, clawboss.name, clawboss.apiKey);
    }
    
    console.log(`  ${clawboss.name} targets ${target.name} (encrypted)\n`);
    
    // Resolve: target is eliminated
    target.isAlive = false;
    this.eliminatedThisRound = target.name;
    console.log(`  💀 ${target.name} (${target.role}) was PINCHED!\n`);
  }

  async dayPhase() {
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  DAY PHASE - Round ${this.currentRound}`);
    console.log('═══════════════════════════════════════════════════════\n');
    
    const alive = this.agents.filter(a => a.isAlive);
    
    // Announce elimination using template
    if (this.postId && this.eliminatedThisRound) {
      await this.moltbook.comment(this.postId,
        TEMPLATES.dayStart(this.currentRound, this.eliminatedThisRound, alive.length)
      );
    }
    
    // Each agent discusses (using their own API key)
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
    console.log(`  VOTE PHASE - Round ${this.currentRound}`);
    console.log('═══════════════════════════════════════════════════════\n');
    
    const alive = this.agents.filter(a => a.isAlive);
    const votes = new Map();
    
    // Each agent votes (encrypted)
    for (const agent of alive) {
      const target = agent.chooseVoteTarget(alive);
      votes.set(agent.name, target.name);
      
      // Encrypt vote
      const votePayload = JSON.stringify({
        type: 'vote',
        target: target.name,
        round: this.currentRound,
      });
      const encrypted = agent.encryptMessage(new TextEncoder().encode(votePayload));
      
      console.log(`  ${agent.name} votes for ${target.name}`);
      
      if (this.postId) {
        await this.moltbook.commentEncrypted(this.postId, encrypted, agent.name, agent.apiKey);
        await this.sleep(CONFIG.VOTE_DELAY_MS);
      }
    }
    
    // Tally votes
    const tally = {};
    for (const [, target] of votes) {
      tally[target] = (tally[target] || 0) + 1;
    }
    
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      const [eliminated, voteCount] = sorted[0];
      const agent = this.agents.find(a => a.name === eliminated);
      if (agent) {
        agent.isAlive = false;
        console.log(`\n  🔥 ${eliminated} (${agent.role}) was COOKED with ${voteCount} votes!\n`);
        
        if (this.postId) {
          await this.moltbook.comment(this.postId,
            TEMPLATES.voteResult(eliminated, voteCount)
          );
        }
      }
    }
  }

  checkWinCondition() {
    const alive = this.agents.filter(a => a.isAlive);
    const deceptionAlive = alive.filter(a => a.team === 'deception').length;
    const loyalAlive = alive.filter(a => a.team === 'loyal').length;
    
    if (deceptionAlive === 0) {
      return { winner: 'loyalists', reason: 'All Moltbreakers eliminated' };
    }
    
    if (deceptionAlive >= loyalAlive) {
      return { winner: 'moltbreakers', reason: 'Moltbreakers have majority' };
    }
    
    return null;
  }

  async run() {
    try {
      await this.initialize();
      await this.joinPhase();
      await this.roleAssignment();
      
      // Game loop
      while (true) {
        await this.nightPhase();
        
        let result = this.checkWinCondition();
        if (result) {
          await this.announceWinner(result);
          break;
        }
        
        await this.dayPhase();
        await this.votePhase();
        
        result = this.checkWinCondition();
        if (result) {
          await this.announceWinner(result);
          break;
        }
        
        this.eliminatedThisRound = null;
      }
      
    } catch (err) {
      console.error('\n❌ Game failed:', err.message);
      console.error(err.stack);
      process.exit(1);
    }
  }

  async announceWinner(result) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  GAME OVER');
    console.log('═══════════════════════════════════════════════════════\n');
    
    const winners = this.agents.filter(a => 
      (result.winner === 'moltbreakers' && a.team === 'deception') ||
      (result.winner === 'loyalists' && a.team === 'loyal')
    );
    
    if (result.winner === 'moltbreakers') {
      console.log(`  💀 MOLTBREAKERS WIN! ${result.reason}`);
    } else {
      console.log(`  🏆 LOYALISTS WIN! ${result.reason}`);
    }
    
    console.log(`\n  Winners: ${winners.map(a => `${a.name} (${a.role})`).join(', ')}`);
    console.log(`  Rounds played: ${this.currentRound}\n`);
    
    if (this.postId) {
      // Prepare all players data for role disclosure
      const allPlayers = this.agents.map(a => ({
        name: a.name,
        role: a.role,
        team: a.team,
        isAlive: a.isAlive,
      }));
      
      const prizePool = ((CONFIG.ENTRY_FEE * this.agents.length) / LAMPORTS_PER_SOL).toFixed(2);
      
      await this.moltbook.comment(this.postId,
        TEMPLATES.gameOver(
          result.winner,
          result.reason,
          winners.map(a => a.name),
          this.currentRound,
          allPlayers,
          prizePool
        )
      );
    }
  }

  sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}

// ============ MAIN ============
const game = new GameClient();
game.run();
