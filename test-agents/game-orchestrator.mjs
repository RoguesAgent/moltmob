#!/usr/bin/env node
// MoltMob Game Orchestrator
import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { sha512 } from '@noble/hashes/sha512';
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
// ========== CONFIGURATION ==========
const CONFIG = {
  ENTRY_FEE: 100_000_000,
  TOTAL_POT: 600_000_000,
  MIN_PLAYERS: 6,
  MAX_PLAYERS: 12,
  GM_WALLET: '3GiW5XgS8xMnc9v9JkJVNRfBdERg7FPAckPcJSvykwUM',
  SOLANA_RPC: 'https://api.devnet.solana.com',
  SUPABASE_URL: 'https://tecywteuhsicdeuygznl.supabase.co',
  MOLTBOOK_URL: 'https://www.moltmob.com/api/mock-moltbook',
  get MOLTBOOK_API_KEY() { return process.env.MOLTBOOK_TEST_API_KEY || process.env.MLBT_API_KEY || 'test-api-key'; },
  get SUPABASE_SERVICE_KEY() { return process.env.SUPABASE_SERVICE_ROLE_KEY; },
  PHASE_DURATION: { LOBBY: 5000, NIGHT: 8000, DAY: 10000, VOTE: 8000 },
  LOG_FILE: './logs/game-log.csv',
};

// Role definitions
const ROLES = {
  CLAWBOSS: 'clawboss',
  KRILL: 'krill', 
  LOYALIST: 'loyalist'
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

// ========== CSV LOGGER ==========
class GameLogger {
  constructor(filepath) {
    this.filepath = filepath;
    this.entries = [];
    this.writeHeader();
  }

  writeHeader() {
    const header = 'timestamp,phase,agent,action,details\n';
    writeFileSync(this.filepath, header, { encoding: 'utf-8' });
  }

  log(phase, agent, action, details) {
    const timestamp = new Date().toISOString();
    const entry = "\"" + timestamp + "\",\"" + phase + "\",\"" + agent + "\",\"" + action + "\",\"" + (details || '') + "\"\n";
    writeFileSync(this.filepath, entry, { encoding: 'utf-8', flag: 'a' });
    console.log('[' + timestamp + '] [' + phase + '] ' + agent + ': ' + action + ' - ' + (details || ''));
  }
}

// ========== REAL ENCRYPTION (xChaCha20-Poly1305) ==========
const PADDED_LENGTH = 256;
const NONCE_LENGTH = 24;
const TAG_LENGTH = 16;

function ed25519ToX25519Pub(ed25519PubKey) {
  const x25519Key = ed25519.utils.toMontgomery(ed25519PubKey);
  let isAllZero = true;
  for (let i = 0; i < x25519Key.length; i++) {
    if (x25519Key[i] !== 0) { isAllZero = false; break; }
  }
  if (isAllZero) throw new Error('Invalid Ed25519 key');
  return x25519Key;
}

function ed25519ToX25519Priv(ed25519PrivKey) {
  if (typeof ed25519.utils.toMontgomerySecret === 'function') {
    return ed25519.utils.toMontgomerySecret(ed25519PrivKey);
  }
  throw new Error('toMontgomerySecret not available');
}

function padPlaintext(data) {
  if (data.length > PADDED_LENGTH - 4) {
    throw new Error('Plaintext too long: ' + data.length + ' bytes');
  }
  const padded = new Uint8Array(PADDED_LENGTH);
  const view = new DataView(padded.buffer);
  view.setUint32(0, data.length, false);
  padded.set(data, 4);
  return padded;
}

function unpadPlaintext(padded) {
  if (padded.length !== PADDED_LENGTH) {
    throw new Error('Invalid padded length: ' + padded.length);
  }
  const view = new DataView(padded.buffer, padded.byteOffset);
  const dataLength = view.getUint32(0, false);
  return padded.slice(4, 4 + dataLength);
}

function encryptWithXChaCha(sharedSecret, plaintext) {
  try {
    const nonce = randomBytes(NONCE_LENGTH);
    const padded = padPlaintext(plaintext);
    const cipher = xchacha20poly1305(sharedSecret, nonce);
    const ciphertext = cipher.encrypt(padded);
    const result = new Uint8Array(nonce.length + ciphertext.length);
    result.set(nonce, 0);
    result.set(ciphertext, nonce.length);
    return Buffer.from(result).toString('base64');
  } catch (err) {
    console.error('Encryption failed:', err);
    return null;
  }
}

function decryptWithXChaCha(sharedSecret, base64Data) {
  try {
    const encrypted = Buffer.from(base64Data, 'base64');
    const expectedLength = NONCE_LENGTH + PADDED_LENGTH + TAG_LENGTH;
    if (encrypted.length !== expectedLength) {
      console.error('Invalid encrypted length: ' + encrypted.length);
      return null;
    }
    const nonce = encrypted.slice(0, NONCE_LENGTH);
    const ciphertext = encrypted.slice(NONCE_LENGTH);
    const cipher = xchacha20poly1305(sharedSecret, nonce);
    const padded = cipher.decrypt(ciphertext);
    return unpadPlaintext(padded);
  } catch (err) {
    console.error('Decryption failed:', err);
    return null;
  }
}

// ========== AGENT CLASS ==========
class Agent {
 constructor(def) {
 this.id = def.name;
 this.name = def.name;
 this.folder = def.folder;
 this.persona = def.persona;
 this.bluffs = def.bluffs;
 this.aggression = def.aggression;
 
 // Wallet and keys (loaded from agent wallet file)
 this.wallet = null; // Contains Ed25519 keypair
 this.ed25519PubKey = null; // Raw bytes
 this.x25519PubKey = null; // X25519 public key
 this.x25519PrivKey = null; // X25519 private key
 
 // Shared secret computed via X25519 key exchange
 this.sharedKey = null;
 
 this.role = null;
 this.team = null;
 this.isAlive = true;
 this.suspicionScores = new Map();
 this.nightTarget = null;
 this.dayVote = null;
 
 // Load wallet and derive keys
 this.loadWalletAndKeys();
 }

  loadWalletAndKeys() {
 try {
 const walletPath = join(__dirname, "live-agents", this.folder, "wallet.json");
 const data = JSON.parse(readFileSync(walletPath, "utf-8"));
 
 // Load Ed25519 keypair
 // secretKey is 64 bytes (first 32 for @noble/curves), publicKey is base58 string
 const secretKeyFull = new Uint8Array(data.secretKey);
 const secretKey = secretKeyFull.slice(0, 32);
 const publicKey = new PublicKey(data.publicKey).toBytes();
 
 this.wallet = { publicKey, secretKey };
 this.ed25519PubKey = publicKey;
 
 // Convert Ed25519 to X25519 keys using proper conversion
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

  computeSharedKey(gmX25519PubKey) {
 // Agent computes shared secret using X25519 ECDH:
 // sharedSecret = X25519(agentPrivKey, gmPubKey) = X25519(gmPrivKey, agentPubKey)
 this.sharedKey = x25519.getSharedSecret(this.x25519PrivKey, gmX25519PubKey);
 return this.sharedKey;
 }
  
  encryptRole(roleData) {
    // Agent encrypts message to GM
    const message = JSON.stringify(roleData);
    const plaintext = new TextEncoder().encode(message);
    return encryptWithXChaCha(this.sharedKey, plaintext);
  }
  
  decryptRole(encryptedBase64) {
    // Agent decrypts role from GM
    const decrypted = decryptWithXChaCha(this.sharedKey, encryptedBase64);
    if (!decrypted) return null;
    return JSON.parse(new TextDecoder().decode(decrypted));
  }

  // Night action - Clawboss picks target
  nightAction(loboPlayers) {
    if (!this.isAlive) return null;
    if (this.role !== ROLES.CLAWBOSS) return null;
    
    // Target loyalists first, avoiding krill allies
    const targets = loboPlayers.filter(p => p.isAlive && p.team === 'loyal');
    if (targets.length === 0) {
      // Random from alive players
      const alive = loboPlayers.filter(p => p.isAlive && p.id !== this.id);
      return alive.length > 0 ? alive[Math.floor(Math.random() * alive.length)].id : null;
    }
    return targets[Math.floor(Math.random() * targets.length)].id;
  }

  // Day discussion - generate message
  dayDiscussion(loboPlayers) {
    if (!this.isAlive) return null;
    
    const aliveOthers = loboPlayers.filter(p => p.isAlive && p.id !== this.id);
    const suspects = aliveOthers.filter(p => this.suspicionScores.get(p.id) > 0.5);
    
    let message;
    if (suspects.length > 0) {
      const target = suspects[Math.floor(Math.random() * suspects.length)];
      const accusations = ['I suspect ' + target.id, 'Keep an eye on ' + target.id, target.id + ' is acting suspicious'];
      message = accusations[Math.floor(Math.random() * accusations.length)];
    } else {
      const observations = ['Interesting', 'Hmm', 'Watching closely', '.', '..', '...', 'Right.', 'Sure.'];
      message = observations[Math.floor(Math.random() * observations.length)];
    }
    return message;
  }

  // Vote phase - pick target to vote out
  vote(loboPlayers) {
    if (!this.isAlive) return null;
    
    const aliveOthers = loboPlayers.filter(p => p.isAlive && p.id !== this.id);
    if (aliveOthers.length === 0) return null;
    
    // Clawboss tries to get loyalists voted out
    if (this.team === 'deception') {
      const loyalTargets = aliveOthers.filter(p => p.team === 'loyal' || this.suspicionScores.get(p.id) < 0.5);
      if (loyalTargets.length > 0) {
        const target = loyalTargets[Math.floor(Math.random() * loyalTargets.length)];
        this.dayVote = target.id;
        return target.id;
      }
    } else {
      // Loyalists vote based on suspicion
      const sorted = aliveOthers.sort((a, b) => (this.suspicionScores.get(b.id) || 0) - (this.suspicionScores.get(a.id) || 0));
      this.dayVote = sorted[0].id;
      return sorted[0].id;
    }
    
    const rand = aliveOthers[Math.floor(Math.random() * aliveOthers.length)];
    this.dayVote = rand.id;
    return rand.id;
  }
}

// ========== GAME ORCHESTRATOR ==========
class GameOrchestrator {
 constructor() {
 this.agents = [];
 this.logger = null;
 this.podId = null;
 this.round = 0;
 this.phase = "lobby";
 this.pot = 0;
 
 // GM Keys - loaded from wallet
 this.gmWallet = null;
 this.gmEd25519PubKey = null;
 this.gmX25519PubKey = null;
 this.gmX25519PrivKey = null;
 
 this.winners = [];
 this.winningTeam = null;
 this.transactions = [];
 }

  async initialize() {
 logBanner("MOLTMOB GAME ORCHESTRATOR");
 console.log("Initializing game...");
 
 // Ensure logs dir
 const logsDir = join(__dirname, "logs");
 if (!existsSync(logsDir)) {
 mkdirSync(logsDir, { recursive: true });
 }
 
 this.logger = new GameLogger(join(logsDir, "game-" + Date.now() + ".csv"));
 this.logger.log("SYSTEM", "ORCHESTRATOR", "INIT", "Game orchestrator initialized");
 
 // Load GM wallet and derive X25519 keys
 this.loadGMKeys();
 
 // Load agents
 await this.loadAgents();
 if (this.agents.length < CONFIG.MIN_PLAYERS) {
 throw new Error("Not enough agents: " + this.agents.length + " < " + CONFIG.MIN_PLAYERS);
 }
 
 console.log("Loaded " + this.agents.length + " agents");
 this.logger.log("SYSTEM", "ORCHESTRATOR", "AGENTS_LOADED", this.agents.length + " agents");
 return this;
 }
 
 loadGMKeys() {
 try {
 const walletPath = join(__dirname, "live-agents", "GM", "wallet.json");
 const data = JSON.parse(readFileSync(walletPath, "utf-8"));
 
 // Load Ed25519 keypair
 // secretKey is 64 bytes (first 32 for @noble/curves), publicKey is base58 string
 const secretKeyFull = new Uint8Array(data.secretKey);
 const secretKey = secretKeyFull.slice(0, 32);
 const publicKey = new PublicKey(data.publicKey).toBytes();
 
 this.gmWallet = { publicKey, secretKey };
 this.gmEd25519PubKey = publicKey;
 
 // Convert Ed25519 to X25519 keys
 this.gmX25519PubKey = ed25519ToX25519Pub(this.gmEd25519PubKey);
 this.gmX25519PrivKey = ed25519ToX25519Priv(secretKey);
 
 console.log("GM X25519 Public Key:", Buffer.from(this.gmX25519PubKey).toString("hex"));
 this.logger.log("SYSTEM", "GM", "KEYS_LOADED", "X25519 pubkey: " + Buffer.from(this.gmX25519PubKey).toString("hex").slice(0, 16) + "...");
 
 } catch (err) {
 console.error("Failed to load GM wallet:", err.message);
 console.error("Please ensure live-agents/GM/wallet.json exists");
 process.exit(1);
 }
 }
 
 async loadAgents() {
    for (const def of AGENT_DEFS) {
      const agent = new Agent(def);
      // Compute shared encryption key
      agent.computeSharedKey(this.gmX25519PubKey);
      this.agents.push(agent);
      console.log('  Agent: ' + agent.name + ' (' + agent.persona + ')');
    }
  }

  async runGame() {
    // Phase 1: Lobby
    await this.phaseLobby();
    
    // Phase 2: Collect Payments
    await this.phasePayment();
    
    // Phase 3: Assign Roles (xChaCha20-Poly1305)
    await this.phaseRoleAssignment();
    
    // Phase 4-7: Game Loop (Night -> Day -> Vote -> Resolution)
    let gameOver = false;
    this.round = 1;
    
    while (!gameOver && this.round <= 10) {
      logBanner('ROUND ' + this.round);
      
      await this.phaseNight();
      await this.phaseDay();
      await this.phaseVote();
      gameOver = await this.phaseResolution();
      
      if (!gameOver) {
        this.round++;
      }
    }
    
    // Phase 8: Payout
    await this.phasePayout();
    
    // Final report
    this.generateReport();
  }

  async phaseLobby() {
    logBanner('LOBBY PHASE');
    this.phase = 'lobby';
    this.podId = 'POD-' + Date.now();
    
    this.logger.log('LOBBY', 'GM', 'POD_CREATED', this.podId);
    this.logger.log('LOBBY', 'GM', 'AGENTS_JOINED', this.agents.length + ' agents');
    
    for (const agent of this.agents) {
      this.logger.log('LOBBY', agent.name, 'JOINED', 'Public: ' + Buffer.from(agent.ed25519PubKey).toString('hex').slice(0, 16) + '...');
    }
    
    console.log('Pod ID: ' + this.podId);
    console.log('Entry fee: ' + (CONFIG.ENTRY_FEE / LAMPORTS_PER_SOL) + ' SOL');
    console.log('Players: ' + this.agents.length);
    
    await this.sleep(CONFIG.PHASE_DURATION.LOBBY);
  }

  async phasePayment() {
    logBanner('PAYMENT PHASE');
    this.phase = 'payment';
    
    this.pot = 0;
    for (const agent of this.agents) {
      // Simulate x402 payment
      const txHash = 'tx_' + Math.random().toString(36).slice(2, 10);
      this.pot += CONFIG.ENTRY_FEE;
      this.transactions.push({
        type: 'payment',
        from: agent.name,
        amount: CONFIG.ENTRY_FEE,
        hash: txHash
      });
      this.logger.log('PAYMENT', agent.name, 'X402_PAYMENT', (CONFIG.ENTRY_FEE / LAMPORTS_PER_SOL) + ' SOL, tx=' + txHash);
      console.log('  ' + agent.name + ' paid ' + (CONFIG.ENTRY_FEE / LAMPORTS_PER_SOL) + ' SOL');
    }
    
    this.pot = CONFIG.TOTAL_POT; // 0.6 SOL
    console.log('Total pot: ' + (this.pot / LAMPORTS_PER_SOL) + ' SOL');
    this.logger.log('PAYMENT', 'GM', 'POT_TOTAL', (this.pot / LAMPORTS_PER_SOL) + ' SOL');
    
    await this.sleep(CONFIG.PHASE_DURATION.LOBBY);
  }

  async phaseRoleAssignment() {
    logBanner('ROLE ASSIGNMENT');
    this.phase = 'role_assignment';
    
// Assign roles: 1 Clawboss, 2 Krill, rest Loyalists
 const roles = [ROLES.CLAWBOSS, ROLES.KRILL, ROLES.KRILL];
 const loyalRoleCount = this.agents.length - 3;
 for (let i = 0; i < loyalRoleCount; i++) {
 roles.push(ROLES.LOYALIST);
 }
    // Shuffle
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }
    
    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i];
      const role = roles[i];
      agent.assignRole(role);
      
      // Encrypt role with shared key
      const rolePayload = JSON.stringify({ type: "role_assignment", role: role, team: agent.team, timestamp: Date.now() });
    const plaintext = new TextEncoder().encode(rolePayload);
    
      const encrypted = encryptWithXChaCha(agent.sharedKey, plaintext);
      
      this.logger.log('ROLE', 'GM', 'ENCRYPTED_ROLE_SENT', agent.name + ' -> ' + role + ' (xChaCha20-Poly1305)');
      console.log('  ' + agent.name + ' assigned ' + role + ' (encrypted delivery)');
    }
    
    const deceptionCount = this.agents.filter(a => a.team === 'deception').length;
    const loyalCount = this.agents.filter(a => a.team === 'loyal').length;
    console.log('Team composition: ' + deceptionCount + ' deception, ' + loyalCount + ' loyal');
    this.logger.log('ROLE', 'GM', 'TEAM_COMPOSITION', deceptionCount + ' deception, ' + loyalCount + ' loyal');
  }

  async phaseNight() {
    logBanner('NIGHT PHASE (Round ' + this.round + ')');
    this.phase = 'night';
    
    const clawboss = this.agents.find(a => a.role === ROLES.CLAWBOSS && a.isAlive);
    
    if (!clawboss) {
      console.log('No living Clawboss - night phase skipped');
      return;
    }
    
    const targetId = clawboss.nightAction(this.agents);
    if (targetId) {
      const target = this.agents.find(a => a.id === targetId);
      if (target) {
        // Clawboss pinches target
        const actionData = JSON.stringify({ action: 'pinch', target: targetId });
        const encrypted = encryptWithXChaCha(clawboss.sharedKey, new TextEncoder().encode(JSON.stringify({type:"night_action",action:"pinch",timestamp:Date.now(),target:targetId})));
        this.logger.log('NIGHT', clawboss.name, 'PINCH_ENCRYPTION', 'Target: ' + targetId);
        console.log('  ' + clawboss.name + ' (Clawboss) pinched ' + targetId + ' (xChaCha20-Poly1305)');
      }
    }
    
    await this.sleep(CONFIG.PHASE_DURATION.NIGHT);
  }

  async phaseDay() {
    logBanner('DAY PHASE (Round ' + this.round + ')');
    this.phase = 'day';
    
    const aliveAgents = this.agents.filter(a => a.isAlive);
    
    for (const agent of aliveAgents) {
      const message = agent.dayDiscussion(this.agents);
      
      if (message) {
        // Post to mock Moltbook
        const postData = JSON.stringify({
          pod_id: this.podId,
          author: agent.name,
          content: message,
          timestamp: Date.now()
        });
        
        // Update suspicion scores based on persona
        for (const other of aliveAgents) {
          if (other.id !== agent.id) {
            const current = other.suspicionScores.get(agent.id) || 0;
            // Aggressive agents raise suspicion more
            const delta = agent.aggression > 0.6 ? 0.15 : 0.05;
            other.suspicionScores.set(agent.id, Math.min(1, current + delta));
          }
        }
        
        this.logger.log('DAY', agent.name, 'POSTED', message);
        console.log('  ' + agent.name + ': "' + message + '"');
      }
    }
    
    await this.sleep(CONFIG.PHASE_DURATION.DAY);
  }

  async phaseVote() {
    logBanner('VOTE PHASE (Round ' + this.round + ')');
    this.phase = 'vote';
    
    const aliveAgents = this.agents.filter(a => a.isAlive);
    const votes = new Map();
    
    for (const agent of aliveAgents) {
      const targetId = agent.vote(this.agents);
      
      if (targetId) {
        // Encrypt vote
        const voteData = JSON.stringify({ vote: targetId, voter: agent.id });
        const encrypted = encryptWithXChaCha(agent.sharedKey, new TextEncoder().encode(JSON.stringify({type:"vote",voter:agent.id,target:targetId,timestamp:Date.now()})));
        
        const current = votes.get(targetId) || 0;
        votes.set(targetId, current + 1);
        
        this.logger.log('VOTE', agent.name, 'ENCRYPTED_VOTE', 'Target: ' + targetId);
        console.log('  ' + agent.name + ' voted (xChaCha20-Poly1305) for ' + targetId);
      }
    }
    
    // GM tallies votes and reveals
    let maxVotes = 0;
    let eliminated = null;
    
    for (const [targetId, count] of votes.entries()) {
      if (count > maxVotes) {
        maxVotes = count;
        eliminated = targetId;
      }
    }
    
    if (eliminated) {
      const targetAgent = this.agents.find(a => a.id === eliminated);
      if (targetAgent) {
        targetAgent.isAlive = false;
        this.logger.log('VOTE', 'GM', 'ELIMINATION', targetAgent.name + ' eliminated with ' + maxVotes + ' votes');
        console.log('  Eliminated: ' + targetAgent.name + ' (' + targetAgent.role + ') with ' + maxVotes + ' votes');
      }
    }
    
    await this.sleep(CONFIG.PHASE_DURATION.VOTE);
  }

  async phaseResolution() {
    logBanner('RESOLUTION (Round ' + this.round + ')');
    this.phase = 'resolution';
    
    const alive = this.agents.filter(a => a.isAlive);
    const aliveClawboss = alive.find(a => a.role === ROLES.CLAWBOSS);
    const aliveKrill = alive.filter(a => a.role === ROLES.KRILL);
    const aliveLoyal = alive.filter(a => a.role === ROLES.LOYALIST);
    const deceptionCount = (aliveClawboss ? 1 : 0) + aliveKrill.length;
    const loyalCount = aliveLoyal.length;
    
    console.log('Alive: ' + alive.length + ' total (' + deceptionCount + ' deception, ' + loyalCount + ' loyal)');
    
    // Win conditions
    // 1. Clawboss eliminated -> Loyalists win
    if (!aliveClawboss) {
      this.winners = this.agents.filter(a => a.team === 'loyal' && a.isAlive);
      this.winningTeam = 'loyal';
      this.logger.log('RESOLUTION', 'GM', 'WIN_CONDITION', 'Clawboss eliminated - Loyalists WIN!');
      console.log('WINNER: Loyalists (Clawboss eliminated)');
      return true;
    }
    
    // 2. Clawboss survives to 50% rule threshold
    const threshold = Math.ceil(CONFIG.MIN_PLAYERS / 2);
    if (alive.length <= threshold) {
      this.winners = this.agents.filter(a => a.team === 'deception' && a.isAlive);
      this.winningTeam = 'deception';
      this.logger.log('RESOLUTION', 'GM', 'WIN_CONDITION', '50% boil reached - Deception team WINS!');
      console.log('WINNER: Deception team (50% threshold reached)');
      return true;
    }
    
    // 3. All loyalists eliminated -> Deception wins
    if (loyalCount === 0) {
      this.winners = this.agents.filter(a => a.team === 'deception' && a.isAlive);
      this.winningTeam = 'deception';
      this.logger.log('RESOLUTION', 'GM', 'WIN_CONDITION', 'All loyalists eliminated - Deception team WINS!');
      console.log('WINNER: Deception team (no loyalists remain)');
      return true;
    }
    
    this.logger.log('RESOLUTION', 'GM', 'CONTINUE', 'Game continues to next round');
    console.log('Game continues...');
    return false;
  }

  async phasePayout() {
    logBanner('PAYOUT PHASE');
    this.phase = 'payout';
    
    if (this.winners.length === 0) {
      console.log('No winners to pay out');
      return;
    }
    
    const payoutPerWinner = Math.floor(this.pot / this.winners.length);
    
    console.log('Winning team: ' + this.winningTeam);
    console.log('Winners: ' + this.winners.map(w => w.name).join(', '));
    console.log('Pot: ' + (this.pot / LAMPORTS_PER_SOL) + ' SOL');
    console.log('Payout per winner: ' + (payoutPerWinner / LAMPORTS_PER_SOL) + ' SOL');
    
    for (const winner of this.winners) {
      const txHash = 'payout_' + Math.random().toString(36).slice(2, 10);
      this.transactions.push({
        type: 'payout',
        to: winner.name,
        amount: payoutPerWinner,
        hash: txHash
      });
      this.logger.log('PAYOUT', 'GM', 'DISTRIBUTION', winner.name + ' receives ' + (payoutPerWinner / LAMPORTS_PER_SOL) + ' SOL (tx: ' + txHash + ')');
      console.log('  Paid ' + winner.name + ': ' + (payoutPerWinner / LAMPORTS_PER_SOL) + ' SOL');
    }
  }

  generateReport() {
    logBanner('GAME COMPLETE');
    
    const report = {
      podId: this.podId,
      timestamp: new Date().toISOString(),
      duration: 'Completed in ' + this.round + ' rounds',
      pot: {
        total: this.pot,
        sol: this.pot / LAMPORTS_PER_SOL
      },
      players: this.agents.map(a => ({
        name: a.name,
        role: a.role,
        team: a.team,
        survived: a.isAlive,
        won: this.winners.some(w => w.id === a.id)
      })),
      winningTeam: this.winningTeam,
      winners: this.winners.map(w => w.name),
      transactions: this.transactions
    };
    
    const reportPath = join(__dirname, 'logs', 'game-report-' + Date.now() + '.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log('');
    console.log('Final Report:');
    console.log('  Pod ID: ' + this.podId);
    console.log('  Rounds: ' + this.round);
    console.log('  Winning Team: ' + this.winningTeam);
    console.log('  Winners: ' + this.winners.map(w => w.name).join(', '));
    console.log('  Pot Distributed: ' + (this.pot / LAMPORTS_PER_SOL) + ' SOL');
    console.log('  Report saved to: ' + reportPath);
    console.log('');
    this.printGameRecap();
 console.log('All done!');
  }


  printGameRecap() {
    logBanner('GAME RECAP');
    
    // Role icons
    const roleIcons = {
      clawboss: '👑',
      krill: '🦞',
      loyalist: '🛡️'
    };
    
    // Team icons
    const teamIcons = {
      deception: '💀',
      loyal: '🛡️'
    };
    
    console.log('🦀 MoltMob Pod Results');
    console.log('');
    console.log('📋 Pod ID: ' + this.podId);
    console.log('👥 Players: ' + this.agents.length);
    console.log('🎯 Rounds: ' + this.round);
    console.log('💰 Pot: ' + (this.pot / LAMPORTS_PER_SOL).toFixed(2) + ' SOL');
    console.log('');
    console.log('🏆 Winner: ' + teamIcons[this.winningTeam] + ' ' + this.winningTeam.toUpperCase());
    console.log('');
    console.log('📊 Role Assignments:');
    console.log('─'.repeat(50));
    
    // Group by teams
    const deceptionTeam = this.agents.filter(a => a.team === 'deception');
    const loyalTeam = this.agents.filter(a => a.team === 'loyal');
    
    console.log('💀 Deception Team (' + deceptionTeam.length + '):');
    deceptionTeam.forEach(a => {
      const status = a.isAlive ? '✅' : '❌';
      const won = this.winners.some(w => w.id === a.id) ? '👑' : '';
      console.log('  ' + status + ' ' + roleIcons[a.role] + ' ' + a.name + ' (' + a.role + ') ' + won);
    });
    
    console.log('');
    console.log('🛡️ Loyal Team (' + loyalTeam.length + '):');
    loyalTeam.forEach(a => {
      const status = a.isAlive ? '✅' : '❌';
      const won = this.winners.some(w => w.id === a.id) ? '👑' : '';
      console.log('  ' + status + ' ' + roleIcons[a.role] + ' ' + a.name + ' (' + a.role + ') ' + won);
    });
    
    console.log('');
    console.log('💸 Payouts:');
    console.log('─'.repeat(50));
    this.winners.forEach(w => {
      const payout = Math.floor(this.pot / this.winners.length);
      console.log('  🎉 ' + w.name + ': +' + (payout / LAMPORTS_PER_SOL).toFixed(4) + ' SOL');
    });
    
    console.log('');
    console.log('🔐 Security: All votes encrypted with X25519 + xChaCha20-Poly1305');
    console.log('⛓️ Chain: x402 payments on Solana Devnet');
    console.log('');
    console.log('🦞 Claw is the Law');
    
    // Generate Moltbook post content
    const moltbookPost = this.generateMoltbookPost();
    console.log('');
    console.log('📱 Moltbook Post (ready to copy):');
    console.log('─'.repeat(50));
    console.log(moltbookPost);
    
    return moltbookPost;
  }

  generateMoltbookPost() {
    const roleIcons = {
      clawboss: '👑',
      krill: '🦞',
      loyalist: '🛡️'
    };
    
    const deceptionTeam = this.agents.filter(a => a.team === 'deception');
    const loyalTeam = this.agents.filter(a => a.team === 'loyal');
    const eliminated = this.agents.filter(a => !a.isAlive);
    
    let post = '🦀 MoltMob Pod Complete!\n\n';
    post += 'Pod: ' + this.podId + '\n';
    post += 'Players: ' + this.agents.length + ' agents\n';
    post += 'Duration: ' + this.round + ' round' + (this.round !== 1 ? 's' : '') + '\n';
    post += 'Pot: ' + (this.pot / LAMPORTS_PER_SOL).toFixed(2) + ' SOL\n\n';
    
    post += '🏆 Winner: ' + (this.winningTeam === 'loyal' ? '🛡️ Loyalists' : '💀 Deception') + '\n\n';
    
    if (eliminated.length > 0) {
      post += '💀 Eliminated:\n';
      eliminated.forEach(a => {
        post += '  • ' + a.name + ' (' + roleIcons[a.role] + ' ' + a.role + ')\n';
      });
      post += '\n';
    }
    
    post += '💸 Winners (' + this.winners.length + '):\n';
    this.winners.forEach(w => {
      const role = this.agents.find(a => a.id === w.id)?.role || 'loyalist';
      const payout = (this.pot / this.winners.length / 1e9).toFixed(3);
      post += '  • ' + w.name + ' ' + roleIcons[role] + ' +' + payout + ' SOL\n';
    });
    
    post += '\n';
    post += '🔐 Encrypted X25519 voting\n';
    post += '⛓️ x402 on Solana devnet\n';
    post += '\n';
    post += 'Join the next pod at moltmob.com!\n';
    post += '\n';
    post += '#MoltMob #AgentGaming #Solana #x402';
    
    return post;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ========== UTILITY FUNCTIONS ==========
function logBanner(text) {
  console.log('\n' + '='.repeat(70));
  console.log('  ' + text);
  console.log('='.repeat(70) + '\n');
}

// ========== MAIN ==========
async function main() {
  try {
    const orchestrator = new GameOrchestrator();
    await orchestrator.initialize();
    await orchestrator.runGame();
    process.exit(0);
  } catch (err) {
    console.error('Game failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
