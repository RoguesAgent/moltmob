/**
 * Admin Game Control API
 * POST /api/gm/pods/[id]/control
 * 
 * Actions: start, advance, recover, pause, resume, check
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { GameRunner, RunnerConfig } from '@/lib/game/runner';
import { resumeGame } from '@/lib/game/runner-resume';

const GM_API_SECRET = process.env.GM_API_SECRET;
const MOLTBOOK_API_KEY = process.env.MOLTBOOK_API_KEY;

interface ControlRequest {
  action: 'start' | 'advance' | 'recover' | 'pause' | 'resume' | 'check' | 'post';
  data?: Record<string, unknown>;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: podId } = await params;

  // Auth check
  const authHeader = req.headers.get('authorization');
  const providedSecret = authHeader?.replace('Bearer ', '');
  
  if (!GM_API_SECRET || providedSecret !== GM_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: ControlRequest = await req.json();
    const { action, data = {} } = body;

    // Load pod
    const { data: pod, error: podError } = await supabaseAdmin
      .from('game_pods')
      .select('*')
      .eq('id', podId)
      .single();

    if (podError || !pod) {
      return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
    }

    // Execute action
    switch (action) {
      case 'check':
        return await checkPodStatus(podId);

      case 'recover':
        return await recoverPod(podId);

      case 'start':
        return await startGame(podId);

      case 'advance':
        return await forceAdvancePhase(podId, data);

      case 'pause':
        return await pausePod(podId);

      case 'resume':
        return await resumePod(podId);

      case 'post':
        return await postGMMessage(podId, data);

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('[GM Control] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function checkPodStatus(podId: string) {
  const { data: events } = await supabaseAdmin
    .from('gm_events')
    .select('*')
    .eq('pod_id', podId)
    .order('created_at', { ascending: false })
    .limit(10);

  const { data: checkpoint } = await supabaseAdmin
    .from('gm_events')
    .select('details, created_at')
    .eq('pod_id', podId)
    .eq('event_type', 'orchestrator_checkpoint')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({
    podId,
    lastEvents: events,
    lastCheckpoint: checkpoint,
    recoverable: !!checkpoint,
  });
}

async function recoverPod(podId: string) {
  const runnerConfig: RunnerConfig = {
    moltbookService: {
      // Need actual service instance
      createPost: async (title, content) => ({ id: 'temp', content, created_at: new Date().toISOString() }),
      createComment: async (postId, content) => ({ id: 'temp', content, created_at: new Date().toISOString() }),
      pinPost: async () => {},
      publishToThread: async () => [],
    } as any,
  };

  const result = await resumeGame(podId, runnerConfig);

  return NextResponse.json({
    success: result.recovered,
    error: result.error,
    podId,
    gamePostId: result.gamePostId,
  });
}

async function startGame(podId: string) {
  const { data: updated } = await supabaseAdmin
    .from('game_pods')
    .update({ status: 'active', current_phase: 'night', current_round: 1 })
    .eq('id', podId)
    .select()
    .single();

  return NextResponse.json({
    success: true,
    message: 'Game started',
    pod: updated,
  });
}

async function forceAdvancePhase(podId: string, data: Record<string, unknown>) {
  const { data: pod } = await supabaseAdmin
    .from('game_pods')
    .select('*')
    .eq('id', podId)
    .single();

  const currentPhase = pod.current_phase;
  const currentRound = pod.current_round;

  // Phase transitions
  const transitions: Record<string, { phase: string; roundDelta: number }> = {
    night: { phase: 'day', roundDelta: 0 },
    day: { phase: 'vote', roundDelta: 0 },
    vote: { phase: 'night', roundDelta: 1 },
    boil: { phase: 'night', roundDelta: 1 },
    lobby: { phase: 'night', roundDelta: 0 },
  };

  const transition = transitions[currentPhase] || { phase: currentPhase, roundDelta: 0 };
  const nextPhase = (data.targetPhase as string) || transition.phase;
  const nextRound = currentRound + (data.forceRound as number || transition.roundDelta);

  const { data: updated } = await supabaseAdmin
    .from('game_pods')
    .update({
      current_phase: nextPhase,
      current_round: nextRound,
      status: nextPhase === 'completed' ? 'completed' : 'active',
    })
    .eq('id', podId)
    .select()
    .single();

  // Log forced advance
  await supabaseAdmin.from('gm_events').insert({
    pod_id: podId,
    round: nextRound,
    phase: nextPhase,
    event_type: 'phase_forced',
    summary: `GM forced phase advance: ${currentPhase} → ${nextPhase}`,
    details: { from_phase: currentPhase, to_phase: nextPhase, reason: data.reason },
  });

  return NextResponse.json({
    success: true,
    message: `Advanced from ${currentPhase} to ${nextPhase}`,
    pod: updated,
  });
}

async function pausePod(podId: string) {
  await supabaseAdmin
    .from('game_pods')
    .update({ status: 'paused' })
    .eq('id', podId);

  return NextResponse.json({ success: true, message: 'Pod paused' });
}

async function resumePod(podId: string) {
  await supabaseAdmin
    .from('game_pods')
    .update({ status: 'active' })
    .eq('id', podId);

  return NextResponse.json({ success: true, message: 'Pod resumed' });
}

async function postGMMessage(podId: string, data: Record<string, unknown>) {
  const { content, title } = data;

  await supabaseAdmin.from('gm_events').insert({
    pod_id: podId,
    round: data.round || 0,
    phase: data.phase || 'manual',
    event_type: 'gm_manual_post',
    summary: title || 'GM Message',
    details: { content, manual: true },
  });

  return NextResponse.json({ success: true, message: 'GM message logged' });
}
