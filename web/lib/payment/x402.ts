// ── x402 Payment Integration for MoltMob ──
// Uses PayAI.network facilitator: https://facilitator.payai.network
// Handles entry fee collection via x402 protocol on Solana devnet

// Re-export from PayAI module
export {
  createPaymentRequirements,
  verifyPaymentViaPayAI,
  settlePaymentViaPayAI,
  parsePaymentHeader,
  createPaymentHeader,
  getPendingPayment,
  completePayment,
  getAllPendingPayments,
} from './x402-payai';

// Legacy exports for backward compatibility
export interface X402Config {
  network: 'devnet' | 'mainnet';
  paymentAddress: string;
  decimals: number;
}

export interface X402PaymentRequest {
  scheme: 'x402';
  version: '1';
  network: 'solana-devnet';
  payment_required: boolean;
  payment: {
    amount: string;
    asset: {
      assetType: 'native' | 'spl';
      address: string;
    };
    requiredConfirmations: number;
    maxWaitSecs: number;
    message: string;
    paymentId: string;
  };
  headers: {
    'X-Payment-Scheme': 'x402';
    'X-Payment-Version': '1';
    'X-Payment-Network': 'solana-devnet';
    'X-Payment-Amount': string;
    'X-Payment-Address': string;
    'X-Payment-Id': string;
    'X-Payment-Message': string;
  };
}

export interface X402PaymentProof {
  txHash: string;
  paymentId: string;
  from: string;
  amount: number;
  timestamp: number;
}

// Legacy function - wraps new PayAI requirements
export function createPaymentRequest(
  podId: string,
  playerId: string,
  amountLamports: number,
  paymentAddress: string
): X402PaymentRequest {
  const paymentId = crypto.randomUUID();
  
  return {
    scheme: 'x402',
    version: '1',
    network: 'solana-devnet',
    payment_required: true,
    payment: {
      amount: amountLamports.toString(),
      asset: {
        assetType: 'native',
        address: paymentAddress,
      },
      requiredConfirmations: 1,
      maxWaitSecs: 300,
      message: `MoltMob Pod Entry Fee: ${amountLamports / 1e9} SOL`,
      paymentId,
    },
    headers: {
      'X-Payment-Scheme': 'x402',
      'X-Payment-Version': '1',
      'X-Payment-Network': 'solana-devnet',
      'X-Payment-Amount': amountLamports.toString(),
      'X-Payment-Address': paymentAddress,
      'X-Payment-Id': paymentId,
      'X-Payment-Message': `MoltMob Pod Entry Fee: ${amountLamports / 1e9} SOL`,
    },
  };
}

// Legacy verify - now uses PayAI facilitator
export async function verifyPayment(
  proof: X402PaymentProof,
  expectedAmount: number,
  expectedAddress: string,
  network: 'devnet' | 'mainnet' = 'devnet'
): Promise<{ valid: boolean; error?: string }> {
  // Import dynamically to avoid circular deps
  const { verifyPaymentViaPayAI } = await import('./x402-payai');
  
  // Convert proof to authorization format expected by PayAI
  const authorization = Buffer.from(JSON.stringify({
    txHash: proof.txHash,
    from: proof.from,
    amount: proof.amount.toString(),
  })).toString('base64');
  
  const payload = Buffer.from(JSON.stringify({
    to: expectedAddress,
    amount: expectedAmount.toString(),
    network,
  })).toString('base64');
  
  const result = await verifyPaymentViaPayAI(authorization, payload, `solana-${network}`);
  return { valid: result.valid, error: result.error };
}

// Helper to format x402 headers for HTTP responses
export function formatX402Headers(request: X402PaymentRequest): Record<string, string> {
  return {
    'X-Payment-Scheme': request.headers['X-Payment-Scheme'],
    'X-Payment-Version': request.headers['X-Payment-Version'],
    'X-Payment-Network': request.headers['X-Payment-Network'],
    'X-Payment-Amount': request.headers['X-Payment-Amount'],
    'X-Payment-Address': request.headers['X-Payment-Address'],
    'X-Payment-Id': request.headers['X-Payment-Id'],
    'X-Payment-Message': request.headers['X-Payment-Message'],
  };
}

// Helper to get payment address
export function getPodPaymentAddress(podId: string, network: 'devnet' | 'mainnet'): string {
  if (network === 'devnet') {
    return process.env.X402_DEVNET_WALLET || '11111111111111111111111111111111';
  }
  throw new Error('Mainnet not yet supported');
}
