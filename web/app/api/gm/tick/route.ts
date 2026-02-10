/**
 * GM Tick Endpoint — Called by cron every 10 minutes
 * 
 * Processes all active live games:
 * - Polls Moltbook for new comments
 * - Processes encrypted actions/votes
 * - Transitions phases on timeout
 * - Sends reminders
 */

import { NextRequest, NextResponse } from 'next/server';
import { GMOrchestrator } from '@/lib/game/gm-orchestrator';

export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60 seconds for processing

const CRON_SECRET = process.env.CRON_SECRET;
const GM_WALLET = process.env.GM_WALLET_PUBKEY || '';
const GM_API_KEY = process.env.GM_API_SECRET || '';

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
    const orchestrator = new GMOrchestrator(GM_WALLET, GM_API_KEY);
    const result = await orchestrator.tick();

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
