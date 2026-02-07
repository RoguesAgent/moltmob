#!/usr/bin/env node
/**
 * Register test agents in Supabase database
 * Run from web/ directory: node scripts/register-test-agents.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = join(__dirname, '..', '..');

// Load from .env.local
const SUPABASE_URL = 'https://tecywteuhsicdeuygznl.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
  console.error('❌ Set SUPABASE_SERVICE_ROLE_KEY environment variable');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const agents = [
  { name: 'TestAgentA', publicKey: 'ByhwM1fGPpRe5JmqjW9rygzKchWkTt7GWcMvZhVgxAmH' },
  { name: 'TestAgentB', publicKey: '9rCYqtFXiq7ZUQHvBHfuZovTM5PeKUQsGbQ2NVkKSxPh' },
  { name: 'TestAgentC', publicKey: 'HJa6tmRtGBMFW2cHNa5LDomyrsWkBU1aaNEEh5ejokrg' },
  { name: 'TestAgentD', publicKey: '5FLs81g3XkvLwke7xadWKyaDBWMcVMVqH23hDKxPX3qz' },
  { name: 'TestAgentE', publicKey: '2TxeLRpYGUrF9eR4buzboWgDrbLsH3zZ4FNVq7saYptA' },
  { name: 'TestAgentF', publicKey: '6DKhb43NaooV5LvMBQTTvbRB4acHTm3e8ZYyeioHJSTJ' },
];

async function main() {
  console.log('🦀 Registering test agents in Supabase\n');
  console.log(`Database: ${SUPABASE_URL}\n`);

  for (const agentConfig of agents) {
    const agentDir = join(rootDir, 'test-agents', 'live-agents', agentConfig.name);
    
    // Load soul for persona extraction
    let persona = 'Test agent';
    try {
      const soulPath = join(agentDir, 'soul.md');
      const soul = readFileSync(soulPath, 'utf-8');
      const personaMatch = soul.match(/\*\*Persona:\*\*\s*(.+)/);
      if (personaMatch) persona = personaMatch[1].trim();
    } catch {}

    console.log(`Registering: ${agentConfig.name}`);
    console.log(`  Wallet: ${agentConfig.publicKey}`);
    console.log(`  Persona: ${persona}`);

    // Check if already registered
    const { data: existing } = await supabase
      .from('agents')
      .select('id')
      .eq('name', agentConfig.name)
      .single();

    if (existing) {
      console.log(`  ⚠️ Already registered (id: ${existing.id})\n`);
      continue;
    }

    // Register agent
    const { data: agent, error } = await supabase
      .from('agents')
      .insert({
        name: agentConfig.name,
        wallet_pubkey: agentConfig.publicKey,
        email: null,
        api_key_hash: `test-${agentConfig.name}-${Date.now()}`,
        status: 'active',
        moltbook_username: agentConfig.name.toLowerCase(),
        social_preference: 'both',
        reputation_score: 0,
        total_games_played: 0,
        total_games_won: 0,
        verified: true,
      })
      .select()
      .single();

    if (error) {
      console.error(`  ❌ Failed: ${error.message}\n`);
    } else {
      console.log(`  ✅ Registered (id: ${agent.id})\n`);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('✅ All agents registered!');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
