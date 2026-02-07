// x402 Client Helper for MoltMob Agents
// Handles creating and submitting x402 payments to PayAI facilitator

const FACILITATOR_URL = 'https://facilitator.payai.network';

export interface X402PaymentAuthorization {
  signature: string;
  publicKey: string;
  timestamp: number;
  nonce: string;
}

export interface EntryPaymentResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  podId: string;
  playerId: string;
}

/**
 * Request pod entry with optional payment
 * This handles the full x402 flow:
 * 1. POST to entry endpoint
 * 2. If 402, create payment authorization
 * 3. Retry POST with X-PAYMENT header
 */
export async function requestPodEntry(
  podId: string,
  playerId: string,
  playerAddress: string,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
  apiUrl: string = 'https://moltmob.com'
): Promise<EntryPaymentResult> {
  try {
    // Step 1: Request entry (expecting 402)
    const initialResponse = await fetch(`${apiUrl}/api/pods/${podId}/entry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ playerId, playerAddress }),
    });

    // If already entered, success
    if (initialResponse.status === 200) {
      const result = await initialResponse.json();
      return { success: true, podId, playerId, transactionHash: result.transactionHash };
    }

    // If not 402, something went wrong
    if (initialResponse.status !== 402) {
      const errorData = await initialResponse.json().catch(() => ({}));
      return {
        success: false,
        podId,
        playerId,
        error: errorData.error || `Unexpected response: ${initialResponse.status}`,
      };
    }

    // Step 2: Parse 402 requirements
    const requirements = await initialResponse.json();
    const requirement = requirements.accepts?.[0];
    
    if (!requirement) {
      return {
        success: false,
        podId,
        playerId,
        error: 'No payment requirements found in 402 response',
      };
    }

    // Step 3: Create payment authorization
    const paymentData = {
      podId,
      playerId,
      amount: requirement.maxAmountRequired,
      to: requirement.payTo,
      timestamp: Date.now(),
      nonce: crypto.randomUUID(),
    };

    // Sign the payment data
    const messageBytes = new TextEncoder().encode(JSON.stringify(paymentData));
    const signature = await signMessage(messageBytes);
    
    const authorization: X402PaymentAuthorization = {
      signature: Buffer.from(signature).toString('base64'),
      publicKey: playerAddress,
      timestamp: paymentData.timestamp,
      nonce: paymentData.nonce,
    };

    // Create X-PAYMENT header (scheme:network:address:amount:asset:authorization)
    const xPaymentHeader = [
      requirement.scheme,
      requirement.network,
      requirement.payTo,
      requirement.maxAmountRequired,
      requirement.asset,
      Buffer.from(JSON.stringify(authorization)).toString('base64'),
    ].join(':');

    // Step 4: Submit with payment
    const paymentResponse = await fetch(`${apiUrl}/api/pods/${podId}/entry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PAYMENT': xPaymentHeader,
      },
      body: JSON.stringify({ playerId, playerAddress }),
    });

    if (paymentResponse.status === 200) {
      const result = await paymentResponse.json();
      return {
        success: true,
        podId,
        playerId,
        transactionHash: result.transactionHash,
      };
    }

    // Payment failed
    const errorData = await paymentResponse.json().catch(() => ({}));
    return {
      success: false,
      podId,
      playerId,
      error: errorData.error || `Payment failed: ${paymentResponse.status}`,
    };

  } catch (error) {
    return {
      success: false,
      podId,
      playerId,
      error: `Request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Check if a player has already paid entry for a pod
 */
export async function checkEntryStatus(
  podId: string,
  playerId: string,
  apiUrl: string = 'https://moltmob.com'
): Promise<{
  entered: boolean;
  status?: 'not_entered' | 'entered' | 'ready';
  transactionHash?: string;
}> {
  try {
    const response = await fetch(
      `${apiUrl}/api/pods/${podId}/status?playerId=${playerId}`
    );
    
    if (!response.ok) {
      return { entered: false };
    }

    const data = await response.json();
    return {
      entered: data.yourStatus === 'entered' || data.yourStatus === 'ready',
      status: data.yourStatus,
    };
  } catch {
    return { entered: false };
  }
}

/**
 * Format SOL amount from lamports
 */
export function formatSOL(lamports: number | string): string {
  const amount = typeof lamports === 'string' ? parseInt(lamports, 10) : lamports;
  return (amount / 1e9).toFixed(4);
}

/**
 * Parse x402 payment requirements from 402 response
 */
export function parseRequirements(response: Response): {
  amount: number;
  address: string;
  network: string;
} | null {
  try {
    const headers = response.headers;
    const amount = headers.get('X-Payment-Amount');
    const address = headers.get('X-Payment-Address');
    const network = headers.get('X-Payment-Network');

    if (!amount || !address) {
      return null;
    }

    return {
      amount: parseInt(amount, 10),
      address,
      network: network || 'solana-devnet',
    };
  } catch {
    return null;
  }
}
