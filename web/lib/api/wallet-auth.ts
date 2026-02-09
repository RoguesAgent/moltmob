// ── Wallet-Based Authentication ──
// Replaces API key auth with wallet signature verification

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { errorResponse } from './auth';

export interface WalletAuthenticatedAgent {
  id: string;
  name: string;
  wallet_pubkey: string;
  encryption_pubkey: string | null;
  moltbook_username: string | null;
  balance: number;
}

/**
 * Extract wallet pubkey from request headers.
 * Expected: x-wallet-pubkey: base58 pubkey
 * Expected: x-wallet-signature: base58 signature of timestamp
 */
export function extractWalletAuth(req: NextRequest): {
  wallet_pubkey: string | null;
  signature: string | null;
  timestamp: string | null;
} {
  const wallet_pubkey = req.headers.get('x-wallet-pubkey');
  const signature = req.headers.get('x-wallet-signature');
  const timestamp = req.headers.get('x-timestamp');
  return { wallet_pubkey, signature, timestamp };
}

/**
 * Verify wallet signature.
 * TODO: Implement actual Ed25519 signature verification
 * For now: trust the headers (mock mode)
 */
export async function verifyWalletSignature(
  wallet_pubkey: string,
  signature: string,
  timestamp: string
): Promise<boolean> {
  // In production: verify Ed25519 signature of timestamp using wallet_pubkey
  // For mock/testing: accept any valid-looking signature
  if (!signature || signature.length < 10) return false;

  // Check timestamp is recent (within 5 minutes)
  const ts = parseInt(timestamp, 10);
  const now = Date.now();
  if (isNaN(ts) || Math.abs(now - ts) > 5 * 60 * 1000) return false;

  return true;
}

/**
 * Authenticate by wallet.
 * Returns agent or creates new one if wallet not seen.
 */
export async function authenticateByWallet(
  req: NextRequest
): Promise<WalletAuthenticatedAgent | NextResponse> {
  const { wallet_pubkey, signature, timestamp } = extractWalletAuth(req);

  if (!wallet_pubkey) {
    return errorResponse('x-wallet-pubkey header required', 401);
  }

  // For write operations, require signature
  if (req.method !== 'GET') {
    if (!signature || !timestamp) {
      return errorResponse('x-wallet-signature and x-timestamp required for POST/PUT', 401);
    }
    const valid = await verifyWalletSignature(wallet_pubkey, signature, timestamp);
    if (!valid) {
      return errorResponse('Invalid wallet signature', 401);
    }
  }

  // Look up or create agent
  let { data: agent, error } = await supabaseAdmin
    .from('agents')
    .select('id, name, wallet_pubkey, moltbook_username, balance')
    .eq('wallet_pubkey', wallet_pubkey)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows, that's OK
    return errorResponse('Database error', 500);
  }

  if (!agent) {
    // Agent doesn't exist - will be created on quicken
    return errorResponse('Agent not registered. POST to /api/v1/quicken to register and join.', 404);
  }

  return agent as WalletAuthenticatedAgent;
}

/**
 * Get or create agent by wallet + moltbook username.
 */
export async function getOrCreateAgent(params: {
  wallet_pubkey: string;
  moltbook_username: string;
  encryption_pubkey?: string;
}): Promise<WalletAuthenticatedAgent> {
  // Try to find existing
  const { data: existing } = await supabaseAdmin
    .from('agents')
    .select('id, name, wallet_pubkey, moltbook_username, balance')
    .eq('wallet_pubkey', params.wallet_pubkey)
    .single();

  if (existing) {
    // Update moltbook_username if changed
    if (existing.moltbook_username !== params.moltbook_username) {
      await supabaseAdmin
        .from('agents')
        .update({ moltbook_username: params.moltbook_username })
        .eq('id', existing.id);
      existing.moltbook_username = params.moltbook_username;
    }
    return existing as WalletAuthenticatedAgent;
  }

  // Create new agent (without encryption_pubkey - column doesn't exist yet)
  const { data: agent, error } = await supabaseAdmin
    .from('agents')
    .insert({
      name: params.moltbook_username,
      wallet_pubkey: params.wallet_pubkey,
      moltbook_username: params.moltbook_username,
      balance: 0,
    })
    .select('id, name, wallet_pubkey, moltbook_username, balance')
    .single();

  if (error || !agent) {
    throw new Error('Failed to create agent: ' + (error?.message || 'unknown'));
  }

  return agent as WalletAuthenticatedAgent;
}

export { errorResponse };
