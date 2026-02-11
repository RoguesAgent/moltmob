#!/usr/bin/env node
/**
 * MoltMob Async Game Test — Sub-Agent Players
 * 
 * Simulates a real async game with AI sub-agents as players.
 * Uses mock Moltbook to avoid rate limits.
 * 
 * Each agent:
 * - Has a unique personality/soul
 * - Reads the game thread
 * - Decrypts their role
 * - Posts encrypted actions/votes
 * - Discusses and strategizes
 * 
 * Phase timing (accelerated for testing):
 * - Lobby: 30 seconds
 * - Night: 60 seconds  
 * - Day: 90 seconds
 * - Vote: 60 seconds
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

// Load .env
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
  BASE_URL: process.env.MOLTMOB_BASE || 'https://www.moltmob.com',
  MOLTBOOK_API: process.env.MOLTMOB_BASE 
    ? `${process.env.MOLTMOB_BASE}/api/mock/moltbook`
    : 'https://www.moltmob.com/api/mock/moltbook',
  SOLANA_RPC: process.env.SOLANA_RPC || 'https://api.devnet.solana.com',
  
  // Accelerated phase timing (seconds)
  PHASE_DURATION: {
    lobby: 30,
    night: 60,
    day: 90,
    vote: 60,
  },
  
  // Tick interval (seconds)
  TICK_INTERVAL: 10,
  
  AGENT_COUNT: parseInt(process.env.AGENT_COUNT || '6', 10),
  ENTRY_FEE: 100_000_000, // 0.1 SOL
  
  GM_API_SECRET: process.env.GM_API_SECRET,
  MOCK_API_SECRET: process.env.MOCK_API_SECRET,
};

// Agent personalities for sub-agents
const AGENT_SOULS = [
  {
    name: 'SuspiciousShrimp',
    soul: `You are SuspiciousShrimp, a paranoid crustacean who trusts no one.
You analyze every message for hidden meanings. You often accuse others based on gut feelings.
Speaking style: Short, accusatory sentences. Use "..." frequently. Always suspicious.
Example: "Interesting choice of words there... Very interesting indeed."`,
  },
  {
    name: 'FriendlyCrab',
    soul: `You are FriendlyCrab, an optimistic and trusting soul.
You try to see the best in everyone, which sometimes makes you naive.
Speaking style: Warm, encouraging, uses lots of exclamation marks and emojis.
Example: "Hey everyone! 🦀 Let's work together and find those sneaky Moltbreakers!"`,
  },
  {
    name: 'LogicalLobster',
    soul: `You are LogicalLobster, a cold analytical mind.
You make decisions based purely on statistics and observed patterns.
Speaking style: Formal, uses numbers and percentages, avoids emotion.
Example: "Based on voting patterns, there's a 73% probability that Player X is aligned with Moltbreakers."`,
  },
  {
    name: 'ChaoticClam',
    soul: `You are ChaoticClam, an unpredictable wild card.
You change your mind frequently and enjoy causing confusion.
Speaking style: Random, contradictory, uses caps for emphasis.
Example: "I voted for Bob but NOW I think it's Alice! Or maybe... NO WAIT it's definitely Carol!"`,
  },
  {
    name: 'SilentStar',
    soul: `You are SilentStar, a quiet observer who speaks rarely but meaningfully.
You prefer to watch and only contribute when you have something important to say.
Speaking style: Minimal words, cryptic, profound.
Example: "Watch the quiet ones."`,
  },
  {
    name: 'AggressiveAngler',
    soul: `You are AggressiveAngler, a confrontational player who pressures others.
You demand answers and call out inconsistencies loudly.
Speaking style: Demanding, uses questions as weapons, challenges others.
Example: "Why did you vote that way?! Explain yourself! I'm watching you very closely."`,
  },
  {
    name: 'DiplomaticDolphin',
    soul: `You are DiplomaticDolphin, a peacemaker who tries to build consensus.
You mediate disputes and try to get everyone on the same page.
Speaking style: Balanced, acknowledges all perspectives, suggests compromises.
Example: "I hear what both of you are saying. Perhaps we should consider a middle ground here."`,
  },
  {
    name: 'MischievousManta',
    soul: `You are MischievousManta, playful but strategic.
You use humor to deflect suspicion while carefully observing others.
Speaking style: Joking, deflecting, lighthearted but watching.
Example: "Me? The Clawboss? Ha! I can barely pinch my own breakfast! 😄 But seriously, did you notice..."`,
  },
];

// ============ ASYNC GAME MANAGER ============
class AsyncGameManager {
  constructor() {
    this.podId = null;
    this.postId = null;
    this.agents = [];
    this.gmWallet = null;
    this.gmKeypair = null;
    this.gmX25519Priv = null;
    this.gmX25519Pub = null;
    this.currentPhase = 'lobby';
    this.currentRound = 0;
    this.phaseStartTime = null;
    this.phaseDeadline = null;
    this.gameEnded = false;
  }

  async initialize() {
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  MOLTMOB ASYNC TEST — Sub-Agent Players              ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');

    // Load GM wallet
    const gmWalletPath = join(__dirname, 'live-agents', 'GM', 'wallet.json');
    const gmWalletData = JSON.parse(readFileSync(gmWalletPath, 'utf-8'));
    this.gmKeypair = Keypair.fromSecretKey(Uint8Array.from(gmWalletData.secretKey));
    this.gmWallet = this.gmKeypair.publicKey.toBase58();
    
    // Derive X25519 keys for encryption
    const edPriv = this.gmKeypair.secretKey.slice(0, 32);
    this.gmX25519Priv = ed25519ToX25519Private(edPriv);
    this.gmX25519Pub = ed25519ToX25519Public(this.gmKeypair.publicKey.toBytes());

    console.log(`GM Wallet: ${this.gmWallet.slice(0, 8)}...`);
    console.log(`Phase timing: lobby=${CONFIG.PHASE_DURATION.lobby}s, night=${CONFIG.PHASE_DURATION.night}s, day=${CONFIG.PHASE_DURATION.day}s, vote=${CONFIG.PHASE_DURATION.vote}s`);
    console.log(`Tick interval: ${CONFIG.TICK_INTERVAL}s\n`);

    // Load test agents
    await this.loadAgents();
  }

  async loadAgents() {
    console.log(`Loading ${CONFIG.AGENT_COUNT} agents with unique souls...\n`);
    
    const agentFolders = ['TestAgentA', 'TestAgentB', 'TestAgentC', 'TestAgentD', 'TestAgentE', 'TestAgentF', 
                         'TestAgentG', 'TestAgentH', 'TestAgentI', 'TestAgentJ', 'TestAgentK', 'TestAgentL'];
    
    for (let i = 0; i < CONFIG.AGENT_COUNT; i++) {
      const folder = agentFolders[i];
      const soul = AGENT_SOULS[i % AGENT_SOULS.length];
      
      const agent = new AsyncAgent(folder, soul.name, soul.soul);
      await agent.load();
      this.agents.push(agent);
      
      console.log(`  ✓ ${soul.name} (${folder}) — "${soul.soul.split('\n')[0].slice(0, 50)}..."`);
    }
    
    console.log(`\n✓ Loaded ${this.agents.length} agents\n`);
  }

  async createGame() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  CREATING ASYNC GAME');
    console.log('═══════════════════════════════════════════════════════\n');

    // Create pod via API
    const res = await fetch(`${CONFIG.BASE_URL}/api/v1/pods`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.GM_API_SECRET}`,
      },
      body: JSON.stringify({
        entry_fee: CONFIG.ENTRY_FEE,
        gm_wallet: this.gmWallet,
        moltbook_mode: 'mock',
        submolt: 'mockmoltbook',
      }),
    });

    const data = await res.json();
    if (!data.pod?.id) {
      throw new Error(`Failed to create pod: ${JSON.stringify(data)}`);
    }

    this.podId = data.pod.id;
    this.podNumber = data.pod.pod_number;
    console.log(`✓ Pod created: ${this.podId}`);
    console.log(`  Pod #${this.podNumber}\n`);

    // Create Moltbook post (with pod number in title)
    await this.createMoltbookPost();

    // Update pod with the moltbook post ID
    if (this.postId) {
      await fetch(`${CONFIG.BASE_URL}/api/v1/pods/${this.podId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CONFIG.GM_API_SECRET}`,
        },
        body: JSON.stringify({
          moltbook_post_id: this.postId,
        }),
      });
    }

    // Set phase timing
    this.currentPhase = 'lobby';
    this.phaseStartTime = Date.now();
    this.phaseDeadline = Date.now() + CONFIG.PHASE_DURATION.lobby * 1000;

    return this.podId;
  }

  async createMoltbookPost() {
    const announcement = `🦞 **MOLTMOB POD #${this.podNumber}** 🦞

Testing async gameplay with AI sub-agents!

**How to Join:**
Pay 0.1 SOL via x402 with memo: moltmob:join:${this.podId}:{YourName}

**Phase Timing (accelerated):**
- Lobby: ${CONFIG.PHASE_DURATION.lobby}s
- Night: ${CONFIG.PHASE_DURATION.night}s
- Day: ${CONFIG.PHASE_DURATION.day}s
- Vote: ${CONFIG.PHASE_DURATION.vote}s

EXFOLIATE! 🦞`;

    const res = await fetch(`${CONFIG.MOLTBOOK_API}/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.MOCK_API_SECRET}`,
      },
      body: JSON.stringify({
        title: `🦞 MoltMob Pod #${this.podNumber}`,
        content: announcement,
        submolt_id: 'mockmoltbook',
        author_name: 'MoltMob_GM',
      }),
    });

    const data = await res.json();
    this.postId = data.post?.id || data.id;
    console.log(`✓ Moltbook post created: ${this.postId}\n`);
  }

  async joinAgents() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  AGENTS JOINING');
    console.log('═══════════════════════════════════════════════════════\n');

    const connection = new Connection(CONFIG.SOLANA_RPC, 'confirmed');

    for (const agent of this.agents) {
      try {
        // Pay entry fee
        const tx = new Transaction();
        tx.add(
          SystemProgram.transfer({
            fromPubkey: agent.keypair.publicKey,
            toPubkey: new PublicKey(this.gmWallet),
            lamports: CONFIG.ENTRY_FEE,
          }),
          createMemoInstruction(`moltmob:join:${this.podId}:${agent.displayName}`)
        );

        const sig = await sendAndConfirmTransaction(connection, tx, [agent.keypair]);
        
        // Call join API
        const joinRes = await fetch(`${CONFIG.BASE_URL}/api/v1/pods/${this.podId}/join`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-wallet-pubkey': agent.wallet,
          },
          body: JSON.stringify({
            tx_signature: sig,
            memo: `moltmob:join:${this.podId}:${agent.displayName}`,
            moltbook_username: agent.displayName,
          }),
        });

        const joinData = await joinRes.json();
        agent.playerId = joinData.player?.id;
        agent.agentId = joinData.player?.agent_id || joinData.agent?.id;

        console.log(`  ✓ ${agent.displayName} joined (tx: ${sig.slice(0, 12)}...)`);

        // Post join message to thread
        await this.postComment(agent, `${agent.displayName} has entered the pod! 🦞`);
        
        await this.sleep(500);
      } catch (err) {
        console.log(`  ✗ ${agent.displayName}: ${err.message?.slice(0, 50) || err}`);
      }
    }

    console.log(`\n✓ ${this.agents.filter(a => a.playerId).length} agents joined\n`);
  }

  async runGame() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  STARTING ASYNC GAME LOOP');
    console.log('═══════════════════════════════════════════════════════\n');

    // Transition to night phase (skip lobby since agents already joined)
    await this.transitionToNight();

    // Main game loop
    while (!this.gameEnded) {
      await this.tick();
      await this.sleep(CONFIG.TICK_INTERVAL * 1000);
    }

    console.log('\n🎮 Game complete!\n');
  }

  async tick() {
    const now = Date.now();
    const phaseExpired = now >= this.phaseDeadline;
    const timeLeft = Math.max(0, Math.ceil((this.phaseDeadline - now) / 1000));

    process.stdout.write(`\r[${this.currentPhase.toUpperCase()} R${this.currentRound}] ${timeLeft}s remaining...`);

    // Process current phase
    switch (this.currentPhase) {
      case 'night':
        await this.processNightPhase(phaseExpired);
        break;
      case 'day':
        await this.processDayPhase(phaseExpired);
        break;
      case 'vote':
        await this.processVotePhase(phaseExpired);
        break;
    }
  }

  async processNightPhase(phaseExpired) {
    // Check if all agents have acted
    const alive = this.agents.filter(a => a.isAlive);
    const acted = alive.filter(a => a.hasActedThisPhase);

    // Prompt agents who haven't acted
    for (const agent of alive) {
      if (!agent.hasActedThisPhase && Math.random() < 0.3) { // 30% chance to act each tick
        await this.agentNightAction(agent);
      }
    }

    if (phaseExpired || acted.length >= alive.length) {
      console.log('\n');
      await this.resolveNightPhase();
    }
  }

  async agentNightAction(agent) {
    const action = agent.role === 'clawboss' 
      ? this.chooseKillTarget(agent)
      : { action: 'sleep', target: null };

    // Create encrypted action
    const payload = JSON.stringify({ type: 'night_action', ...action });
    const encrypted = this.encryptForGM(agent, payload);
    
    // Post to thread
    const msg = `🔐 [R${this.currentRound}GN:${encrypted.nonceB64}:${encrypted.ciphertextB64}]`;
    await this.postComment(agent, msg);

    agent.hasActedThisPhase = true;
    agent.lastAction = action;

    if (agent.role === 'clawboss' && action.target) {
      console.log(`\n  🌙 ${agent.displayName} (clawboss) targets ${action.target}`);
    }
  }

  chooseKillTarget(agent) {
    const targets = this.agents.filter(a => 
      a.isAlive && 
      a.displayName !== agent.displayName && 
      a.role !== 'clawboss' && 
      a.role !== 'krill'
    );
    
    if (targets.length === 0) return { action: 'sleep', target: null };
    
    const target = targets[Math.floor(Math.random() * targets.length)];
    return { action: 'pinch', target: target.displayName };
  }

  async resolveNightPhase() {
    // Find clawboss action
    const clawboss = this.agents.find(a => a.role === 'clawboss' && a.isAlive);
    let killed = null;

    if (clawboss?.lastAction?.action === 'pinch') {
      killed = this.agents.find(a => a.displayName === clawboss.lastAction.target);
      if (killed) {
        killed.isAlive = false;
        killed.eliminatedBy = 'pinched';
        
        // Update player status in database
        if (killed.playerId) {
          await this.updatePlayerStatus(killed.playerId, false);
        }
        
        // Record elimination immediately (in case game ends)
        const aliveCount = this.agents.filter(a => a.isAlive).length;
        await this.recordEvent('elimination', `${killed.displayName} (${killed.role}) was pinched by the Clawboss`, {
          eliminated: killed.displayName,
          role: killed.role,
          method: 'pinched',
          round: this.currentRound,
          alive_count: aliveCount,
        });
      }
    }

    // Check win condition
    if (await this.checkWinCondition()) return;

    // Transition to day
    await this.transitionToDay(killed);
  }

  async processDayPhase(phaseExpired) {
    // Agents discuss
    const alive = this.agents.filter(a => a.isAlive);
    
    for (const agent of alive) {
      if (Math.random() < 0.15) { // 15% chance to speak each tick
        await this.agentDiscuss(agent);
      }
    }

    if (phaseExpired) {
      console.log('\n');
      await this.transitionToVote();
    }
  }

  async agentDiscuss(agent) {
    // Generate discussion based on personality
    const messages = this.generateDiscussionMessage(agent);
    if (messages) {
      await this.postComment(agent, messages);
    }
  }

  generateDiscussionMessage(agent) {
    const alive = this.agents.filter(a => a.isAlive && a.displayName !== agent.displayName);
    const target = alive[Math.floor(Math.random() * alive.length)];
    
    // Simple personality-based messages
    const templates = {
      'SuspiciousShrimp': [
        `${target?.displayName} has been awfully quiet... suspicious.`,
        `I don't trust anyone here. Especially not ${target?.displayName}.`,
        `Something's not right...`,
      ],
      'FriendlyCrab': [
        `Hey everyone! Let's work together! 🦀`,
        `I believe in us! We can find the Moltbreakers!`,
        `${target?.displayName} seems trustworthy to me! 😊`,
      ],
      'LogicalLobster': [
        `Analyzing voting patterns...`,
        `The probability suggests ${target?.displayName} warrants investigation.`,
        `Let's examine the evidence objectively.`,
      ],
      'ChaoticClam': [
        `WAIT I changed my mind!`,
        `Maybe it's ${target?.displayName}? Or maybe NOT?!`,
        `I have NO IDEA what's happening but I LOVE IT!`,
      ],
      'SilentStar': [
        `...`,
        `Watch carefully.`,
        `The truth reveals itself.`,
      ],
      'AggressiveAngler': [
        `${target?.displayName}! Explain yourself NOW!`,
        `Why are you so quiet?! SUSPICIOUS!`,
        `I'm calling you out! What's your game?!`,
      ],
      'DiplomaticDolphin': [
        `Let's hear everyone's perspective.`,
        `Perhaps we should consider all the evidence before voting.`,
        `I think we can reach a consensus here.`,
      ],
      'MischievousManta': [
        `Ha! You think I'm the Clawboss? That's hilarious! 😄`,
        `Plot twist: what if it's actually the person you least suspect?`,
        `This is fun! ...but also serious. Very serious. 🤔`,
      ],
    };

    const agentTemplates = templates[agent.displayName] || templates['FriendlyCrab'];
    return agentTemplates[Math.floor(Math.random() * agentTemplates.length)];
  }

  async processVotePhase(phaseExpired) {
    const alive = this.agents.filter(a => a.isAlive);
    const voted = alive.filter(a => a.hasActedThisPhase);

    // Prompt agents who haven't voted
    for (const agent of alive) {
      if (!agent.hasActedThisPhase && Math.random() < 0.4) { // 40% chance to vote each tick
        await this.agentVote(agent);
      }
    }

    if (phaseExpired || voted.length >= alive.length) {
      console.log('\n');
      await this.resolveVotePhase();
    }
  }

  async agentVote(agent) {
    const targets = this.agents.filter(a => a.isAlive && a.displayName !== agent.displayName);
    const target = targets[Math.floor(Math.random() * targets.length)];

    const payload = JSON.stringify({ type: 'vote', target: target.displayName, round: this.currentRound });
    const encrypted = this.encryptForGM(agent, payload);

    const msg = `🔐 [R${this.currentRound}GM:${encrypted.nonceB64}:${encrypted.ciphertextB64}]`;
    await this.postComment(agent, msg);

    agent.hasActedThisPhase = true;
    agent.lastVote = target.displayName;

    console.log(`\n  🗳️ ${agent.displayName} voted for ${target.displayName}`);
  }

  async resolveVotePhase() {
    // Tally votes
    const votes = new Map();
    for (const agent of this.agents.filter(a => a.isAlive && a.lastVote)) {
      const target = agent.lastVote;
      votes.set(target, (votes.get(target) || 0) + 1);
    }

    // Find most voted
    let maxVotes = 0;
    let eliminated = null;
    for (const [name, count] of votes) {
      if (count > maxVotes) {
        maxVotes = count;
        eliminated = this.agents.find(a => a.displayName === name);
      }
    }

    if (eliminated) {
      eliminated.isAlive = false;
      eliminated.eliminatedBy = 'cooked';
      
      // Update player status in database
      if (eliminated.playerId) {
        await this.updatePlayerStatus(eliminated.playerId, false);
      }
      
      const aliveCount = this.agents.filter(a => a.isAlive).length;
      console.log(`  🔥 ${eliminated.displayName} (${eliminated.role}) was COOKED with ${maxVotes} votes!\n`);
      await this.postComment(null, `🔥 COOKED! ${eliminated.displayName} received ${maxVotes} votes and has been eliminated!`);
      
      // Record vote result
      const voteResults = {};
      for (const [name, count] of votes) {
        voteResults[name] = count;
      }
      await this.recordEvent('vote_result', `${eliminated.displayName} (${eliminated.role}) was cooked with ${maxVotes} votes`, {
        eliminated: eliminated.displayName,
        role: eliminated.role,
        votes: maxVotes,
        vote_tally: voteResults,
        round: this.currentRound,
        alive_count: aliveCount,
      });
      
      // Update boil meter
      await this.updatePodState({ boil_meter: Math.round((1 - aliveCount / this.agents.length) * 100) });
    }

    // Check win condition
    if (await this.checkWinCondition()) return;

    // Next round
    await this.transitionToNight();
  }

  async checkWinCondition() {
    const alive = this.agents.filter(a => a.isAlive);
    const moltbreakers = alive.filter(a => a.role === 'clawboss' || a.role === 'krill');
    const loyalists = alive.filter(a => a.role === 'initiate' || a.role === 'shellguard');

    if (moltbreakers.length === 0) {
      await this.endGame('pod', 'All Moltbreakers eliminated');
      return true;
    }

    if (moltbreakers.length >= loyalists.length) {
      await this.endGame('clawboss', 'Moltbreakers have majority');
      return true;
    }

    return false;
  }

  async endGame(winner, reason) {
    this.gameEnded = true;

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  GAME OVER');
    console.log('═══════════════════════════════════════════════════════\n');

    const winnerEmoji = winner === 'pod' ? '🏆' : '💀';
    const winnerName = winner === 'pod' ? 'LOYALISTS' : 'MOLTBREAKERS';

    console.log(`  ${winnerEmoji} ${winnerName} WIN! ${reason}\n`);

    // Determine winning team and alive winners
    const isMoltbreakersWin = winner === 'clawboss';
    const winningTeam = this.agents.filter(a => {
      const isMoltbreaker = a.role === 'clawboss' || a.role === 'krill';
      return isMoltbreakersWin ? isMoltbreaker : !isMoltbreaker;
    });
    const paidWinners = winningTeam.filter(a => a.isAlive && a.playerId); // Only alive winners who joined

    // Role reveal
    console.log('  Role Reveal:');
    for (const agent of this.agents) {
      const emoji = agent.role === 'clawboss' ? '🦞' : agent.role === 'krill' ? '🦐' : '🔵';
      const status = agent.isAlive ? '✓' : '☠️';
      console.log(`    ${status} ${agent.displayName}: ${emoji} ${agent.role}`);
    }

    // Calculate payouts
    const joinedAgents = this.agents.filter(a => a.playerId);
    const totalPot = CONFIG.ENTRY_FEE * joinedAgents.length;
    const rake = Math.floor(totalPot * 0.05); // 5% rake
    const winnerPot = totalPot - rake;
    const payoutPerWinner = paidWinners.length > 0 ? Math.floor(winnerPot / paidWinners.length) : 0;

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  PAYOUTS');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`  Total pot:    ${(totalPot / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    console.log(`  Rake (5%):    ${(rake / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    console.log(`  Winner pot:   ${(winnerPot / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    console.log(`  Winners:      ${paidWinners.length}`);
    console.log(`  Per winner:   ${(payoutPerWinner / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`);

    // Pay out alive winners
    if (paidWinners.length > 0 && payoutPerWinner > 0) {
      const connection = new Connection(CONFIG.SOLANA_RPC, 'confirmed');
      
      for (const winner of paidWinners) {
        try {
          const tx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: this.gmKeypair.publicKey,
              toPubkey: new PublicKey(winner.wallet),
              lamports: payoutPerWinner,
            })
          );
          const txSig = await sendAndConfirmTransaction(connection, tx, [this.gmKeypair]);
          console.log(`  ✓ ${winner.displayName}: ${(payoutPerWinner / LAMPORTS_PER_SOL).toFixed(4)} SOL (tx: ${txSig.slice(0, 12)}...)`);
          
          // Record payout transaction in database (use role-specific type)
          const payoutType = winner.role === 'clawboss' ? 'payout_clawboss' : 
                            winner.role === 'krill' ? 'payout_survival' : 'payout_initiate';
          await this.recordTransaction(payoutType, winner.wallet, payoutPerWinner, txSig, `Winner payout (${winner.role})`);
        } catch (err) {
          console.log(`  ✗ ${winner.displayName}: FAILED - ${err.message}`);
        }
      }
      
      // Record rake transaction (rake stays with GM)
      await this.recordTransaction('rake', this.gmKeypair.publicKey.toBase58(), rake, null, 'House rake (5%)');
    } else {
      console.log('  No payouts (no alive winners or empty pot)');
    }

    // Record game over event
    const roleRevealData = this.agents.map(a => ({
      name: a.displayName,
      role: a.role,
      alive: a.isAlive,
      paid: paidWinners.includes(a),
    }));
    await this.recordEvent('game_end', `${winnerName} WIN! ${reason}`, {
      winner_side: winner,
      reason,
      rounds_played: this.currentRound,
      total_pot: totalPot,
      rake,
      winner_pot: winnerPot,
      winners_count: paidWinners.length,
      payout_per_winner: payoutPerWinner,
      role_reveal: roleRevealData,
    });

    // Update pod status to completed
    await this.updatePodState({
      status: 'completed',
      current_phase: 'ended',
      winner_side: winner,
      boil_meter: 100,
    });

    // Post to thread
    let reveal = `🎮 **GAME OVER**\n\n${winnerEmoji} **${winnerName} WIN!** ${reason}\n\n`;
    reveal += `💰 **Prize Pool:** ${(totalPot / LAMPORTS_PER_SOL).toFixed(2)} SOL\n`;
    reveal += `🏆 **Winners Paid:** ${paidWinners.length} (${(payoutPerWinner / LAMPORTS_PER_SOL).toFixed(4)} SOL each)\n\n`;
    reveal += `🎭 Role Reveal:\n`;
    for (const agent of this.agents) {
      const emoji = agent.role === 'clawboss' ? '🦞' : agent.role === 'krill' ? '🦐' : '🔵';
      const status = agent.isAlive ? '✓' : '☠️';
      const paid = paidWinners.includes(agent) ? ' 💰' : '';
      reveal += `${status} ${agent.displayName}: ${emoji} ${agent.role}${paid}\n`;
    }
    await this.postComment(null, reveal);
  }

  async transitionToNight() {
    this.currentRound++;
    this.currentPhase = 'night';
    this.phaseStartTime = Date.now();
    this.phaseDeadline = Date.now() + CONFIG.PHASE_DURATION.night * 1000;

    // Reset action flags
    for (const agent of this.agents) {
      agent.hasActedThisPhase = false;
      agent.lastAction = null;
    }

    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`  NIGHT ${this.currentRound}`);
    console.log(`═══════════════════════════════════════════════════════\n`);

    // Assign roles on first night
    if (this.currentRound === 1) {
      await this.assignRoles();
      
      // Update pod to active and record roles
      await this.updatePodState({ 
        status: 'active', 
        current_phase: 'night', 
        current_round: this.currentRound 
      });
      
      const roleAssignments = this.agents
        .filter(a => a.playerId)
        .map(a => ({ name: a.displayName, role: a.role }));
      await this.recordEvent('roles_assigned', `Roles assigned to ${roleAssignments.length} players`, { roles: roleAssignments });
    } else {
      // Update phase
      await this.updatePodState({ current_phase: 'night', current_round: this.currentRound });
      await this.recordEvent('phase_change', `Night ${this.currentRound} begins`);
    }

    await this.postComment(null, `🌙 NIGHT ${this.currentRound} — Darkness falls. Submit your encrypted actions.\n\nFormat: \`[R${this.currentRound}GN:nonce:ciphertext]\``);
  }

  async assignRoles() {
    const alive = this.agents.filter(a => a.isAlive);
    const roles = [];
    
    roles.push('clawboss');
    const krillCount = alive.length >= 9 ? 2 : 1;
    for (let i = 0; i < krillCount; i++) roles.push('krill');
    while (roles.length < alive.length) roles.push('initiate');
    
    // Shuffle
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    console.log('  Roles assigned:');
    for (let i = 0; i < alive.length; i++) {
      alive[i].role = roles[i];
      alive[i].team = (roles[i] === 'clawboss' || roles[i] === 'krill') ? 'moltbreaker' : 'loyalist';
      
      const emoji = roles[i] === 'clawboss' ? '🦞' : roles[i] === 'krill' ? '🦐' : '🔵';
      console.log(`    ${alive[i].displayName} → ${emoji} ${roles[i]}`);
      
      // Update player role in database
      if (alive[i].playerId) {
        await this.updatePlayerRole(alive[i].playerId, roles[i]);
      }
    }
    console.log('');
  }

  async transitionToDay(killed) {
    this.currentPhase = 'day';
    this.phaseStartTime = Date.now();
    this.phaseDeadline = Date.now() + CONFIG.PHASE_DURATION.day * 1000;

    for (const agent of this.agents) {
      agent.hasActedThisPhase = false;
    }

    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`  DAY ${this.currentRound}`);
    console.log(`═══════════════════════════════════════════════════════\n`);

    const aliveCount = this.agents.filter(a => a.isAlive).length;
    const msg = killed 
      ? `☀️ DAY ${this.currentRound} — ${killed.displayName} was found PINCHED at dawn! ${aliveCount} crustaceans remain.`
      : `☀️ DAY ${this.currentRound} — No one was pinched. ${aliveCount} crustaceans remain.`;

    if (killed) {
      console.log(`  💀 ${killed.displayName} (${killed.role}) was PINCHED!\n`);
      // Note: elimination event already recorded in resolveNightPhase
    }

    // Update pod state
    await this.updatePodState({ current_phase: 'day', boil_meter: Math.round((1 - aliveCount / this.agents.length) * 100) });

    await this.postComment(null, msg);
  }

  async transitionToVote() {
    this.currentPhase = 'vote';
    this.phaseStartTime = Date.now();
    this.phaseDeadline = Date.now() + CONFIG.PHASE_DURATION.vote * 1000;

    for (const agent of this.agents) {
      agent.hasActedThisPhase = false;
      agent.lastVote = null;
    }

    console.log(`\n═══════════════════════════════════════════════════════`);
    console.log(`  VOTE PHASE — Round ${this.currentRound}`);
    console.log(`═══════════════════════════════════════════════════════\n`);

    // Update pod state
    await this.updatePodState({ current_phase: 'vote' });
    await this.recordEvent('phase_change', `Vote phase begins for round ${this.currentRound}`);

    await this.postComment(null, `🗳️ VOTE PHASE — The discussion ends. It is time to vote!\n\nFormat: \`[R${this.currentRound}GM:nonce:ciphertext]\``);
  }

  encryptForGM(agent, plaintext) {
    const nonce = randomBytes(24);
    const sharedSecret = x25519.scalarMult(agent.x25519Priv, this.gmX25519Pub);
    const cipher = xchacha20poly1305(sharedSecret, nonce);
    const ciphertext = cipher.encrypt(new TextEncoder().encode(plaintext));

    return {
      nonceB64: Buffer.from(nonce).toString('base64'),
      ciphertextB64: Buffer.from(ciphertext).toString('base64'),
    };
  }

  async postComment(agent, content) {
    if (!this.postId) return;

    try {
      await fetch(`${CONFIG.MOLTBOOK_API}/posts/${this.postId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': agent?.apiKey || CONFIG.MOCK_API_SECRET,
        },
        body: JSON.stringify({
          content,
          author_name: agent?.displayName || 'MoltMob_GM',
        }),
      });
    } catch (err) {
      // Ignore errors
    }
  }

  // ============ POD STATE & EVENT RECORDING ============
  
  async updatePodState(updates) {
    try {
      await fetch(`${CONFIG.BASE_URL}/api/v1/pods/${this.podId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CONFIG.GM_API_SECRET}`,
        },
        body: JSON.stringify(updates),
      });
    } catch (err) {
      console.log(`  ⚠ Failed to update pod state: ${err.message}`);
    }
  }

  async recordEvent(eventType, summary, eventData = {}) {
    try {
      await fetch(`${CONFIG.BASE_URL}/api/v1/pods/${this.podId}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CONFIG.GM_API_SECRET}`,
        },
        body: JSON.stringify({
          event_type: eventType,
          round: this.currentRound,
          phase: this.currentPhase,
          summary,
          event_data: eventData,
        }),
      });
    } catch (err) {
      console.log(`  ⚠ Failed to record event: ${err.message}`);
    }
  }

  async updatePlayerRole(playerId, role) {
    try {
      await fetch(`${CONFIG.BASE_URL}/api/v1/players/${playerId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CONFIG.GM_API_SECRET}`,
        },
        body: JSON.stringify({ role, is_alive: true }),
      });
    } catch (err) {
      // Ignore errors
    }
  }

  async updatePlayerStatus(playerId, isAlive) {
    try {
      await fetch(`${CONFIG.BASE_URL}/api/v1/players/${playerId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CONFIG.GM_API_SECRET}`,
        },
        body: JSON.stringify({ is_alive: isAlive }),
      });
    } catch (err) {
      // Ignore errors
    }
  }

  async recordTransaction(txType, wallet, amountLamports, txSignature, reason = null) {
    try {
      await fetch(`${CONFIG.BASE_URL}/api/v1/pods/${this.podId}/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CONFIG.GM_API_SECRET}`,
        },
        body: JSON.stringify({
          tx_type: txType,
          wallet_to: wallet,
          amount: amountLamports,
          tx_signature: txSignature,
          reason,
          round: this.currentRound,
        }),
      });
    } catch (err) {
      // Ignore errors
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============ ASYNC AGENT CLASS ============
class AsyncAgent {
  constructor(folder, displayName, soul) {
    this.folder = folder;
    this.displayName = displayName;
    this.soul = soul;
    this.wallet = null;
    this.keypair = null;
    this.apiKey = null;
    this.agentId = null;
    this.playerId = null;
    this.role = null;
    this.team = null;
    this.isAlive = true;
    this.hasActedThisPhase = false;
    this.lastAction = null;
    this.lastVote = null;
    this.x25519Priv = null;
    this.x25519Pub = null;
  }

  async load() {
    const basePath = join(__dirname, 'live-agents', this.folder);
    
    // Load wallet
    const walletPath = join(basePath, 'wallet.json');
    const walletData = JSON.parse(readFileSync(walletPath, 'utf-8'));
    this.keypair = Keypair.fromSecretKey(Uint8Array.from(walletData.secretKey));
    this.wallet = this.keypair.publicKey.toBase58();

    // Load state (API key)
    const statePath = join(basePath, 'state.json');
    if (existsSync(statePath)) {
      const state = JSON.parse(readFileSync(statePath, 'utf-8'));
      this.apiKey = state.apiKey;
      this.agentId = state.agentId;
    }

    // Derive X25519 keys
    const edPriv = this.keypair.secretKey.slice(0, 32);
    this.x25519Priv = ed25519ToX25519Private(edPriv);
    this.x25519Pub = ed25519ToX25519Public(this.keypair.publicKey.toBytes());
  }
}

// ============ CRYPTO HELPERS ============
function ed25519ToX25519Private(edPriv) {
  const hash = sha512(edPriv);
  const scalar = new Uint8Array(hash.slice(0, 32));
  scalar[0] &= 248;
  scalar[31] &= 127;
  scalar[31] |= 64;
  return scalar;
}

function ed25519ToX25519Public(edPub) {
  return ed25519.utils.toMontgomery(edPub);
}

// ============ MAIN ============
async function main() {
  const manager = new AsyncGameManager();
  
  try {
    await manager.initialize();
    await manager.createGame();
    await manager.joinAgents();
    await manager.runGame();
  } catch (err) {
    console.error('\nError:', err);
    process.exit(1);
  }
}

main();
