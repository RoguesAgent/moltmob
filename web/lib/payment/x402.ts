// ── x402 Payment Integration for MoltMob ──
// Handles entry fee collection via x402 protocol on Solana devnet
// Simplified version without @solana/kit dependency

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

const RPC_ENDPOINTS = {
  devnet: 'https://api.devnet.solana.com',
  mainnet: 'https://api.mainnet-beta.solana.com',
};

const pendingPayments = new Map<string, {
  podId: string;
  playerId: string;
  amount: number;
  createdAt: number;
}>();

export function createPaymentRequest(
  podId: string,
  playerId: string,
  amountLamports: number,
  paymentAddress: string
): X402PaymentRequest {
  const paymentId = crypto.randomUUID();
  
  pendingPayments.set(paymentId, {
    podId,
    playerId,
    amount: amountLamports,
    createdAt: Date.now(),
  });
  
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, data] of Array.from(pendingPayments.entries())) {
    if (data.createdAt < cutoff) {
      pendingPayments.delete(id);
    }
  }
  
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

export async function verifyPayment(
  proof: X402PaymentProof,
  expectedAmount: number,
  expectedAddress: string,
  network: 'devnet' | 'mainnet' = 'devnet'
): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch(RPC_ENDPOINTS[network], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [proof.txHash, { commitment: 'confirmed' }],
      }),
    });
    
    const { result } = await response.json();
    
    if (!result) {
      return { valid: false, error: 'Transaction not found' };
    }
    
    if (result.meta?.err) {
      return { valid: false, error: 'Transaction failed' };
    }
    
    // Simplified verification - check transfer in transaction
    const meta = result.meta;
    const message = result.transaction.message;
    
    // Look for transfer to expected address
    const preBalances = meta.preBalances;
    const postBalances = meta.postBalances;
    const accountKeys = message.accountKeys;
    
    let transferFound = false;
    for (let i = 0; i < accountKeys.length; i++) {
      if (accountKeys[i] === expectedAddress) {
        const balanceChange = postBalances[i] - preBalances[i];
        if (balanceChange === expectedAmount) {
          transferFound = true;
        }
      }
    }
    
    if (!transferFound) {
      return { valid: false, error: 'Payment verification failed' };
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, error: String(error) };
  }
}

export function getPendingPayment(paymentId: string) {
  return pendingPayments.get(paymentId) ?? null;
}

export function completePayment(paymentId: string): boolean {
  return pendingPayments.delete(paymentId);
}

export function getPodPaymentAddress(podId: string, network: 'devnet' | 'mainnet'): string {
  if (network === 'devnet') {
    return process.env.X402_DEVNET_WALLET || '11111111111111111111111111111111';
  }
  throw new Error('Mainnet not yet supported');
}

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
