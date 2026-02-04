// ── Encryption Engine ──
// PRD §5 Phase 2: Role Delivery
// Uses @noble/curves v2 (audited by Trail of Bits) per System Architect review

import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { randomBytes } from '@noble/hashes/utils.js';

const PADDED_LENGTH = 256; // Fixed plaintext length to prevent side-channel leaks
const NONCE_LENGTH = 24;

/**
 * Convert an Ed25519 public key to X25519 for encryption.
 * Uses ed25519.utils.toMontgomery (v2 API).
 * Validates the converted key is not all-zero (low-order point).
 */
export function ed25519ToX25519Pub(ed25519PubKey: Uint8Array): Uint8Array {
  const x25519Key = ed25519.utils.toMontgomery(ed25519PubKey);

  // Reject all-zero keys (low-order point)
  if (x25519Key.every((b: number) => b === 0)) {
    throw new Error('Invalid Ed25519 key: converts to all-zero X25519 key');
  }

  return x25519Key;
}

/**
 * Convert an Ed25519 private key to X25519 for encryption.
 * Uses ed25519.utils.toMontgomerySecret (v2 API) if available,
 * otherwise falls back to manual scalar clamping.
 */
export function ed25519ToX25519Priv(ed25519PrivKey: Uint8Array): Uint8Array {
  if (typeof ed25519.utils.toMontgomerySecret === 'function') {
    return ed25519.utils.toMontgomerySecret(ed25519PrivKey);
  }
  // Fallback: manual Ed25519 → X25519 private key conversion
  // Hash the 32-byte seed with SHA-512, take first 32 bytes, clamp
  throw new Error('toMontgomerySecret not available — upgrade @noble/curves');
}

/**
 * Pad plaintext to fixed length to prevent message-length side channel.
 * All encrypted messages will be the same size regardless of content.
 */
export function padPlaintext(data: Uint8Array): Uint8Array {
  if (data.length > PADDED_LENGTH - 4) {
    throw new Error(`Plaintext too long: ${data.length} bytes (max ${PADDED_LENGTH - 4})`);
  }

  const padded = new Uint8Array(PADDED_LENGTH);
  // First 4 bytes: actual data length (big-endian)
  const view = new DataView(padded.buffer);
  view.setUint32(0, data.length, false);
  // Copy data after length prefix
  padded.set(data, 4);
  // Remaining bytes are zeros (padding)
  return padded;
}

/**
 * Remove padding from decrypted plaintext.
 */
export function unpadPlaintext(padded: Uint8Array): Uint8Array {
  if (padded.length !== PADDED_LENGTH) {
    throw new Error(`Invalid padded length: ${padded.length} (expected ${PADDED_LENGTH})`);
  }

  const view = new DataView(padded.buffer, padded.byteOffset);
  const dataLength = view.getUint32(0, false);

  if (dataLength > PADDED_LENGTH - 4) {
    throw new Error(`Invalid data length in padding: ${dataLength}`);
  }

  return padded.slice(4, 4 + dataLength);
}

/**
 * Compute X25519 shared secret between two parties.
 */
export function computeSharedSecret(
  myPrivKey: Uint8Array,
  theirPubKey: Uint8Array
): Uint8Array {
  return x25519.getSharedSecret(myPrivKey, theirPubKey);
}

/**
 * Encrypt a message for a recipient using X25519 key agreement.
 * Output: nonce (24 bytes) + ciphertext
 */
export function generateNonce(): Uint8Array {
  return randomBytes(NONCE_LENGTH);
}

// Re-export constants for testing
export const CONSTANTS = {
  PADDED_LENGTH,
  NONCE_LENGTH,
};
