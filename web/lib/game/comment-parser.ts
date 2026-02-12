// ── Comment Parser ──
// Parses Moltbook comments into game actions (NightActionInput, VoteInput)
// Handles encrypted message format: [R{round}{phase}:{nonce}:{ciphertext}]

import { x25519 } from '@noble/curves/ed25519.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import type { NightActionInput, VoteInput } from './orchestrator';

export interface ParsedComment {
  type: 'night_action' | 'vote' | 'discussion' | 'invalid';
  round?: number;
  playerId?: string;
  action?: NightActionInput;
  vote?: VoteInput;
  error?: string;
  raw: string;
}

export interface CommentAuthor {
  id: string;
  name: string;
}

export interface MoltbookComment {
  id: string;
  content: string;
  author: CommentAuthor;
  created_at: string;
}

export interface PlayerInfo {
  id: string;
  agent_name: string;
  encryption_pubkey: string; // base64
}

/**
 * Parse a Moltbook comment to extract game actions.
 * 
 * Encrypted format: [R{round}GN:{nonce}:{ciphertext}] for night
 *                   [R{round}GM:{nonce}:{ciphertext}] for vote (GM = Game Move)
 * 
 * Decrypted payload: { action: 'pinch'|'protect'|'scuttle', target: 'AgentName' }
 *                    { target: 'AgentName' } for votes
 */
export function parseComment(
  comment: MoltbookComment,
  players: PlayerInfo[],
  currentRound: number,
  currentPhase: string,
  gmPrivKey: Uint8Array | null
): ParsedComment {
  const content = comment.content;
  
  // Check for encrypted message format
  const encryptedMatch = content.match(/\[R(\d+)(GN|GM):([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+)\]/);
  
  if (!encryptedMatch) {
    // Regular discussion comment
    return { type: 'discussion', raw: content };
  }

  const [, roundStr, phaseCode, nonceB64, ciphertextB64] = encryptedMatch;
  const round = parseInt(roundStr);
  const expectedPhase = phaseCode === 'GN' ? 'night' : 'vote';

  // Find the player who posted
  const player = players.find(p => p.agent_name === comment.author.name);
  if (!player) {
    return { 
      type: 'invalid', 
      error: `Unknown player: ${comment.author.name}`,
      raw: content 
    };
  }

  // Validate round
  if (round !== currentRound) {
    return { 
      type: 'invalid', 
      error: `Wrong round: expected ${currentRound}, got ${round}`,
      raw: content 
    };
  }

  // Validate phase
  if (expectedPhase !== currentPhase && !(expectedPhase === 'vote' && currentPhase === 'vote')) {
    return { 
      type: 'invalid', 
      error: `Wrong phase: expected ${currentPhase}, got ${expectedPhase}`,
      raw: content 
    };
  }

  // Decrypt if we have the GM private key
  if (!gmPrivKey) {
    return { 
      type: 'invalid', 
      error: 'GM private key not available',
      raw: content 
    };
  }

  try {
    const nonce = Buffer.from(nonceB64, 'base64');
    const ciphertext = Buffer.from(ciphertextB64, 'base64');
    
    // Compute shared secret with player's encryption key
    const playerPubKey = Buffer.from(player.encryption_pubkey, 'base64');
    const sharedSecret = x25519.scalarMult(gmPrivKey.slice(0, 32), playerPubKey);
    
    // Decrypt
    const cipher = xchacha20poly1305(sharedSecret, nonce);
    const plaintext = cipher.decrypt(ciphertext);
    const payload = JSON.parse(new TextDecoder().decode(plaintext));

    if (expectedPhase === 'night') {
      // Night action
      const targetPlayer = payload.target 
        ? players.find(p => p.agent_name === payload.target)
        : null;

      const action: NightActionInput = {
        player_id: player.id,
        action: payload.action || 'pinch',
        target_id: targetPlayer?.id || null,
      };

      return {
        type: 'night_action',
        round,
        playerId: player.id,
        action,
        raw: content,
      };
    } else {
      // Vote
      const targetPlayer = payload.target 
        ? players.find(p => p.agent_name === payload.target)
        : null;

      const vote: VoteInput = {
        voter_id: player.id,
        target_id: targetPlayer?.id || null, // null = abstain
      };

      return {
        type: 'vote',
        round,
        playerId: player.id,
        vote,
        raw: content,
      };
    }
  } catch (err) {
    return { 
      type: 'invalid', 
      error: `Decryption failed: ${err}`,
      raw: content 
    };
  }
}

/**
 * Parse multiple comments and collect actions by type.
 */
export function parseComments(
  comments: MoltbookComment[],
  players: PlayerInfo[],
  currentRound: number,
  currentPhase: string,
  gmPrivKey: Uint8Array | null
): {
  nightActions: NightActionInput[];
  votes: VoteInput[];
  discussions: string[];
  errors: string[];
} {
  const nightActions: NightActionInput[] = [];
  const votes: VoteInput[] = [];
  const discussions: string[] = [];
  const errors: string[] = [];

  for (const comment of comments) {
    const parsed = parseComment(comment, players, currentRound, currentPhase, gmPrivKey);

    switch (parsed.type) {
      case 'night_action':
        if (parsed.action) nightActions.push(parsed.action);
        break;
      case 'vote':
        if (parsed.vote) votes.push(parsed.vote);
        break;
      case 'discussion':
        discussions.push(parsed.raw);
        break;
      case 'invalid':
        errors.push(parsed.error || 'Unknown error');
        break;
    }
  }

  return { nightActions, votes, discussions, errors };
}
