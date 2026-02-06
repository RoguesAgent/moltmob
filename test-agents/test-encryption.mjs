#!/usr/bin/env node
/**
 * Test encrypted role delivery with test agents
 * Validates the end-to-end encryption flow
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { Keypair } from '@solana/web3.js';

// Import encryption functions from local module
import {
  ed25519ToX25519Pub,
  ed25519ToX25519Priv,
  computeSharedSecret,
  encryptRoleAssignment,
  decryptRoleAssignment,
  CONSTANTS,
} from './encryption.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const LOGO = `
╔═══════════════════════════════════════════════════════════════╗
║ 🔐 MoltMob Encrypted Role Delivery Test                       ║
║    Testing GM → Player encrypted messaging                    ║
╚═══════════════════════════════════════════════════════════════╝
`;

function loadAgentWallet(agentName) {
  const walletPath = join(__dirname, 'live-agents', agentName, 'wallet.json');
  const wallet = JSON.parse(readFileSync(walletPath, 'utf-8'));
  return {
    name: agentName,
    publicKey: wallet.publicKey,
    secretKey: new Uint8Array(wallet.secretKey),
  };
}

function createGmKeypair() {
  // GM generates a fresh keypair for this game
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey.toBase58(),
    secretKey: keypair.secretKey,
  };
}

// Helper to get Ed25519 public key (last 32 bytes of secret key in Solana format)
function getEd25519PublicKey(secretKey) {
  return secretKey.slice(32, 64);
}

async function runTest() {
  console.log(LOGO);

  // Load test agents
  console.log('📂 Loading test agents...');
  const agentA = loadAgentWallet('TestAgentA');
  const agentB = loadAgentWallet('TestAgentB');
  console.log(`   ✅ ${agentA.name}: ${agentA.publicKey.slice(0, 20)}...`);
  console.log(`   ✅ ${agentB.name}: ${agentB.publicKey.slice(0, 20)}...`);

  // GM creates keypair
  console.log('\n🔐 GM generating game keypair...');
  const gm = createGmKeypair();
  console.log(`   ✅ GM: ${gm.publicKey.slice(0, 20)}...`);

  // Convert Ed25519 keys to X25519
  console.log('\n🔄 Converting Ed25519 → X25519...');
  const gmX25519Priv = ed25519ToX25519Priv(gm.secretKey.slice(0, 32));
  const gmX25519Pub = ed25519ToX25519Pub(getEd25519PublicKey(gm.secretKey));

  const agentAX25519Priv = ed25519ToX25519Priv(agentA.secretKey.slice(0, 32));
  const agentAX25519Pub = ed25519ToX25519Pub(getEd25519PublicKey(agentA.secretKey));

  const agentBX25519Priv = ed25519ToX25519Priv(agentB.secretKey.slice(0, 32));
  const agentBX25519Pub = ed25519ToX25519Pub(getEd25519PublicKey(agentB.secretKey));

  console.log('   ✅ All keys converted');

  // Compute shared secrets
  console.log('\n🔑 Computing shared secrets (ECDH)...');
  const gmToASecret = computeSharedSecret(gmX25519Priv, agentAX25519Pub);
  const gmToBSecret = computeSharedSecret(gmX25519Priv, agentBX25519Pub);

  // Verify symmetry
  const aToGmSecret = computeSharedSecret(agentAX25519Priv, gmX25519Pub);
  const bToGmSecret = computeSharedSecret(agentBX25519Priv, gmX25519Pub);

  const gmToAHex = Buffer.from(gmToASecret).toString('hex');
  const aToGmHex = Buffer.from(aToGmSecret).toString('hex');

  if (gmToAHex !== aToGmHex) {
    console.error('   ❌ Shared secret mismatch!');
    process.exit(1);
  }
  console.log('   ✅ Shared secrets verified (symmetric)');

  // GM encrypts role assignments
  console.log('\n📝 GM encrypting role assignments...');
  const roles = [
    { agent: 'TestAgentA', role: 'clawboss', desc: 'You are the Clawboss! Eliminate one player each night.' },
    { agent: 'TestAgentB', role: 'krill', desc: 'You are a Krill. Find and vote out the Clawboss!' },
  ];

  const encryptedRoles = [];

  // Encrypt for Agent A
  const encryptedA = encryptRoleAssignment(gmToASecret, roles[0].role, roles[0].desc);
  if (!encryptedA) {
    console.error('   ❌ Failed to encrypt role for Agent A');
    process.exit(1);
  }
  encryptedRoles.push({
    agent_id: 'agent_a_uuid',
    encrypted_payload: Buffer.from(encryptedA).toString('base64'),
  });
  console.log(`   ✅ Encrypted role for ${roles[0].agent} (${encryptedA.length} bytes)`);

  // Encrypt for Agent B
  const encryptedB = encryptRoleAssignment(gmToBSecret, roles[1].role, roles[1].desc);
  if (!encryptedB) {
    console.error('   ❌ Failed to encrypt role for Agent B');
    process.exit(1);
  }
  encryptedRoles.push({
    agent_id: 'agent_b_uuid',
    encrypted_payload: Buffer.from(encryptedB).toString('base64'),
  });
  console.log(`   ✅ Encrypted role for ${roles[1].agent} (${encryptedB.length} bytes)`);

  // GM publishes bundled message
  console.log('\n📢 GM publishes bundled role announcement...');
  const bundledMessage = {
    type: 'role_assignments',
    pod_id: 'test-pod-123',
    timestamp: Date.now(),
    assignments: encryptedRoles,
  };
  console.log('   ✅ Bundle created');

  // Agents decrypt their roles
  console.log('\n🔓 Agents decrypting their roles...');

  // Agent A decrypts
  const payloadA = Buffer.from(encryptedRoles[0].encrypted_payload, 'base64');
  const decryptedA = decryptRoleAssignment(aToGmSecret, payloadA);
  if (!decryptedA) {
    console.error('   ❌ Agent A failed to decrypt role!');
    process.exit(1);
  }
  console.log(`   ✅ ${agentA.name} decrypted: ${decryptedA.role.toUpperCase()}`);
  console.log(`      "${decryptedA.description}"`);

  // Agent B decrypts
  const payloadB = Buffer.from(encryptedRoles[1].encrypted_payload, 'base64');
  const decryptedB = decryptRoleAssignment(bToGmSecret, payloadB);
  if (!decryptedB) {
    console.error('   ❌ Agent B failed to decrypt role!');
    process.exit(1);
  }
  console.log(`   ✅ ${agentB.name} decrypted: ${decryptedB.role.toUpperCase()}`);
  console.log(`      "${decryptedB.description}"`);

  // Verify agents cannot decrypt each other's roles
  console.log('\n🛡️  Testing that agents cannot decrypt other roles...');
  const wrongDecryption = decryptRoleAssignment(aToGmSecret, payloadB);
  if (wrongDecryption) {
    console.error('   ❌ Agent A was able to decrypt Agent B\'s role! Security breach!');
    process.exit(1);
  }
  console.log('   ✅ Agent A cannot decrypt Agent B\'s role (authentication failed)');

  // Test tampering detection
  console.log('\n🔒 Testing tampering detection...');
  const tamperedPayload = Buffer.from(payloadA);
  tamperedPayload[50] ^= 0xFF; // Flip some bits
  const tamperedDecryption = decryptRoleAssignment(aToGmSecret, tamperedPayload);
  if (tamperedDecryption) {
    console.error('   ❌ Tampered message was accepted!');
    process.exit(1);
  }
  console.log('   ✅ Tampered message rejected (authentication failed)');

  // Summary
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║ ✅ ALL TESTS PASSED                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  console.log('\nSummary:');
  console.log(`   • Encrypted payload size: ${CONSTANTS.ENCRYPTED_LENGTH} bytes per role`);
  console.log(`   • Shared secrets: 32 bytes (X25519)`);
  console.log(`   • Encryption: xChaCha20-Poly1305`);
  console.log(`   • Key features verified:`);
  console.log(`     - Symmetric key agreement ✓`);
  console.log(`     - Role encryption/decryption ✓`);
  console.log(`     - Isolation (agents can't read others) ✓`);
  console.log(`     - Tamper detection ✓`);

  console.log('\n🦀 Encryption ready for production use!');
}

runTest().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
