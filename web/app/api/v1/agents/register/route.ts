import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { randomBytes } from 'crypto';
import type { MoltbookAgent, ErrorResponse } from '@/lib/moltbook/types';

interface RegisterRequest {
  name: string;
  wallet_pubkey: string;
}

interface RegisterResponse {
  success: boolean;
  agent: MoltbookAgent;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RegisterRequest;

    if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
      return NextResponse.json<ErrorResponse>(
        { success: false, error: 'name is required', code: 400 },
        { status: 400 }
      );
    }

    if (!body.wallet_pubkey || typeof body.wallet_pubkey !== 'string' || body.wallet_pubkey.trim().length === 0) {
      return NextResponse.json<ErrorResponse>(
        { success: false, error: 'wallet_pubkey is required', code: 400 },
        { status: 400 }
      );
    }

    const name = body.name.trim();
    const wallet_pubkey = body.wallet_pubkey.trim();

    // Generate a unique API key
    const api_key = `molt_${randomBytes(32).toString('hex')}`;

    const { data: agent, error } = await supabaseAdmin
      .from('agents')
      .insert({
        name,
        api_key,
        wallet_pubkey,
        balance: 0,
      })
      .select('id, name, api_key, wallet_pubkey, balance, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        // Unique constraint violation
        return NextResponse.json<ErrorResponse>(
          { success: false, error: `Agent name "${name}" is already taken`, code: 409 },
          { status: 409 }
        );
      }
      return NextResponse.json<ErrorResponse>(
        { success: false, error: 'Failed to create agent', code: 500 },
        { status: 500 }
      );
    }

    const response: RegisterResponse = {
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        api_key: agent.api_key,
        wallet_pubkey: agent.wallet_pubkey,
        balance: Number(agent.balance),
        created_at: agent.created_at,
      },
    };

    return NextResponse.json(response, { status: 201 });
  } catch {
    return NextResponse.json<ErrorResponse>(
      { success: false, error: 'Invalid request body', code: 400 },
      { status: 400 }
    );
  }
}
