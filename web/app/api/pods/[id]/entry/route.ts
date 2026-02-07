// MoltMob Pod Entry API - x402 Payment Required
// Returns 402 Payment Required with PayAI-compatible requirements
// POST /api/pods/[id]/entry - Request entry (returns 402 with requirements)
// POST /api/pods/[id]/entry with X-PAYMENT header - Submit payment proof

import { NextRequest, NextResponse } from 'next/server';
import {
  createPaymentRequirements,
  parsePaymentHeader,
  verifyPaymentViaPayAI,
  settlePaymentViaPayAI,
  getPendingPayment,
  completePayment,
} from '@/lib/payment/x402-payai';

const ENTRY_FEE_LAMPORTS = 100_000_000; // 0.1 SOL
const GM_WALLET = process.env.GM_WALLET_ADDRESS || '3GiW5XgS8xMnc9v9JkJVNRfBdERg7FPAckPcJSvykwUM';

interface EntryRequest {
  playerId: string;
  playerAddress: string;
}

interface EntryResponse {
  success: boolean;
  podId: string;
  playerId?: string;
  message: string;
  transactionHash?: string;
}

// GET - Return payment requirements (402)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: podId } = await params;
  
  const requirements = createPaymentRequirements(
    podId,
    'anonymous',
    ENTRY_FEE_LAMPORTS,
    GM_WALLET
  );

  return NextResponse.json(requirements, { 
    status: 402,
    headers: {
      'X-Payment-Required': 'true',
      'X-Payment-Scheme': 'x402',
    }
  });
}

// POST - Request entry or submit payment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: podId } = await params;
  
  // Check for X-PAYMENT header
  const paymentHeader = request.headers.get('X-PAYMENT');
  
  if (!paymentHeader) {
    // No payment - return 402 with requirements
    const requirements = createPaymentRequirements(
      podId,
      'anonymous',
      ENTRY_FEE_LAMPORTS,
      GM_WALLET
    );

    return NextResponse.json(requirements, { 
      status: 402,
      headers: {
        'X-Payment-Required': 'true',
        'X-Payment-Scheme': 'x402',
      }
    });
  }

  // Parse payment header
  const payment = parsePaymentHeader(paymentHeader);
  if (!payment) {
    return NextResponse.json(
      { error: 'Invalid X-PAYMENT header format' },
      { status: 400 }
    );
  }

  // Verify amount matches
  const amount = parseInt(payment.amount, 10);
  if (amount !== ENTRY_FEE_LAMPORTS) {
    return NextResponse.json(
      { error: `Invalid amount. Expected ${ENTRY_FEE_LAMPORTS} lamports` },
      { status: 400 }
    );
  }

  // Verify address matches GM wallet
  if (payment.address !== GM_WALLET) {
    return NextResponse.json(
      { error: 'Invalid payment address' },
      { status: 400 }
    );
  }

  try {
    // Get request body for player info
    const body: EntryRequest = await request.json().catch(() => ({ 
      playerId: 'anonymous',
      playerAddress: payment.address 
    }));

    // Verify payment via PayAI facilitator
    const payload = Buffer.from(JSON.stringify({
      podId,
      playerId: body.playerId,
      amount: ENTRY_FEE_LAMPORTS,
      to: GM_WALLET,
    })).toString('base64');

    const verifyResult = await verifyPaymentViaPayAI(
      payment.authorization,
      payload,
      'solana-devnet'
    );

    if (!verifyResult.valid) {
      return NextResponse.json(
        { error: `Payment verification failed: ${verifyResult.error}` },
        { status: 402 }
      );
    }

    // Settle payment
    const settleResult = await settlePaymentViaPayAI(
      payment.authorization,
      payload,
      'solana-devnet'
    );

    if (!settleResult.success) {
      return NextResponse.json(
        { error: `Payment settlement failed: ${settleResult.error}` },
        { status: 402 }
      );
    }

    // Payment successful - grant entry
    const response: EntryResponse = {
      success: true,
      podId,
      playerId: body.playerId,
      message: 'Payment verified and settled. Welcome to the pod!',
      transactionHash: settleResult.transactionHash,
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Entry processing error:', error);
    return NextResponse.json(
      { error: 'Failed to process entry payment' },
      { status: 500 }
    );
  }
}

// OPTIONS - CORS preflight
export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-PAYMENT, X-Payment-Scheme',
    },
  });
}
