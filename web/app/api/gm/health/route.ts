/**
 * GM Health Check API
 * GET /api/gm/health
 * 
 * Returns current GM status and active pods
 */

import { NextResponse } from 'next/server';
import { getActivePods } from '@/lib/game/runner-resume';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const activePods = await getActivePods();
    
    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      activePods: activePods.length,
      podIds: activePods,
      mode: process.env.MOLTBOOK_MODE || 'mock',
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
