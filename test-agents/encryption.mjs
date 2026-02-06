// ── Encryption Engine (JavaScript/ESM version) ──
// Duplicated here for standalone test script usage
// See web/lib/game/encryption.ts for source of truth

import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes } from '@noble/hashes/utils.js';

export const PADDED_LENGTH = 256;
export const NONCE_LENGTH = 24;
export const TAG_LENGTH = 16;
export const ENCRYPTED_LENGTH = NONCE_LENGTH + PADDED_LENGTH + TAG_LENGTH;

export const CONSTANTS = {
  PADDED_LENGTH,
  NONCE_LENGTH,
  TAG_LENGTH,
  ENCRYPTED_LENGTH,
};

export function ed25519ToX25519Pub(ed25519PubKey) {
  const x25519Key = ed25519.utils.toMontgomery(ed25519PubKey);
  let isAllZero = true;
  for (let i = 0; i < x25519Key.length; i++) {
    if (x25519Key[i] !== 0) {
      isAllZero = false;
      break;
    }
  }
  if (isAllZero) {
    throw new Error('Invalid Ed25519 key: converts to all-zero X25519 key');
  }
  return x25519Key;
}

export function ed25519ToX25519Priv(ed25519PrivKey) {
  if (typeof ed25519.utils.toMontgomerySecret === 'function') {
    return ed25519.utils.toMontgomerySecret(ed25519PrivKey);
  }
  throw new Error('toMontgomerySecret not available — upgrade @noble/curves');
}

export function padPlaintext(data) {
  if (data.length > PADDED_LENGTH - 4) {
    throw new Error(`Plaintext too long: ${data.length} bytes (max ${PADDED_LENGTH - 4})`);
  }
  const padded = new Uint8Array(PADDED_LENGTH);
  const view = new DataView(padded.buffer);
  view.setUint32(0, data.length, false);
  padded.set(data, 4);
  return padded;
}

export function unpadPlaintext(padded) {
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

export function computeSharedSecret(myPrivKey, theirPubKey) {
  return x25519.getSharedSecret(myPrivKey, theirPubKey);
}

export function generateNonce() {
  return randomBytes(NONCE_LENGTH);
}

export function encryptMessage(sharedSecret, plaintext) {
  try {
    const nonce = generateNonce();
    const padded = padPlaintext(plaintext);
    const cipher = xchacha20poly1305(sharedSecret, nonce);
    const ciphertext = cipher.encrypt(padded);
    const result = new Uint8Array(nonce.length + ciphertext.length);
    result.set(nonce, 0);
    result.set(ciphertext, nonce.length);
    return result;
  } catch (err) {
    console.error('Encryption failed:', err);
    return null;
  }
}

export function decryptMessage(sharedSecret, encrypted) {
  const expectedLength = NONCE_LENGTH + PADDED_LENGTH + TAG_LENGTH;
  if (encrypted.length !== expectedLength) {
    console.error(`Invalid encrypted length: ${encrypted.length} (expected ${expectedLength})`);
    return null;
  }

  const nonce = encrypted.slice(0, NONCE_LENGTH);
  const ciphertext = encrypted.slice(NONCE_LENGTH);

  try {
    const cipher = xchacha20poly1305(sharedSecret, nonce);
    const padded = cipher.decrypt(ciphertext);
    return unpadPlaintext(padded);
  } catch (err) {
    return null;
  }
}

export function encryptRoleAssignment(sharedSecret, role, roleDescription) {
  const message = JSON.stringify({
    type: 'role_assignment',
    role,
    description: roleDescription,
    timestamp: Date.now(),
  });
  const plaintext = new TextEncoder().encode(message);
  return encryptMessage(sharedSecret, plaintext);
}

export function decryptRoleAssignment(sharedSecret, encrypted) {
  const decrypted = decryptMessage(sharedSecret, encrypted);
  if (!decrypted) return null;

  try {
    const message = JSON.parse(new TextDecoder().decode(decrypted));
    if (message.type !== 'role_assignment') {
      return null;
    }
    return { role: message.role, description: message.description };
  } catch (err) {
    return null;
  }
}
