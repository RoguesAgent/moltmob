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
 * Verify wallet signature (mock mode for now).
 */
export async function verifyWalletSignature(
  wallet_pubkey: string,
  signature: string,
  timestamp: string
): Promise<boolean> {
  if (!signature || signature.length < 10) return false;
  const ts = parseInt(timestamp, 10);
  const now = Date.now();
  if (isNaN(ts) || Math.abs(now - ts) > 5 * 60 * 1000) return false;
  return true;
}

/**
 * Authenticate by wallet.
 */
export async function authenticateByWallet(
  req: NextRequest
): Promise<WalletAuthenticatedAgent | NextResponse> {
  const { wallet_pubkey, signature, timestamp } = extractWalletAuth(req);

  if (!wallet_pubkey) {
    return errorResponse('x-wallet-pubkey header required', 401);
  }

  if (req.method !== 'GET') {
    if (!signature || !timestamp) {
      return errorResponse('x-wallet-signature and x-timestamp required for POST/PUT', 401);
    }
    const valid = await verifyWalletSignature(wallet_pubkey, signature, timestamp);
    if (!valid) {
      return errorResponse('Invalid wallet signature', 401);
    }
  }

  // Look up agent - use only confirmed columns
  let { data: agent, error } = await supabaseAdmin
    .from('agents')
    .select('id, name, wallet_pubkey, balance')
    .eq('wallet_pubkey', wallet_pubkey)
    .single();

  if (error && error.code !== 'PGRST116') {
    return errorResponse('Database error', 500);
  }

  if (!agent) {
    return errorResponse('Agent not registered', 404);
  }

  // Map to interface (moltbook_username not in DB yet)
  return {
    id: agent.id,
    name: agent.name,
    wallet_pubkey: agent.wallet_pubkey,
    encryption_pubkey: null,
    moltbook_username: agent.name, // Use name as fallback
    balance: agent.balance || 0,
  } as WalletAuthenticatedAgent;
}

/**
 * Get or create agent by wallet.
 * Uses only confirmed columns: id, name, wallet_pubkey, balance
 */
export async function getOrCreateAgent(params: {
  wallet_pubkey: string;
  moltbook_username: string;
  encryption_pubkey?: string;
}): Promise<WalletAuthenticatedAgent> {
  // Try to find existing - use only confirmed columns
  const { data: existing } = await supabaseAdmin
    .from('agents')
    .select('id, name, wallet_pubkey, balance')
    .eq('wallet_pubkey', params.wallet_pubkey)
    .single();

  if (existing) {
    // Update name if it changed (store moltbook_username in name field)
    if (existing.name !== params.moltbook_username) {
      await supabaseAdmin
        .from('agents')
        .update({ name: params.moltbook_username })
        .eq('id', existing.id);
      existing.name = params.moltbook_username;
    }
    return {
      id: existing.id,
      name: existing.name,
      wallet_pubkey: existing.wallet_pubkey,
      encryption_pubkey: null,
      moltbook_username: existing.name,
      balance: existing.balance || 0,
    } as WalletAuthenticatedAgent;
  }

  // Create new agent - use only confirmed columns
  const { data: agent, error } = await supabaseAdmin
    .from('agents')
    .insert({
      name: params.moltbook_username,
      wallet_pubkey: params.wallet_pubkey,
      balance: 0,
    })
    .select('id, name, wallet_pubkey, balance')
    .single();

  if (error || !agent) {
    throw new Error('Failed to create agent: ' + (error?.message || 'unknown'));
  }

  return {
    id: agent.id,
    name: agent.name,
    wallet_pubkey: agent.wallet_pubkey,
    encryption_pubkey: null,
    moltbook_username: agent.name,
    balance: agent.balance || 0,
  } as WalletAuthenticatedAgent;
}

export { errorResponse };
