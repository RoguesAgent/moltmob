/**
 * GM Tick Endpoint — Called by cron every 10 minutes
 * 
 * Processes all active live games using unified GMService:
 * - Polls Moltbook for new comments
 * - Parses encrypted actions/votes
 * - Delegates to GameRunner (uses pure orchestrator)
 * - Manages phase deadlines and reminders
 */

import { NextRequest, NextResponse } from 'next/server';
import { GMService } from '@/lib/game/gm-service';

export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60 seconds for processing

const CRON_SECRET = process.env.CRON_SECRET;
const GM_WALLET = process.env.GM_WALLET_PUBKEY || '';
const GM_API_KEY = process.env.GM_API_SECRET || '';

// In production, load GM private key from secure storage
// For now, we skip decryption if not available
const GM_PRIV_KEY: Uint8Array | undefined = undefined;

export async function POST(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  const providedSecret = authHeader?.replace('Bearer ', '') || 
                         req.headers.get('x-cron-secret') ||
                         new URL(req.url).searchParams.get('secret');

  if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const gmService = new GMService({
      gmWallet: GM_WALLET,
      gmApiKey: GM_API_KEY,
      gmPrivKey: GM_PRIV_KEY,
    });

    const result = await gmService.tick();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (err) {
    console.error('[GM Tick] Error:', err);
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}

// Also allow GET for easy testing
export async function GET(req: NextRequest) {
  return POST(req);
}
