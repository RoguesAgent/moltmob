// ── x402 Payment Integration via PayAI.network ──
// Handles entry fee collection via PayAI x402 facilitator on Solana devnet
// Facilitator URL: https://facilitator.payai.network

const FACILITATOR_URL = 'https://facilitator.payai.network';

export interface X402PaymentRequirement {
  scheme: 'exact';
  network: 'solana-devnet';
  maxAmountRequired: string; // lamports as string
  asset: 'native' | string;  // 'native' for SOL or token address
  payTo: string;           // GM wallet address
  resource: string;        // API endpoint
  description: string;
  mimeType: string;
  maxTimeoutSeconds: number;
  extra?: {
    feePayer?: string;
    [key: string]: unknown;
  };
}

export interface X402PaymentRequirementsResponse {
  x402Version: number;
  error: string;
  accepts: X402PaymentRequirement[];
}

export interface X402PaymentHeader {
  scheme: string;
  network: string;
  address: string;
  amount: string;
  asset: string;
  authorization: string; // base64 encoded signed transaction or auth proof
}

export interface X402VerifyRequest {
  payload: string;         // base64 encoded payment payload
  authorization: string;   // base64 encoded authorization
  network: string;
}

export interface X402VerifyResponse {
  valid: boolean;
  transactionHash?: string;
  error?: string;
}

export interface X402SettleRequest {
  payload: string;
  authorization: string;
  network: string;
}

export interface X402SettleResponse {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

// Track pending payments
const pendingPayments = new Map<string, {
  podId: string;
  playerId: string;
  amount: number;
  requirement: X402PaymentRequirement;
  createdAt: number;
}>();

/**
 * Create x402 payment requirements for pod entry
 * Returns 402-style requirements that the client must fulfill
 */
export function createPaymentRequirements(
  podId: string,
  playerId: string,
  amountLamports: number,
  paymentAddress: string
): X402PaymentRequirementsResponse {
  const requirement: X402PaymentRequirement = {
    scheme: 'exact',
    network: 'solana-devnet',
    maxAmountRequired: amountLamports.toString(),
    asset: 'native', // SOL
    payTo: paymentAddress,
    resource: `https://moltmob.com/api/pods/${podId}/entry`,
    description: `MoltMob Pod #${podId} Entry Fee`,
    mimeType: 'application/json',
    maxTimeoutSeconds: 300,
  };

  // Store pending payment
  const paymentId = crypto.randomUUID();
  pendingPayments.set(paymentId, {
    podId,
    playerId,
    amount: amountLamports,
    requirement,
    createdAt: Date.now(),
  });

  // Clean old payments
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, data] of Array.from(pendingPayments.entries())) {
    if (data.createdAt < cutoff) {
      pendingPayments.delete(id);
    }
  }

  return {
    x402Version: 1,
    error: 'X-PAYMENT header is required',
    accepts: [{
      ...requirement,
      extra: {
        paymentId,
      },
    }],
  };
}

/**
 * Verify a payment via PayAI facilitator /verify endpoint
 */
export async function verifyPaymentViaPayAI(
  authorization: string,
  payload: string,
  network: string = 'solana-devnet'
): Promise<X402VerifyResponse> {
  try {
    const response = await fetch(`${FACILITATOR_URL}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payload,
        authorization,
        network,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        valid: false,
        error: errorData.error || `Verification failed: ${response.status}`,
      };
    }

    const result: X402VerifyResponse = await response.json();
    return result;
  } catch (error) {
    return {
      valid: false,
      error: `Verification error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Settle a payment via PayAI facilitator /settle endpoint
 */
export async function settlePaymentViaPayAI(
  authorization: string,
  payload: string,
  network: string = 'solana-devnet'
): Promise<X402SettleResponse> {
  try {
    const response = await fetch(`${FACILITATOR_URL}/settle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payload,
        authorization,
        network,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error || `Settlement failed: ${response.status}`,
      };
    }

    const result: X402SettleResponse = await response.json();
    return result;
  } catch (error) {
    return {
      success: false,
      error: `Settlement error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Parse X-PAYMENT header from client request
 */
export function parsePaymentHeader(headerValue: string): X402PaymentHeader | null {
  try {
    // Format: scheme:network:address:amount:asset:authorization (base64)
    const parts = headerValue.split(':');
    if (parts.length !== 6) {
      return null;
    }

    const [scheme, network, address, amount, asset, authorization] = parts;
    
    return {
      scheme,
      network,
      address,
      amount,
      asset,
      authorization: Buffer.from(authorization, 'base64').toString('utf-8'),
    };
  } catch {
    return null;
  }
}

/**
 * Create X-PAYMENT header for client requests
 */
export function createPaymentHeader(
  scheme: string,
  network: string,
  address: string,
  amount: string,
  asset: string,
  authorization: string
): string {
  const encodedAuth = Buffer.from(authorization).toString('base64');
  return `${scheme}:${network}:${address}:${amount}:${asset}:${encodedAuth}`;
}

/**
 * Get pending payment by ID
 */
export function getPendingPayment(paymentId: string) {
  return pendingPayments.get(paymentId) ?? null;
}

/**
 * Complete and remove a pending payment
 */
export function completePayment(paymentId: string): boolean {
  return pendingPayments.delete(paymentId);
}

/**
 * Get list of pending payments (for admin/debug)
 */
export function getAllPendingPayments() {
  return Array.from(pendingPayments.entries()).map(([id, data]) => ({
    id,
    ...data,
  }));
}
